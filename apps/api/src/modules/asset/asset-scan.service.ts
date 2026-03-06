import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { AuditService } from '../../common/audit.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';

/** Structured data extracted from an equipment nameplate by GPT-4o */
export interface TagExtraction {
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  year: number | null;
  specs: Record<string, string>; // e.g. { voltage: "120V", amps: "8.5A", capacity: "170 pints/day" }
  confidence: number; // 0.0–1.0
}

const TAG_READ_PROMPT = `You are an expert equipment identification specialist. Analyze these photos of an equipment nameplate, data plate, or serial tag and extract all identifiable information.

Return ONLY valid JSON (no markdown, no explanation) in this exact structure:

{
  "manufacturer": "Brand/manufacturer name (e.g. Dri-Eaz, Xactimate, DeWalt, CAT)",
  "model": "Model name or number (e.g. LGR 3500i, DXV09P, 320GC)",
  "serialNumber": "Serial number exactly as printed",
  "year": 2024,
  "specs": {
    "voltage": "120V",
    "amps": "8.5A",
    "watts": "1020W",
    "capacity": "170 pints/day",
    "weight": "106 lbs",
    "refrigerant": "R-410A",
    "airflow": "400 CFM"
  },
  "confidence": 0.85
}

Rules:
- Read ALL text visible on the nameplate/tag
- For serial number: copy EXACTLY as printed, preserving dashes, spaces, and case
- For specs: extract any technical specifications visible (voltage, amps, watts, weight, capacity, dimensions, etc.)
- If a field is not visible or readable, use null
- For confidence: 0.9+ = clear photo, text fully legible; 0.6-0.9 = partially readable; <0.6 = poor quality
- Do NOT guess values that aren't visible — use null instead
- If multiple labels/plates are visible, extract from all of them
- Return ONLY the JSON object, nothing else`;

const SERIAL_READ_PROMPT = `Read the serial number from this equipment nameplate/tag photo. Return ONLY valid JSON:

{
  "serialNumber": "exact serial number as printed",
  "confidence": 0.9
}

Copy the serial number EXACTLY as printed (preserve dashes, spaces, case). If not readable, return {"serialNumber": null, "confidence": 0}.`;

@Injectable()
export class AssetScanService {
  private readonly logger = new Logger(AssetScanService.name);
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

  // ── Tag Read ────────────────────────────────────────────────────────

  /**
   * AI Tag Reader: photograph equipment nameplate → GPT-4o extracts identity.
   */
  async tagRead(
    companyId: string,
    actor: AuthenticatedUser,
    photos: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
  ) {
    if (!photos.length) throw new BadRequestException('At least one photo is required');
    if (photos.length > 4) throw new BadRequestException('Maximum 4 photos allowed');

    // Create scan record
    const scan = await this.prisma.assetScan.create({
      data: {
        companyId,
        scanType: 'TAG_READ',
        status: 'PROCESSING',
        createdById: actor.userId,
      },
    });

    try {
      // Upload photos to storage
      const photoUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]!;
        const ext = photo.originalname?.match(/\.\w+$/)?.[0] || '.jpg';
        const gcsKey = `asset-scans/${companyId}/${scan.id}/tag-${i}${ext}`;
        const gsUri = await this.gcs.uploadBuffer({
          key: gcsKey,
          buffer: photo.buffer,
          contentType: photo.mimetype || 'image/jpeg',
        });
        photoUrls.push(this.gcs.getPublicUrlFromUri(gsUri));
      }

      // Build base64 data URLs from the in-memory buffers so OpenAI doesn't
      // need to reach our MinIO instance over the internet.
      const base64DataUrls = photos.map((p) => {
        const mime = p.mimetype || 'image/jpeg';
        return `data:${mime};base64,${p.buffer.toString('base64')}`;
      });

      // Call GPT-4o Vision
      const { extraction, rawResponse } = await this.analyzeTagWithVision(base64DataUrls);

