import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ASSESSMENT_PROMPTS, type AssessmentType } from './prompts';

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

  constructor(private readonly config: ConfigService) {
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
