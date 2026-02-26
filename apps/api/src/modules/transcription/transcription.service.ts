import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { GcsService } from "../../infra/storage/gcs.service";
import * as fs from "fs/promises";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TranscriptionContext = "daily_log" | "journal" | "message" | "standalone";

/** ISO 639-1 language codes supported by Whisper */
export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "pt", "de", "it", "zh", "ja", "ko"] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export interface TranscriptionRequest {
  /** GCS URI of the audio file (for Whisper — Tier 2) */
  audioFileUrl?: string;
  /** On-device speech recognition text (for GPT-only — Tier 1) */
  rawText?: string;
  /** Determines which GPT prompt is used */
  context: TranscriptionContext;
  /** Source language (ISO 639-1). Defaults to "en". */
  language?: string;
  projectName?: string;
  companyName?: string;
}

export interface TranscriptionResult {
  /** Whisper verbatim output (only set when audioFileUrl was provided) */
  rawTranscript?: string;
  /** GPT-cleaned text (in source language) */
  aiText: string;
  /** English translation (populated when source language != "en") */
  aiTextTranslated?: string;
  /** Structured output for journal context */
  structured?: {
    summary: string;
    details: string;
    suggestedDirection?: string;
    extractedAmounts?: Record<string, number>;
  };
  durationSecs?: number;
  confidence?: number;
  /** Detected or provided language */
  language?: string;
}

export interface TranslationRequest {
  /** Text fields to translate (key → value) */
  fields: Record<string, string | null | undefined>;
  /** Source language code */
  fromLang: string;
  /** Target language code */
  toLang: string;
  /** Context for better translation quality */
  context?: TranscriptionContext;
}

