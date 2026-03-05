import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { ASSESSMENT_PROMPTS, TEACH_PROMPT, type AssessmentType } from './prompts';

/**
 * Parsed assessment response from the vision model.
 */
export interface GeminiAssessmentResult {
  summary: {
    narrative: string;
    overallCondition: number;
    confidence: number;
    materialIdentified: string[];
    zonesAssessed: string[];
    primaryCausation: string;
    estimatedAge?: string;
  };
  findings: Array<{
    zone: string;
    category: string;
    severity: string;
    causation: string;
    description: string;
    frameIndex: number;
    boundingBox?: { x: number; y: number; w: number; h: number } | null;
    costbookItemCode?: string | null;
    estimatedQuantity?: number | null;
    estimatedUnit?: string | null;
    confidence: number;
  }>;
}

/**
 * GeminiService proxies image analysis requests to a Vision LLM.
 *
 * Supports any OpenAI-compatible API (OpenAI, xAI Grok, Google AI Studio, etc.)
 * configured via environment variables:
 *   VISION_MODEL         — model ID (default: gpt-4o)
 *   VISION_API_KEY       — API key for the vision provider (falls back to OPENAI_API_KEY)
 *   VISION_API_BASE_URL  — base URL override (e.g. https://api.x.ai/v1 for Grok)
 *
 * The class name and interface type (`GeminiAssessmentResult`) are preserved
 * for backwards compatibility with callers.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly model: string;
  private client: OpenAI | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {
    this.model = config.get<string>('VISION_MODEL') || 'gpt-4o';
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey =
        this.config.get<string>('VISION_API_KEY') ||
        this.config.get<string>('XAI_API_KEY') ||
        this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new Error('No vision API key configured (set VISION_API_KEY, XAI_API_KEY, or OPENAI_API_KEY)');

      const baseURL = this.config.get<string>('VISION_API_BASE_URL');
      this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    }
    return this.client;
  }

  /**
   * Analyze a set of frame images using GPT-4o Vision.
   *
   * Accepts either base64-encoded image data or storage URIs (gs://…).
   * Returns structured assessment JSON parsed from the model's response.
   */
  async analyzeFrames(opts: {
    frames: Array<{ base64?: string; gcsUri?: string; mimeType: string }>;
    assessmentType: AssessmentType;
    weatherContext?: string;
    captureDate?: string;
    companyId?: string;
  }): Promise<{ assessment: GeminiAssessmentResult; rawResponse: string }> {
    const { frames, assessmentType, weatherContext, captureDate } = opts;
    const prompt = ASSESSMENT_PROMPTS[assessmentType];

    // Build contextual prefix
    let contextPrefix = '';
    if (weatherContext || captureDate) {
      contextPrefix = '\n\nAdditional context:\n';
      if (captureDate) contextPrefix += `- Capture date: ${captureDate}\n`;
      if (weatherContext) contextPrefix += `- Weather at capture: ${weatherContext}\n`;
    }

    // Inject lessons learned from past teaching examples
    if (opts.companyId) {
      const lessons = await this.buildLessonsForCompany(opts.companyId);
      if (lessons) contextPrefix += lessons;
    }

    // Build multimodal content parts for OpenAI Vision
    const contentParts: OpenAI.ChatCompletionContentPart[] = [
      { type: 'text', text: prompt + contextPrefix },
    ];

    for (const frame of frames) {
      const imageUrl = await this.resolveImageUrl(frame);
      if (imageUrl) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: imageUrl, detail: 'high' },
        });
      }
    }

    const client = this.getClient();

    this.logger.log(
      `Vision analyze: model=${this.model}, frames=${frames.length}, type=${assessmentType}`,
    );

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
      max_tokens: 8192,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI Vision');
    }

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Invalid JSON response from Vision: ${content.substring(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiAssessmentResult;

    this.logger.log(
      `Vision assessment complete: findings=${parsed.findings?.length ?? 0}, ` +
      `confidence=${parsed.summary?.confidence}, zones=${parsed.summary?.zonesAssessed?.join(',')}`,
    );

    return { assessment: parsed, rawResponse: content };
  }

  // ── Teach Analysis ─────────────────────────────────────────────────

  /**
   * Re-analyze a specific cropped area with the user's hint.
   *
   * Note: Google Search grounding (formerly via Vertex AI) has been removed.
   * The model now relies on its training data and the detailed prompts.
   * webSources is preserved in the return type for API compatibility.
   */
  async teachAnalysis(opts: {
    companyId: string;
    imageUri: string; // storage URI of the cropped frame
    mimeType?: string;
    userHint: string;
    assessmentType: AssessmentType;
    pastLessons?: string; // pre-built lessons string (optional, caller can provide)
  }): Promise<{
    finding: GeminiAssessmentResult['findings'][0] | null;
    narrative: string;
    rawResponse: string;
    webSources: Array<{ url: string; title: string }>;
  }> {
    // Build lessons from past confirmed teaching examples if not provided
    let lessons = opts.pastLessons || '';
    if (!lessons) {
      lessons = await this.buildLessonsForCompany(opts.companyId);
    }

    const promptText = TEACH_PROMPT(opts.userHint, opts.assessmentType, lessons);

    // Resolve image URI to an accessible URL
    const imageUrl = await this.resolveImageUrl({
      gcsUri: opts.imageUri,
      mimeType: opts.mimeType || 'image/jpeg',
    });

    const contentParts: OpenAI.ChatCompletionContentPart[] = [
      { type: 'text', text: promptText },
    ];
    if (imageUrl) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'high' },
      });
    }

    const client = this.getClient();

    this.logger.log(
      `Vision teach: model=${this.model}, hint="${opts.userHint.substring(0, 80)}", type=${opts.assessmentType}`,
    );

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content || '';

    // No web sources — Google Search grounding has been removed
    const webSources: Array<{ url: string; title: string }> = [];

    // Parse the finding from response — may be JSON or narrative
    let finding: GeminiAssessmentResult['findings'][0] | null = null;
    let narrative = content;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        // Could be a single finding or a wrapper with findings array
        if (parsed.findings?.length) {
          finding = parsed.findings[0];
          narrative = parsed.summary?.narrative || parsed.narrative || content;
        } else if (parsed.zone && parsed.category) {
          finding = parsed;
        }
      } catch {
        // Not valid JSON — use narrative mode
      }
    }

    this.logger.log(
      `Vision teach complete: hasFinding=${!!finding}`,
    );

    return { finding, narrative, rawResponse: content, webSources };
  }

  // ── Learning Injection ────────────────────────────────────────────

  /**
   * Build a "lessons learned" string from past confirmed teaching examples
   * for a company. Injected into standard analysis prompts.
   */
  async buildLessonsForCompany(companyId: string): Promise<string> {
    const examples = await this.prisma.assessmentTeachingExample.findMany({
      where: { companyId, confirmed: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        userHint: true,
        assessmentType: true,
        aiRefinedFinding: true,
        userCorrectionJson: true,
      },
    });

    if (!examples.length) return '';

    const lines = examples.map((ex, i) => {
      const correction = ex.userCorrectionJson
        ? ` (user corrected: ${JSON.stringify(ex.userCorrectionJson)})`
        : ' (confirmed by user)';
      const finding = ex.aiRefinedFinding as any;
      const desc = finding?.description || finding?.zone || '';
      return `${i + 1}. User noted: "${ex.userHint}" → ${desc}${correction}`;
    });

    return `\n\n## Lessons from past assessments by this team (USE THESE TO IMPROVE ACCURACY):\n${lines.join('\n')}`;
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Convert a frame's base64 data or storage URI into a URL that OpenAI
   * can fetch. Base64 → data-URI, gs://… → presigned MinIO URL.
   */
  private async resolveImageUrl(
    frame: { base64?: string; gcsUri?: string; mimeType?: string },
  ): Promise<string | null> {
    if (frame.base64) {
      const mime = frame.mimeType || 'image/jpeg';
      return `data:${mime};base64,${frame.base64}`;
    }
    if (frame.gcsUri) {
      const match = frame.gcsUri.match(/^(?:gs|s3):\/\/([^/]+)\/(.+)$/);
      if (!match) throw new Error(`Invalid storage URI: ${frame.gcsUri}`);
      return this.storage.createSignedReadUrl({ bucket: match[1]!, key: match[2]!, expiresInSeconds: 3600 });
    }
    return null;
  }
}