      // Update scan with results
      const updated = await this.prisma.assetScan.update({
        where: { id: scan.id },
        data: {
          status: 'COMPLETE',
          tagPhotoUrl: photoUrls[0] ?? null,
          extractedData: extraction as any,
          rawAiResponse: rawResponse,
        },
      });

      await this.audit.log(actor, 'ASSET_SCAN_TAG_READ', {
        companyId,
        metadata: {
          scanId: scan.id,
          manufacturer: extraction.manufacturer,
          model: extraction.model,
          serial: extraction.serialNumber,
          confidence: extraction.confidence,
        },
      });

      return updated;
    } catch (err: any) {
      this.logger.error(`Tag read failed: ${err?.message}`, err?.stack);
      await this.prisma.assetScan.update({
        where: { id: scan.id },
        data: { status: 'FAILED', errorMessage: err?.message || 'Tag read failed' },
      });
      throw err;
    }
  }

  // ── Serial Read (fleet mode) ───────────────────────────────────────

  /**
   * Quick serial-only read for fleet onboarding rapid-fire mode.
   */
  async serialRead(
    companyId: string,
    actor: AuthenticatedUser,
    photo: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    // Upload photo
    const ext = photo.originalname?.match(/\.\w+$/)?.[0] || '.jpg';
    const scanId = `fleet-${Date.now()}`;
    const gcsKey = `asset-scans/${companyId}/${scanId}/serial${ext}`;
    const gsUri = await this.gcs.uploadBuffer({
      key: gcsKey,
      buffer: photo.buffer,
      contentType: photo.mimetype || 'image/jpeg',
    });
    const photoUrl = this.gcs.getPublicUrlFromUri(gsUri);

    // Send image as base64 so OpenAI doesn't need to reach our MinIO
    const mime = photo.mimetype || 'image/jpeg';
    const base64DataUrl = `data:${mime};base64,${photo.buffer.toString('base64')}`;

    const client = this.getOpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SERIAL_READ_PROMPT },
            { type: 'image_url', image_url: { url: base64DataUrl, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON response from serial read');

    const parsed = JSON.parse(jsonMatch[0]) as { serialNumber: string | null; confidence: number };

    this.logger.log(`Serial read: ${parsed.serialNumber ?? 'unreadable'} (confidence=${parsed.confidence})`);

    return {
      serialNumber: parsed.serialNumber,
      confidence: parsed.confidence,
      photoUrl,
    };
  }

  // ── Object Capture ─────────────────────────────────────────────────

  /**
   * Store results from on-device Object Capture (USDZ model + dimensions).
   * The native module does all the heavy lifting; API just persists.
   */
  async storeObjectCapture(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      modelBuffer?: Buffer;
      thumbnailBuffer?: Buffer;
      dimensions: { length: number; width: number; height: number; unit: string };
      boundingBox?: { min: number[]; max: number[] };
    },
  ) {
    const scan = await this.prisma.assetScan.create({
      data: {
        companyId,
        scanType: 'OBJECT_CAPTURE',
        status: 'PROCESSING',
        createdById: actor.userId,
      },
    });

    try {
      let modelUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      // Upload USDZ model if provided
      if (payload.modelBuffer) {
        const gsUri = await this.gcs.uploadBuffer({
          key: `asset-scans/${companyId}/${scan.id}/model.usdz`,
          buffer: payload.modelBuffer,
          contentType: 'model/vnd.usdz+zip',
        });
        modelUrl = this.gcs.getPublicUrlFromUri(gsUri);
      }

      // Upload thumbnail if provided
      if (payload.thumbnailBuffer) {
        const gsUri = await this.gcs.uploadBuffer({
          key: `asset-scans/${companyId}/${scan.id}/thumbnail.jpg`,
          buffer: payload.thumbnailBuffer,
          contentType: 'image/jpeg',
        });
        thumbnailUrl = this.gcs.getPublicUrlFromUri(gsUri);
      }

      const updated = await this.prisma.assetScan.update({
        where: { id: scan.id },
        data: {
          status: 'COMPLETE',
          modelUrl,
          thumbnailUrl,
          dimensions: payload.dimensions as any,
          boundingBox: payload.boundingBox as any ?? null,
        },
      });

      await this.audit.log(actor, 'ASSET_SCAN_OBJECT_CAPTURE', {
        companyId,
        metadata: {
          scanId: scan.id,
          dimensions: payload.dimensions,
          hasModel: !!modelUrl,
        },
      });

      return updated;
    } catch (err: any) {
      this.logger.error(`Object capture store failed: ${err?.message}`, err?.stack);
      await this.prisma.assetScan.update({
        where: { id: scan.id },
        data: { status: 'FAILED', errorMessage: err?.message || 'Object capture failed' },
      });
      throw err;
    }
  }

  // ── Fleet Onboard ──────────────────────────────────────────────────

  /**
   * Create multiple assets from a template. Copies template fields to each
   * new asset, assigning unique serial numbers.
   */
  async fleetOnboard(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      templateAssetId: string;
      serialNumbers: string[];
      locationId?: string;
    },
  ) {
    const { templateAssetId, serialNumbers, locationId } = payload;

    if (!serialNumbers.length) throw new BadRequestException('At least one serial number is required');
    if (serialNumbers.length > 100) throw new BadRequestException('Maximum 100 assets per batch');

    // Fetch template
    const template = await this.prisma.asset.findFirst({
      where: { id: templateAssetId, companyId, isTemplate: true },
    });
    if (!template) throw new NotFoundException('Template asset not found');

    // Create assets in bulk
    const created: any[] = [];
    for (const serial of serialNumbers) {
      const asset = await this.prisma.asset.create({
        data: {
          companyId,
          name: template.name,
          code: null, // Each unit gets its own code (or auto-generated)
          description: template.description,
          assetType: template.assetType,
          baseUnit: template.baseUnit,
          baseRate: template.baseRate,
          costBreakdown: template.costBreakdown ?? undefined,
          attributes: template.attributes ?? undefined,
          isTrackable: true, // Fleet members are always trackable
          isConsumable: false,
          manufacturer: template.manufacturer,
          model: template.model,
          serialNumberOrVin: serial,
          year: template.year,
          dimensions: template.dimensions ?? undefined,
          scanModelUrl: template.scanModelUrl,
          scanThumbnailUrl: template.scanThumbnailUrl,
          tagPhotoUrl: null, // Each unit's tag photo captured during serial read
          templateAssetId,
          isTemplate: false,
          currentLocationId: locationId ?? template.currentLocationId,
          // Copy maintenance config from template
          maintenanceProfileCode: template.maintenanceProfileCode,
          maintTriggerStrategy: template.maintTriggerStrategy,
          maintTimeIntervalValue: template.maintTimeIntervalValue,
          maintTimeIntervalUnit: template.maintTimeIntervalUnit,
          maintMeterType: template.maintMeterType,
          maintMeterIntervalAmount: template.maintMeterIntervalAmount,
          maintLeadTimeDays: template.maintLeadTimeDays,
        },
      });
      created.push(asset);
    }

    await this.audit.log(actor, 'ASSET_FLEET_ONBOARD', {
      companyId,
      metadata: {
        templateAssetId,
        templateName: template.name,
        count: created.length,
        serials: serialNumbers,
      },
    });

    this.logger.log(
      `Fleet onboard: ${created.length} assets created from template "${template.name}" (${templateAssetId})`,
    );

    return {
      templateId: templateAssetId,
      templateName: template.name,
      created: created.length,
      assets: created,
    };
  }

  // ── Create Asset from Scan ─────────────────────────────────────────

  /**
   * Create an Asset record from a completed scan (tag read or object capture).
   * Links the scan to the new asset.
   */
  async createAssetFromScan(
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      scanId: string;
      name: string;
      assetType?: string;
      isTemplate?: boolean;
      // Overrides (user can edit AI-extracted values)
      manufacturer?: string;
      model?: string;
      serialNumberOrVin?: string;
      year?: number;
      dimensions?: { length: number; width: number; height: number; unit: string };
    },
  ) {
    const scan = await this.prisma.assetScan.findFirst({
      where: { id: payload.scanId, companyId, status: 'COMPLETE' },
    });
    if (!scan) throw new NotFoundException('Completed scan not found');

    // Merge AI-extracted data with user overrides
    const extracted = (scan.extractedData as unknown as TagExtraction) ?? {};

    const asset = await this.prisma.asset.create({
      data: {
        companyId,
        name: payload.name,
        assetType: (payload.assetType as any) ?? 'EQUIPMENT',
        isTemplate: payload.isTemplate ?? false,
        isTrackable: true,
        manufacturer: payload.manufacturer ?? extracted.manufacturer ?? null,
        model: payload.model ?? extracted.model ?? null,
        serialNumberOrVin: payload.serialNumberOrVin ?? extracted.serialNumber ?? null,
        year: payload.year ?? extracted.year ?? null,
        dimensions: payload.dimensions ?? (scan.dimensions as any) ?? undefined,
        scanModelUrl: scan.modelUrl,
        scanThumbnailUrl: scan.thumbnailUrl,
        tagPhotoUrl: scan.tagPhotoUrl,
      },
    });

    // Link scan to the new asset
    await this.prisma.assetScan.update({
      where: { id: scan.id },
      data: { assetId: asset.id },
    });

    return asset;
  }

  // ── Upload Originals (hi-res, post-verification) ────────────────────

  /**
   * Upload original hi-res tag photos after the user verifies AI extraction.
   * These are stored separately for daily-log review / audit trail.
   */
  async uploadOriginals(
    companyId: string,
    scanId: string,
    photos: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
  ) {
    const scan = await this.prisma.assetScan.findFirst({
      where: { id: scanId, companyId, status: 'COMPLETE' },
    });
    if (!scan) throw new NotFoundException('Completed scan not found');

    const photoUrls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!;
      const ext = photo.originalname?.match(/\.\w+$/)?.[0] || '.jpg';
      const gcsKey = `asset-scans/${companyId}/${scanId}/original-${i}${ext}`;
      const gsUri = await this.gcs.uploadBuffer({
        key: gcsKey,
        buffer: photo.buffer,
        contentType: photo.mimetype || 'image/jpeg',
      });
      photoUrls.push(this.gcs.getPublicUrlFromUri(gsUri));
    }

    await this.prisma.assetScan.update({
      where: { id: scanId },
      data: { originalPhotoUrls: photoUrls },
    });

    this.logger.log(`Uploaded ${photoUrls.length} original photos for scan ${scanId}`);
    return { scanId, originalPhotoUrls: photoUrls };
  }

  // ── List / Get ─────────────────────────────────────────────────────

  async listScans(companyId: string, limit = 20) {
    return this.prisma.assetScan.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        asset: { select: { id: true, name: true, manufacturer: true, model: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listTemplates(companyId: string) {
    return this.prisma.asset.findMany({
      where: { companyId, isTemplate: true, isActive: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { fleetMembers: true } },
      },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async analyzeTagWithVision(photoUrls: string[]): Promise<{
    extraction: TagExtraction;
    rawResponse: string;
  }> {
    const client = this.getOpenAI();

    const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      photoUrls.map((url) => ({
        type: 'image_url' as const,
        image_url: { url, detail: 'auto' as const },
      }));

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: TAG_READ_PROMPT },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Invalid JSON response: ${content.substring(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]) as TagExtraction;

    this.logger.log(
      `Tag extraction: manufacturer=${parsed.manufacturer}, model=${parsed.model}, ` +
      `serial=${parsed.serialNumber}, confidence=${parsed.confidence}`,
    );

    return { extraction: parsed, rawResponse: content };
  }
}
