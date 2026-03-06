import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { AuditService } from '../../common/audit.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';

/** Unified assessment shape produced by both LiDAR and AI Vision modes */
export interface RoomAssessment {
  roomType: string;
  estimatedDimensions: {
    lengthFt: number;
    widthFt: number;
    heightFt: number;
    sqFt: number;
  };
  features: Array<{
    type: 'door' | 'window' | 'closet' | 'fixture' | 'opening';
    subType?: string;
    location?: string;
    widthFt?: number;
    heightFt?: number;
    condition?: number;
    notes?: string;
  }>;
  flooring?: { type: string; condition?: number };
  ceiling?: { type: string; heightFt?: number; condition?: number };
  walls?: { material: string; condition?: number };
  damageNotes?: string[];
  overallCondition?: number;
  confidence: number;
}

const ROOM_ASSESSMENT_PROMPT = `You are an expert construction site assessor. Analyze these room photos and extract a detailed room assessment.

Return ONLY valid JSON (no markdown, no explanation) in this exact structure:

{
  "roomType": "bedroom | bathroom | kitchen | living_room | dining_room | office | hallway | closet | garage | laundry | utility | basement | attic | other",
  "estimatedDimensions": {
    "lengthFt": 0,
    "widthFt": 0,
    "heightFt": 0,
    "sqFt": 0
  },
  "features": [
    {
      "type": "door | window | closet | fixture | opening",
      "subType": "e.g. interior, exterior, double-hung, sliding, pocket, bifold, walk-in, standard",
      "location": "e.g. north wall, south wall, east wall, west wall",
      "widthFt": 0,
      "heightFt": 0,
      "condition": 1-5,
      "notes": "description of door/window type, material, any damage"
    }
  ],
  "flooring": { "type": "carpet | hardwood | tile | vinyl | laminate | concrete | other", "condition": 1-5 },
  "ceiling": { "type": "drywall | popcorn | coffered | vaulted | drop | exposed | other", "heightFt": 0, "condition": 1-5 },
  "walls": { "material": "drywall | plaster | paneling | brick | concrete | other", "condition": 1-5 },
  "damageNotes": ["List any visible damage: water stains, cracks, mold, holes, etc."],
  "overallCondition": 1-5,
  "confidence": 0.0-1.0
}

Rules:
- Condition scale: 1=severely damaged, 2=significant wear, 3=moderate/normal, 4=good, 5=excellent/new
- Estimate dimensions from visual cues (standard door = 3' wide x 6'8" tall, outlets 12-18" from floor, etc.)
- Count ALL doors and windows visible across all photos
- For confidence: 0.8+ = clear photos with good angles, 0.5-0.8 = partial views, <0.5 = poor visibility
- If you cannot determine a value, use null (don't guess wildly)
- Look for damage indicators: water stains, cracks, peeling, mold, missing trim, damaged flooring
- Identify flooring and ceiling types from visual appearance
- All measurements in feet (US customary)
- Return ONLY the JSON object, nothing else`;

@Injectable()
export class RoomScanService {
  private readonly logger = new Logger(RoomScanService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: ObjectStorageService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  /**
   * Create a room scan from photos (AI Vision mode).
   * Uploads photos to GCS, calls GPT-4o Vision, and persists the result.
   */
  async createFromPhotos(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      projectId: string;
      particleId?: string;
      label?: string;
      notes?: string;
      photos: Array<{ buffer: Buffer; originalname: string; mimetype: string }>;
    },
  ) {
    const { projectId, particleId, label, notes, photos } = payload;

    // Verify project access
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Create scan record in PROCESSING state
    const scan = await this.prisma.roomScan.create({
      data: {
        companyId,
        projectId,
        particleId: particleId || null,
        label: label || null,
        scanMode: 'AI_VISION',
        status: 'PROCESSING',
        notes: notes || null,
        createdById: actor.userId,
      },
    });

    // Upload photos to storage (fire-and-forget the rest in background)
    try {
      const photoUrls: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]!;
        const ext = photo.originalname?.match(/\.\w+$/)?.[0] || '.jpg';
        const gcsKey = `room-scans/${projectId}/${scan.id}/photo-${i}${ext}`;

        const gsUri = await this.gcs.uploadBuffer({
          key: gcsKey,
          buffer: photo.buffer,
          contentType: photo.mimetype || 'image/jpeg',
        });
        photoUrls.push(this.gcs.getPublicUrlFromUri(gsUri));
      }

      // Update with photo URLs
      await this.prisma.roomScan.update({
        where: { id: scan.id },
        data: { photoUrls },
      });

      // Build base64 data URLs from in-memory buffers so OpenAI doesn't
      // need to reach our MinIO instance over the internet.
      const base64DataUrls = photos.map((p) => {
        const mime = p.mimetype || 'image/jpeg';
        return `data:${mime};base64,${p.buffer.toString('base64')}`;
      });

      // Call GPT-4o Vision
      const assessment = await this.analyzeWithVision(base64DataUrls);

      // Update scan with results
      const updated = await this.prisma.roomScan.update({
        where: { id: scan.id },
        data: {
          status: 'COMPLETE',
          assessmentJson: assessment.assessment as any,
          rawAiResponse: assessment.rawResponse,
          confidenceScore: assessment.assessment.confidence,
        },
      });

      await this.audit.log(actor, 'ROOM_SCAN_CREATED', {
        companyId,
        projectId,
        metadata: {
          scanId: scan.id,
          scanMode: 'AI_VISION',
          photoCount: photos.length,
          confidence: assessment.assessment.confidence,
        },
      });