export interface TranslationResult {
  /** Translated fields (same keys as input) */
  fields: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  de: "German", it: "Italian", zh: "Chinese", ja: "Japanese", ko: "Korean",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

function buildSystemPrompt(
  ctx: TranscriptionContext,
  projectName?: string,
  companyName?: string,
  language?: string,
): string {
  const company = companyName ?? "the company";
  const project = projectName ? ` Project: ${projectName}.` : "";
  const lang = language ?? "en";
  const outputLangNote = lang !== "en"
    ? ` The input is in ${langName(lang)}. Produce your output in ${langName(lang)} (keep the same language).`
    : "";

  switch (ctx) {
    case "daily_log":
      return `You are a construction daily log assistant for ${company}. Clean up this voice transcript into a professional daily log entry. Remove filler words (uh, um, like, you know), fix grammar, organize into clear bullet points or short paragraphs. Keep ALL factual details — names, numbers, measurements, materials, locations.${project} Do not add information that wasn't in the original. Do not remove any facts.${outputLangNote}`;

    case "journal":
      return `You are an insurance claims journal assistant for ${company}. This is a voice memo recorded by a project team member. Structure it into TWO clearly labeled sections:

SUMMARY: One sentence suitable for a timeline view.
DETAILS: Bullet points with key facts, dollar amounts, next steps, commitments, names, dates.

Remove filler words. Keep ALL factual content.${project}${outputLangNote}

Return your response as valid JSON:
{
  "summary": "one-sentence summary",
  "details": "• bullet point 1\\n• bullet point 2",
  "suggestedDirection": "INTERNAL",
  "extractedAmounts": { "approved": 0, "disputed": 0 }
}`;

    case "message":
      return `You are a message assistant. Transcribe this voice message into clean, readable text. Keep the conversational tone. Remove filler words and false starts. Keep it concise.${outputLangNote}`;

    case "standalone":
    default:
      return `You are a note-taking assistant. Clean up this voice note into organized, readable text. Remove filler words, fix grammar. Keep all details and organize into clear notes.${outputLangNote}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly gcs: GcsService,
  ) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.config.get<string>("OPENAI_API_KEY");
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  /**
   * Tier 1 — GPT-only: takes raw on-device text and cleans it up.
   * Fast (~1-2s). No Whisper involved.
   * If language != "en", also produces an English translation.
   */
  async summarizeText(req: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!req.rawText) {
      throw new Error("rawText is required for Tier 1 summarization");
    }

    const lang = req.language ?? "en";
    const client = this.getClient();
    const systemPrompt = buildSystemPrompt(req.context, req.projectName, req.companyName, lang);

    this.logger.log(`Tier 1 summarize: context=${req.context}, lang=${lang}, textLen=${req.rawText.length}`);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: req.rawText },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content ?? "";

    // For journal context, try to parse structured JSON
    if (req.context === "journal") {
      const result = this.parseJournalResponse(content);
      if (lang !== "en") {
        result.aiTextTranslated = await this.translateSingle(content, lang, "en");
      }
      result.language = lang;
      return result;
    }

    // Auto-translate to English if source is non-English
    let aiTextTranslated: string | undefined;
    if (lang !== "en") {
      aiTextTranslated = await this.translateSingle(content, lang, "en");
    }

    return { aiText: content, aiTextTranslated, language: lang };
  }

  /**
   * Tier 2 — Whisper + GPT: transcribes audio, then cleans up with GPT.
   * Slower (~10-15s) but more accurate than on-device speech recognition.
   * Whisper auto-detects language or uses the hint. Non-English gets translated.
   */
  async transcribeAudio(req: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!req.audioFileUrl) {
      throw new Error("audioFileUrl is required for Tier 2 transcription");
    }

    const lang = req.language ?? "en";
    const client = this.getClient();

    // 1. Download audio from GCS
    this.logger.log(`Tier 2 transcribe: downloading ${req.audioFileUrl}, lang=${lang}`);
    const localPath = await this.gcs.downloadToTmp(req.audioFileUrl);

    try {
      // 2. Whisper transcription (with language hint)
      this.logger.log("Tier 2 transcribe: calling Whisper API");
      const audioFile = await fs.readFile(localPath);
      const file = new File([audioFile], "audio.m4a", { type: "audio/mp4" });

      const whisperOpts: any = {
        model: "whisper-1",
        file,
        response_format: "verbose_json",
      };
      // Pass language hint to Whisper for better accuracy
      if (lang !== "en") {
        whisperOpts.language = lang;
      }

      const whisperResponse = await client.audio.transcriptions.create(whisperOpts);

      const rawTranscript = whisperResponse.text;
      const detectedLang = (whisperResponse as any).language ?? lang;
      const durationSecs = Math.round((whisperResponse as any).duration ?? 0);

      this.logger.log(`Whisper done: ${rawTranscript.length} chars, ${durationSecs}s, detected=${detectedLang}`);

      // 3. GPT cleanup (in source language)
      const effectiveLang = detectedLang || lang;
      const systemPrompt = buildSystemPrompt(req.context, req.projectName, req.companyName, effectiveLang);

      const gptResponse = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawTranscript },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      const aiText = gptResponse.choices[0]?.message?.content ?? "";

      // 4. Auto-translate to English if non-English
      let aiTextTranslated: string | undefined;
      if (effectiveLang !== "en") {
        aiTextTranslated = await this.translateSingle(aiText, effectiveLang, "en");
      }

      // For journal context, parse structured response
      if (req.context === "journal") {
        const result = this.parseJournalResponse(aiText);
        return { ...result, rawTranscript, durationSecs, aiTextTranslated, language: effectiveLang };
      }

      return {
        rawTranscript,
        aiText,
        aiTextTranslated,
        durationSecs,
        language: effectiveLang,
      };
    } finally {
      // Cleanup temp file
      await fs.unlink(localPath).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Translation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Translate a single piece of text between languages.
   */
  private async translateSingle(text: string, fromLang: string, toLang: string): Promise<string> {
    if (!text?.trim()) return "";
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following text from ${langName(fromLang)} to ${langName(toLang)}. Preserve all formatting (bullet points, paragraphs, numbers). Keep proper nouns, technical terms, measurements, and dollar amounts unchanged. Output ONLY the translation, nothing else.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    return response.choices[0]?.message?.content ?? "";
  }

  /**
   * Translate multiple text fields in a single GPT call.
   * Returns the same keys with translated values.
   * Used for daily log bulk field translation.
   */
  async translateFields(req: TranslationRequest): Promise<TranslationResult> {
    const client = this.getClient();

    // Filter out null/empty fields
    const entries = Object.entries(req.fields).filter(([_, v]) => v?.trim());
    if (!entries.length) return { fields: {} };

    // Build a structured prompt for batch translation
    const fieldsText = entries
      .map(([key, value]) => `[${key}]\n${value}`)
      .join("\n\n");

    this.logger.log(`Translating ${entries.length} fields from ${req.fromLang} to ${req.toLang}`);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a professional translator for a construction/insurance company. Translate the following labeled fields from ${langName(req.fromLang)} to ${langName(req.toLang)}.

Rules:
- Preserve ALL formatting (bullet points, paragraphs, numbered lists)
- Keep proper nouns, company names, technical terms, measurements, and dollar amounts unchanged
- Keep the [field_name] labels exactly as-is
- Output ONLY the translated fields with their labels, nothing else
- If a field is just a name or number, keep it unchanged`,
        },
        { role: "user", content: fieldsText },
      ],
      max_tokens: 4000,
      temperature: 0.2,
    });

    const output = response.choices[0]?.message?.content ?? "";

    // Parse the labeled output back into key-value pairs
    const result: Record<string, string> = {};
    const fieldRegex = /\[([^\]]+)\]\s*\n([\s\S]*?)(?=\n\[|$)/g;
    let match: RegExpExecArray | null;
    while ((match = fieldRegex.exec(output)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key && value) {
        result[key] = value;
      }
    }

    // Fallback: if regex parsing failed, try to map sequentially
    if (Object.keys(result).length === 0 && entries.length === 1) {
      result[entries[0][0]] = output.trim();
    }

    return { fields: result };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parse a GPT journal response into structured format.
   * Falls back to plain text if JSON parsing fails.
   */
  private parseJournalResponse(content: string): TranscriptionResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          aiText: parsed.summary ?? content,
          structured: {
            summary: parsed.summary ?? "",
            details: parsed.details ?? "",
            suggestedDirection: parsed.suggestedDirection,
            extractedAmounts: parsed.extractedAmounts,
          },
        };
      }
    } catch {
      this.logger.warn("Failed to parse journal JSON response, using plain text");
    }

    return { aiText: content };
  }
}
