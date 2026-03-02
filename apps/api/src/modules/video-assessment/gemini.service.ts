import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ASSESSMENT_PROMPTS, TEACH_PROMPT, type AssessmentType } from './prompts';

/**
 * Parsed assessment response from Gemini.
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
 * GeminiService proxies image analysis requests to Gemini 2.0 Flash
 * via the Google Cloud Vertex AI REST API.
 *
 * Uses the REST API directly to avoid heavy SDK dependencies.
 * Authenticates via Application Default Credentials (ADC) — the
 * same service account the API already uses for GCS.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly projectId: string;
  private readonly region: string;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.projectId =
      config.get<string>('GCP_PROJECT') ||
      config.get<string>('GCLOUD_PROJECT') ||
      config.get<string>('PROJECT_ID') ||
      config.get<string>('GOOGLE_CLOUD_PROJECT') ||
      '';
    this.region = config.get<string>('VERTEX_AI_REGION') || 'us-central1';
    this.model = config.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash-001';
  }

  /**
   * Analyze a set of frame images using Gemini 2.0 Flash.
   *
   * Accepts either base64-encoded image data or GCS URIs.
   * Returns structured assessment JSON parsed from Gemini's response.
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

    // Build the multimodal content parts
    const parts: any[] = [
      { text: prompt + contextPrefix },
    ];

    for (const frame of frames) {
      if (frame.base64) {
        parts.push({
          inlineData: {
            mimeType: frame.mimeType || 'image/jpeg',
            data: frame.base64,
          },
        });
      } else if (frame.gcsUri) {
        parts.push({
          fileData: {
            mimeType: frame.mimeType || 'image/jpeg',
            fileUri: frame.gcsUri,
          },
        });
      }
    }

    // Get access token from ADC
    const accessToken = await this.getAccessToken();

    const endpoint =
      `https://${this.region}-aiplatform.googleapis.com/v1/` +
      `projects/${this.projectId}/locations/${this.region}/` +
      `publishers/google/models/${this.model}:generateContent`;

    this.logger.log(
      `Gemini analyze: model=${this.model}, frames=${frames.length}, type=${assessmentType}`,
    );

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      this.logger.error(`Gemini API error: ${response.status} ${errText}`);
      throw new Error(`Gemini API error: ${response.status} - ${errText.substring(0, 500)}`);
    }

    const json: any = await response.json();
    const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Invalid JSON response from Gemini: ${content.substring(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiAssessmentResult;

    this.logger.log(
      `Gemini assessment complete: findings=${parsed.findings?.length ?? 0}, ` +
      `confidence=${parsed.summary?.confidence}, zones=${parsed.summary?.zonesAssessed?.join(',')}`,
    );

    return { assessment: parsed, rawResponse: content };
  }

  // ── Teach Analysis (with Google Search grounding) ───────────────────

  /**
   * Re-analyze a specific cropped area with the user's hint and Google
   * Search grounding so Gemini can look up reference materials.
   */
  async teachAnalysis(opts: {
    companyId: string;
    imageUri: string; // GCS URI of the cropped frame
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
    const accessToken = await this.getAccessToken();

    // Build lessons from past confirmed teaching examples if not provided
    let lessons = opts.pastLessons || '';
    if (!lessons) {
      lessons = await this.buildLessonsForCompany(opts.companyId);
    }

    const prompt = TEACH_PROMPT(opts.userHint, opts.assessmentType, lessons);

    const parts: any[] = [
      { text: prompt },
      {
        fileData: {
          mimeType: opts.mimeType || 'image/jpeg',
          fileUri: opts.imageUri,
        },
      },
    ];

    const endpoint =
      `https://${this.region}-aiplatform.googleapis.com/v1/` +
      `projects/${this.projectId}/locations/${this.region}/` +
      `publishers/google/models/${this.model}:generateContent`;

    this.logger.log(
      `Gemini teach: model=${this.model}, hint="${opts.userHint.substring(0, 80)}", type=${opts.assessmentType}`,
    );

    const body = {
      contents: [{ role: 'user', parts }],
      tools: [{ google_search_retrieval: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      this.logger.error(`Gemini teach API error: ${response.status} ${errText}`);
      throw new Error(`Gemini teach error: ${response.status} - ${errText.substring(0, 500)}`);
    }

    const json: any = await response.json();
    const content = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const groundingMeta = json?.candidates?.[0]?.groundingMetadata;

    // Extract web sources from grounding metadata
    const webSources: Array<{ url: string; title: string }> = [];
    if (groundingMeta?.groundingChunks) {
      for (const chunk of groundingMeta.groundingChunks) {
        if (chunk.web?.uri) {
          webSources.push({ url: chunk.web.uri, title: chunk.web.title || '' });
        }
      }
    }

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
      `Gemini teach complete: hasFinding=${!!finding}, webSources=${webSources.length}`,
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

  /**
   * Get an access token from Application Default Credentials.
   * In Cloud Run, this uses the metadata server.
   * Locally, it uses `gcloud auth application-default print-access-token`.
   */
  private async getAccessToken(): Promise<string> {
    // Try metadata server first (Cloud Run / GKE / GCE)
    try {
      const metadataResponse = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' } },
      );
      if (metadataResponse.ok) {
        const tokenData: any = await metadataResponse.json();
        return tokenData.access_token;
      }
    } catch {
      // Not on GCP — fall through to local auth
    }

    // Fallback: use google-auth-library if available, or gcloud CLI
    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      if (tokenResponse.token) return tokenResponse.token;
    } catch {
      // google-auth-library not available
    }

    throw new Error(
      'Cannot obtain GCP access token. Ensure Application Default Credentials are configured ' +
      '(run `gcloud auth application-default login` locally, or deploy on GCP).',
    );
  }
}