      return updated;
    } catch (err: any) {
      this.logger.error(`Room scan AI analysis failed: ${err?.message}`, err?.stack);

      await this.prisma.roomScan.update({
        where: { id: scan.id },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'AI analysis failed',
        },
      });

      throw err;
    }
  }

  /**
   * Create a room scan from LiDAR data (RoomPlan mode).
   * Accepts pre-structured room data from the native module.
   */
  async createFromLidar(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      projectId: string;
      particleId?: string;
      label?: string;
      notes?: string;
      lidarRoomData: Record<string, any>;
      photoUrls?: string[];
    },
  ) {
    const { projectId, particleId, label, notes, lidarRoomData, photoUrls } = payload;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Convert RoomPlan CapturedRoom data to our unified assessment format
    const assessment = this.normalizeLidarData(lidarRoomData);

    const scan = await this.prisma.roomScan.create({
      data: {
        companyId,
        projectId,
        particleId: particleId || null,
        label: label || null,
        scanMode: 'LIDAR',
        status: 'COMPLETE',
        photoUrls: photoUrls || [],
        assessmentJson: assessment as any,
        lidarRoomJson: lidarRoomData as any,
        confidenceScore: 0.95, // LiDAR is high confidence
        notes: notes || null,
        createdById: actor.userId,
      },
    });

    await this.audit.log(actor, 'ROOM_SCAN_CREATED', {
      companyId,
      projectId,
      metadata: {
        scanId: scan.id,
        scanMode: 'LIDAR',
        wallCount: lidarRoomData.walls?.length ?? 0,
        doorCount: lidarRoomData.doors?.length ?? 0,
        windowCount: lidarRoomData.windows?.length ?? 0,
      },
    });

    return scan;
  }

  async getById(scanId: string, companyId: string) {
    const scan = await this.prisma.roomScan.findFirst({
      where: { id: scanId, companyId },
      include: {
        project: { select: { id: true, name: true } },
        particle: { select: { id: true, name: true, fullLabel: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!scan) throw new NotFoundException('Room scan not found');
    return scan;
  }

  async listForProject(projectId: string, companyId: string) {
    return this.prisma.roomScan.findMany({
      where: { projectId, companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        particle: { select: { id: true, name: true, fullLabel: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async analyzeWithVision(photoUrls: string[]): Promise<{
    assessment: RoomAssessment;
    rawResponse: string;
  }> {
    const client = this.getOpenAI();

    const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      photoUrls.map((url) => ({
        type: 'image_url' as const,
        image_url: { url, detail: 'high' as const },
      }));

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ROOM_ASSESSMENT_PROMPT },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Invalid JSON response: ${content.substring(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]) as RoomAssessment;

    this.logger.log(
      `Room assessment complete: type=${parsed.roomType}, ` +
      `dims=${parsed.estimatedDimensions?.lengthFt}x${parsed.estimatedDimensions?.widthFt}, ` +
      `features=${parsed.features?.length ?? 0}, confidence=${parsed.confidence}`,
    );

    return { assessment: parsed, rawResponse: content };
  }

  /**
   * Convert Apple RoomPlan CapturedRoom JSON into our unified assessment format.
   * RoomPlan provides walls, doors, windows, openings with precise dimensions in meters.
   */
  private normalizeLidarData(data: Record<string, any>): RoomAssessment {
    const M_TO_FT = 3.28084;
    const walls: any[] = data.walls || [];
    const doors: any[] = data.doors || [];
    const windows: any[] = data.windows || [];
    const openings: any[] = data.openings || [];

    // Estimate room dimensions from wall data
    let maxLength = 0;
    let maxWidth = 0;
    let avgHeight = 0;

    for (const wall of walls) {
      const dims = wall.dimensions || {};
      const w = (dims.width || 0) * M_TO_FT;
      const h = (dims.height || 0) * M_TO_FT;
      if (w > maxLength) {
        maxWidth = maxLength;
        maxLength = w;
      } else if (w > maxWidth) {
        maxWidth = w;
      }
      if (h > 0) avgHeight = h; // RoomPlan walls share the same height
    }

    const lengthFt = Math.round(maxLength * 10) / 10;
    const widthFt = Math.round(maxWidth * 10) / 10;
    const heightFt = Math.round(avgHeight * 10) / 10;

    const features: RoomAssessment['features'] = [];

    for (const door of doors) {
      const dims = door.dimensions || {};
      features.push({
        type: 'door',
        subType: door.type || 'standard',
        widthFt: Math.round((dims.width || 0) * M_TO_FT * 10) / 10,
        heightFt: Math.round((dims.height || 0) * M_TO_FT * 10) / 10,
        condition: 3, // LiDAR can't assess condition
      });
    }

    for (const win of windows) {
      const dims = win.dimensions || {};
      features.push({
        type: 'window',
        subType: win.type || 'standard',
        widthFt: Math.round((dims.width || 0) * M_TO_FT * 10) / 10,
        heightFt: Math.round((dims.height || 0) * M_TO_FT * 10) / 10,
        condition: 3,
      });
    }

    for (const opening of openings) {
      const dims = opening.dimensions || {};
      features.push({
        type: 'opening',
        subType: 'open',
        widthFt: Math.round((dims.width || 0) * M_TO_FT * 10) / 10,
        heightFt: Math.round((dims.height || 0) * M_TO_FT * 10) / 10,
      });
    }

    return {
      roomType: data.roomType || 'other',
      estimatedDimensions: {
        lengthFt,
        widthFt,
        heightFt,
        sqFt: Math.round(lengthFt * widthFt),
      },
      features,
      confidence: 0.95,
    };
  }
}
