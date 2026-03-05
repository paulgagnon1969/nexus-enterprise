import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ObjectStorageService } from "../../infra/storage/object-storage.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DrawingUploadStatus } from "@prisma/client";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";
import { PDFDocument } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedPage {
  page: number;
  sheetId: string | null;
  text: string;
}

interface AiBomLine {
  csiDivision: string | null;
  csiDivisionName: string | null;
  description: string;
  specification: string | null;
  qty: number | null;
  unit: string | null;
  sourcePage: number | null;
  sourceSheet: string | null;
  notes: string | null;
}

interface CostBookMatch {
  companyPriceListItemId: string;
  description: string;
  cat: string | null;
  sel: string | null;
  unitPrice: number | null;
  unit: string | null;
  confidence: number;
  method: string;
}

// ---------------------------------------------------------------------------
// AI Provider Configuration
// ---------------------------------------------------------------------------

type AiProviderName = "openai" | "xai" | "anthropic";

interface AiProviderConfig {
  name: AiProviderName;
  displayName: string;
  baseURL?: string;
  model: string;
  envKey: string;
  sdkType: "openai-compat" | "anthropic-native";
}

const AI_PROVIDERS: Record<AiProviderName, AiProviderConfig> = {
  openai: {
    name: "openai",
    displayName: "OpenAI GPT-4o",
    model: "gpt-4o",
    envKey: "OPENAI_API_KEY",
    sdkType: "openai-compat",
  },
  xai: {
    name: "xai",
    displayName: "xAI Grok-3",
    baseURL: "https://api.x.ai/v1",
    model: "grok-3",
    envKey: "XAI_API_KEY",
    sdkType: "openai-compat",
  },
  anthropic: {
    name: "anthropic",
    displayName: "Anthropic Claude 3.5 Sonnet",
    model: "claude-sonnet-4-20250514",
    envKey: "ANTHROPIC_API_KEY",
    sdkType: "anthropic-native",
  },
};

interface ProviderExtractionResult {
  provider: AiProviderName;
  displayName: string;
  model: string;
  items: AiBomLine[];
  totalTokens: number;
  elapsedMs: number;
  csiDivisions: string[];
  error?: string;
}

interface ComparisonReport {
  uploadId: string;
  fileName: string;
  pageCount: number;
  results: ProviderExtractionResult[];
  analysis: {
    itemCountDiff: number;
    onlyInA: AiBomLine[];
    onlyInB: AiBomLine[];
    inBoth: { description: string; aSpec: string | null; bSpec: string | null }[];
    csiCoverageA: string[];
    csiCoverageB: string[];
    recommendation: string;
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const BOM_EXTRACTION_PROMPT = `You are an expert construction estimator analyzing architectural/engineering drawing text.

Given the extracted text from construction drawing pages, identify ALL materials, products, equipment, fixtures, and systems specified. For each item produce a JSON object.

Return ONLY a JSON array (no markdown, no explanation). Each element:

{
  "csiDivision": "XX",          // 2-digit CSI division: "03"=Concrete, "04"=Masonry, "05"=Metals, "06"=Wood/Plastics, "07"=Thermal/Moisture, "08"=Openings, "09"=Finishes, "10"=Specialties, "11"=Equipment, "12"=Furnishings, "21"=Fire Suppression, "22"=Plumbing, "23"=HVAC, "26"=Electrical, "27"=Communications, "28"=Safety/Security
  "csiDivisionName": "Human-readable division name",
  "description": "Concise item description suitable for an estimate line item",
  "specification": "Manufacturer, model, standard, or spec reference (e.g. 'Kohler K-25077' or 'ASTM A615 Grade 60')",
  "qty": null,                  // Quantity if determinable from schedules/notes, else null
  "unit": "EA|SF|LF|SY|CY|GAL|TON|LS|null",
  "sourcePage": 5,              // PDF page number where found
  "sourceSheet": "P-601",       // Sheet ID if visible
  "notes": "Any relevant notes (ADA, NFPA ref, altitude derating, etc.)"
}

Rules:
- Extract EVERY specified material, fixture, equipment item, and system
- Include structural, architectural, mechanical, plumbing, electrical, fire protection, and technology items
- For fixture/equipment schedules, extract EACH unique fixture type as a separate line
- Include piping systems, ductwork, wiring/conduit as line items
- When a manufacturer and model are given, ALWAYS include them in specification
- Do NOT include general notes, abbreviations, or legend entries as line items
- Do NOT include labor-only items
- If quantity is shown in a schedule, include it; otherwise leave null
- Merge duplicates that appear on multiple pages (keep the most specific version)
- Return ONLY the JSON array`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DrawingsBomService {
  private readonly logger = new Logger(DrawingsBomService.name);
  private clients = new Map<AiProviderName, OpenAI>();
  private anthropicClient: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly gcsService: ObjectStorageService,
  ) {}

  /** Returns the GCS bucket name if configured, or null for local-only dev. */
  private getGcsBucket(): string | null {
    return (
      this.configService.get<string>("GCS_UPLOADS_BUCKET") ??
      this.configService.get<string>("XACT_UPLOADS_BUCKET") ??
      null
    );
  }

  // ── AI Provider clients (lazy, cached per provider) ──────────────────

  private getClient(provider: AiProviderName): OpenAI {
    const cached = this.clients.get(provider);
    if (cached) return cached;

    const config = AI_PROVIDERS[provider];
    const apiKey = this.configService.get<string>(config.envKey);
    if (!apiKey) {
      throw new Error(`${config.envKey} is not configured (required for ${config.displayName})`);
    }

    const client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    this.clients.set(provider, client);
    return client;
  }

  private getAnthropicClient(): Anthropic {
    if (this.anthropicClient) return this.anthropicClient;
    const apiKey = this.configService.get<string>("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    this.anthropicClient = new Anthropic({ apiKey });
    return this.anthropicClient;
  }

  private getDefaultProvider(): AiProviderName {
    const env = this.configService.get<string>("AI_PROVIDER");
    if (env === "xai" || env === "openai" || env === "anthropic") return env;
    // Fallback: use whichever key is configured (prefer xai if both present)
    if (this.configService.get<string>("XAI_API_KEY")) return "xai";
    if (this.configService.get<string>("ANTHROPIC_API_KEY")) return "anthropic";
    return "openai";
  }

  private getProviderModel(provider: AiProviderName): string {
    return AI_PROVIDERS[provider].model;
  }

  // ── 1. Upload & create record ────────────────────────────────────────

  async createUpload(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    file: { fileName: string; buffer: Buffer },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });
    if (!project) throw new NotFoundException("Project not found");

    const safeName = file.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    let storedPath: string;

    const gcsBucket = this.getGcsBucket();
    if (gcsBucket) {
      // Production: upload to GCS
      const gcsKey = `drawings/${projectId}/${storedName}`;
      storedPath = await this.gcsService.uploadBuffer({
        bucket: gcsBucket,
        key: gcsKey,
        buffer: file.buffer,
        contentType: "application/pdf",
      });
      this.logger.log(`Uploaded drawing PDF to GCS: ${storedPath}`);
    } else {
      // Dev fallback: store locally
      const uploadsDir = path.join(process.cwd(), "uploads", "drawings");
      await fs.promises.mkdir(uploadsDir, { recursive: true });
      storedPath = path.join(uploadsDir, storedName);
      await fs.promises.writeFile(storedPath, file.buffer);
      this.logger.log(`Stored drawing PDF locally: ${storedPath}`);
    }

    const upload = await this.prisma.projectDrawingUpload.create({
      data: {
        projectId,
        companyId,
        fileName: file.fileName,
        storedPath,
        fileSizeBytes: BigInt(file.buffer.length),
        status: DrawingUploadStatus.UPLOADING,
        createdByUserId: actor.userId,
      },
    });

    // Kick off the async pipeline (non-blocking)
    this.runPipeline(upload.id).catch((err) => {
      this.logger.error(`Drawing BOM pipeline failed for ${upload.id}: ${err?.message ?? err}`);
    });

    return { id: upload.id, status: upload.status, fileName: upload.fileName };
  }

  // ── 2. Full async pipeline ───────────────────────────────────────────

  async runPipeline(uploadId: string) {
    try {
      // Step 1: Extract text from PDF
      await this.updateStatus(uploadId, DrawingUploadStatus.EXTRACTING_TEXT);
      const pages = await this.extractPdfText(uploadId);

      // Step 2: AI BOM extraction (multi-provider merge) — optional
      // If no AI providers are configured, skip BOM extraction gracefully.
      // Plan sheet processing is independent and shouldn't be blocked by this.
      const providers = this.getAvailableProviders();
      if (providers.length === 0) {
        this.logger.warn(
          `No AI providers configured — skipping BOM extraction for ${uploadId}. ` +
          `Plan sheet processing can still be triggered independently.`,
        );
        await this.updateStatus(uploadId, DrawingUploadStatus.READY);
        return;
      }

      await this.updateStatus(uploadId, DrawingUploadStatus.EXTRACTING_BOM);
      const bomLines = await this.extractAndMergeBom(uploadId, pages);

      // Step 3: Cost book matching
      await this.updateStatus(uploadId, DrawingUploadStatus.MATCHING);
      await this.matchBomToCostBook(uploadId);

      // Step 4: Ready for review
      await this.updateStatus(uploadId, DrawingUploadStatus.READY);

      this.logger.log(
        `Drawing BOM pipeline complete for ${uploadId}: ${bomLines.length} items extracted`,
      );
    } catch (err: any) {
      this.logger.error(`Pipeline failed for ${uploadId}: ${err?.message ?? err}`);
      await this.prisma.projectDrawingUpload.update({
        where: { id: uploadId },
        data: {
          status: DrawingUploadStatus.FAILED,
          errorMessage: err?.message ?? String(err),
        },
      });
    }
  }

  // ── 3. PDF Text Extraction ───────────────────────────────────────────

  /** Resolve storedPath to a local file. Downloads from GCS if needed. */
  private async resolveToLocalPath(storedPath: string): Promise<{ localPath: string; isTemp: boolean }> {
    if (storedPath.startsWith("gs://")) {
      const localPath = await this.gcsService.downloadToTmp(storedPath);
      return { localPath, isTemp: true };
    }
    // Local dev path
    if (!fs.existsSync(storedPath)) {
      throw new Error(`PDF file not found at ${storedPath}`);
    }
    return { localPath: storedPath, isTemp: false };
  }

  /**
   * Get the actual page count from a PDF buffer using pdf-lib (pure JS).
   * Falls back to pdfinfo (poppler-utils) if pdf-lib fails.
   * Returns 0 only if both methods fail.
   */
  private async getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
    // Primary: pdf-lib (pure JS, no system binary dependency)
    try {
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const count = doc.getPageCount();
      if (count > 0) {
        this.logger.log(`pdf-lib page count: ${count}`);
        return count;
      }
    } catch (err: any) {
      this.logger.warn(`pdf-lib page count failed: ${err?.message ?? err}`);
    }

    // Fallback: pdfinfo (requires poppler-utils in Docker image)
    const tempPath = `/tmp/pdfinfo-${Date.now()}.pdf`;
    try {
      await writeFile(tempPath, pdfBuffer);
      const { stdout } = await execFileAsync("pdfinfo", [tempPath]);
      const match = stdout.match(/Pages:\s+(\d+)/);
      const count = match ? parseInt(match[1], 10) : 0;
      if (count > 0) this.logger.log(`pdfinfo page count: ${count}`);
      return count;
    } catch (err: any) {
      this.logger.warn(`pdfinfo failed: ${err?.message ?? err}`);
      return 0;
    } finally {
      fs.unlink(tempPath, () => {});
    }
  }

  private async extractPdfText(uploadId: string): Promise<ExtractedPage[]> {
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
    });
    if (!upload) throw new Error(`Upload ${uploadId} not found`);

    const { localPath, isTemp: isGcsTemp } = await this.resolveToLocalPath(upload.storedPath);

    // Read PDF into buffer for page counting and text extraction
    const buffer = await fs.promises.readFile(localPath);

    // Clean up GCS temp file if we downloaded one
    if (isGcsTemp) {
      fs.unlink(localPath, () => {});
    }

    // Get the real page count from PDF metadata (not from text extraction)
    const actualPageCount = await this.getPdfPageCount(buffer);

    let rawText: string;
    try {
      rawText = (await pdfParse(buffer))?.text || "";
    } catch (err: any) {
      this.logger.warn(`pdf-parse text extraction failed: ${err?.message ?? err}`);
      rawText = "";
    }

    // Split into pages using form-feed or page markers
    const rawPages = rawText.split(/\f/);
    const pages: ExtractedPage[] = [];

    for (let i = 0; i < rawPages.length; i++) {
      const text = (rawPages[i] ?? "").trim();
      if (!text) continue;

      // Try to detect sheet ID from common patterns
      const sheetMatch = text.match(
        /\b([A-Z]{1,3}-?\d{2,3}(?:\.\d)?)\s*$/m,
      ) ?? text.match(/Sheet\s+(?:Title|Id|No)?\s*[:\s]*([A-Z]{1,3}-?\d{2,3})/i);
      const sheetId = sheetMatch?.[1] ?? null;

      pages.push({ page: i + 1, sheetId, text });
    }

    // Use actual PDF page count (from pdfinfo) over text-based count.
    // Construction drawings are mostly graphical — text extraction often
    // finds far fewer "pages" than the PDF actually contains.
    const pageCount = actualPageCount || pages.length || rawPages.length;

    // Persist extracted text and page count
    await this.prisma.projectDrawingUpload.update({
      where: { id: uploadId },
      data: {
        pageCount,
        extractedTextJson: pages as any,
      },
    });

    this.logger.log(
      `Extracted text from ${pages.length} pages (PDF has ${actualPageCount} actual pages) for upload ${uploadId}`,
    );
    return pages;
  }

  // ── 4. AI BOM Extraction (Multi-Provider Merge) ────────────────────

  private getAvailableProviders(): AiProviderName[] {
    const available: AiProviderName[] = [];
    for (const [name, config] of Object.entries(AI_PROVIDERS)) {
      if (this.configService.get<string>(config.envKey)) {
        available.push(name as AiProviderName);
      }
    }
    return available;
  }

  private async extractAndMergeBom(
    uploadId: string,
    pages: ExtractedPage[],
  ): Promise<AiBomLine[]> {
    const providers = this.getAvailableProviders();
    if (providers.length === 0) {
      throw new Error("No AI providers configured. Set XAI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.");
    }

    this.logger.log(`Running BOM extraction with ${providers.length} provider(s): ${providers.join(", ")}`);

    // Run all configured providers in parallel
    const startMs = Date.now();
    const results = await Promise.all(
      providers.map((p) => this.extractBomWithProvider(pages, p)),
    );
    const totalElapsedMs = Date.now() - startMs;
    const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);

    // Log per-provider results
    for (const r of results) {
      if (r.error) {
        this.logger.warn(`[${r.displayName}] failed: ${r.error}`);
      } else {
        this.logger.log(`[${r.displayName}] extracted ${r.items.length} items (${r.totalTokens} tokens, ${r.elapsedMs}ms)`);
      }
    }

    // Merge across providers with fuzzy deduplication
    const merged = this.mergeProviderResults(results.filter((r) => !r.error));

    // Persist BOM lines
    await this.prisma.drawingBomLine.deleteMany({ where: { uploadId } });

    if (merged.length > 0) {
      // Prisma createMany has a limit; batch in chunks of 500
      for (let i = 0; i < merged.length; i += 500) {
        const batch = merged.slice(i, i + 500);
        await this.prisma.drawingBomLine.createMany({
          data: batch.map((line, idx) => ({
            uploadId,
            lineNo: i + idx + 1,
            csiDivision: line.csiDivision ?? null,
            csiDivisionName: line.csiDivisionName ?? null,
            description: line.description,
            specification: line.specification ?? null,
            qty: line.qty ?? null,
            unit: line.unit ?? null,
            sourcePage: line.sourcePage ?? null,
            sourceSheet: line.sourceSheet ?? null,
            notes: line.notes ?? null,
            aiSource: line.aiSource ?? null,
            consensusCount: line.consensusCount ?? 1,
            needsReview: true,
            isMatched: false,
          })),
        });
      }
    }

    // Store per-provider raw results alongside extracted text
    const providerSummary: Record<string, { items: number; tokens: number; ms: number }> = {};
    for (const r of results) {
      providerSummary[r.provider] = { items: r.items.length, tokens: r.totalTokens, ms: r.elapsedMs };
    }

    const modelNames = results.filter((r) => !r.error).map((r) => `${r.provider}:${r.model}`).join(", ");

    await this.prisma.projectDrawingUpload.update({
      where: { id: uploadId },
      data: {
        totalBomLines: merged.length,
        aiModelUsed: modelNames,
        aiTokensUsed: totalTokens,
        aiExtractionMs: totalElapsedMs,
      },
    });

    const consensusCount = merged.filter((l) => l.aiSource === "consensus").length;
    this.logger.log(
      `Merged BOM for ${uploadId}: ${merged.length} items (${consensusCount} consensus, ${merged.length - consensusCount} unique) from ${providers.length} providers (${totalTokens} tokens, ${totalElapsedMs}ms)`,
    );
    return merged;
  }

  /** Merge BOM lines from multiple providers with fuzzy deduplication. */
  private mergeProviderResults(
    results: ProviderExtractionResult[],
  ): (AiBomLine & { aiSource: string; consensusCount: number })[] {
    if (results.length === 0) return [];
    if (results.length === 1) {
      return results[0].items.map((item) => ({
        ...item,
        aiSource: results[0].provider,
        consensusCount: 1,
      }));
    }

    // Normalize for fuzzy matching
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    // Build a map from the first provider
    const mergedMap = new Map<
      string,
      { item: AiBomLine; sources: Set<string>; count: number }
    >();

    for (const result of results) {
      for (const item of result.items) {
        const key = normalize(item.description);

        const existing = mergedMap.get(key);
        if (existing) {
          existing.sources.add(result.provider);
          existing.count++;
          // Keep the richer version (more fields populated)
          if (
            (item.specification && !existing.item.specification) ||
            (item.qty != null && existing.item.qty == null)
          ) {
            existing.item = { ...item };
          }
        } else {
          mergedMap.set(key, {
            item: { ...item },
            sources: new Set([result.provider]),
            count: 1,
          });
        }
      }
    }

    // Convert to tagged BOM lines
    return Array.from(mergedMap.values()).map((entry) => {
      const aiSource =
        entry.sources.size >= 2
          ? "consensus"
          : [...entry.sources][0];
      return {
        ...entry.item,
        aiSource,
        consensusCount: entry.count,
      };
    });
  }

  // ── Core extraction (provider-agnostic) ──────────────────────────────

  private async extractBomWithProvider(
    pages: ExtractedPage[],
    providerName: AiProviderName,
  ): Promise<ProviderExtractionResult> {
    const config = AI_PROVIDERS[providerName];

    // Build chunks (shared by all providers)
    const MAX_CHARS_PER_CHUNK = 20_000;
    const chunks: string[] = [];

    const allPageTexts: string[] = [];
    for (const p of pages) {
      allPageTexts.push(`--- PAGE ${p.page} (Sheet: ${p.sheetId ?? "unknown"}) ---\n${p.text}`);
    }
    const fullText = allPageTexts.join("\n\n");

    if (fullText.length <= MAX_CHARS_PER_CHUNK) {
      chunks.push(fullText);
    } else {
      let offset = 0;
      while (offset < fullText.length) {
        let end = Math.min(offset + MAX_CHARS_PER_CHUNK, fullText.length);
        if (end < fullText.length) {
          const lastNewline = fullText.lastIndexOf("\n", end);
          if (lastNewline > offset + MAX_CHARS_PER_CHUNK * 0.5) {
            end = lastNewline + 1;
          }
        }
        chunks.push(fullText.substring(offset, end));
        offset = end;
      }
    }

    this.logger.log(`[${config.displayName}] Processing ${fullText.length} chars in ${chunks.length} chunks`);

    // Dispatch to the right SDK
    if (config.sdkType === "anthropic-native") {
      return this.extractBomWithAnthropic(chunks, config);
    }
    return this.extractBomWithOpenAICompat(chunks, providerName, config);
  }

  /** OpenAI-compatible extraction (OpenAI, xAI/Grok) */
  private async extractBomWithOpenAICompat(
    chunks: string[],
    providerName: AiProviderName,
    config: AiProviderConfig,
  ): Promise<ProviderExtractionResult> {
    let client: OpenAI;
    try {
      client = this.getClient(providerName);
    } catch (err: any) {
      return {
        provider: providerName, displayName: config.displayName, model: config.model,
        items: [], totalTokens: 0, elapsedMs: 0, csiDivisions: [],
        error: err?.message ?? String(err),
      };
    }

    const allBomLines: AiBomLine[] = [];
    let totalTokens = 0;
    const startMs = Date.now();

    for (const chunk of chunks) {
      try {
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: BOM_EXTRACTION_PROMPT },
            { role: "user", content: chunk },
          ],
          temperature: 0.1,
          max_tokens: 16000,
          response_format: { type: "json_object" },
        });

        totalTokens += response.usage?.total_tokens ?? 0;
        const content = response.choices[0]?.message?.content;
        if (content) allBomLines.push(...this.parseAiBomResponse(content, config.displayName));
      } catch (err: any) {
        this.logger.warn(`[${config.displayName}] AI extraction failed for chunk: ${err?.message}`);
      }
    }

    return this.finalizeProviderResult(providerName, config, allBomLines, totalTokens, Date.now() - startMs);
  }

  /** Anthropic-native extraction (Claude) */
  private async extractBomWithAnthropic(
    chunks: string[],
    config: AiProviderConfig,
  ): Promise<ProviderExtractionResult> {
    let client: Anthropic;
    try {
      client = this.getAnthropicClient();
    } catch (err: any) {
      return {
        provider: "anthropic", displayName: config.displayName, model: config.model,
        items: [], totalTokens: 0, elapsedMs: 0, csiDivisions: [],
        error: err?.message ?? String(err),
      };
    }

    const allBomLines: AiBomLine[] = [];
    let totalTokens = 0;
    const startMs = Date.now();

    for (const chunk of chunks) {
      try {
        const response = await client.messages.create({
          model: config.model,
          max_tokens: 16000,
          temperature: 0.1,
          system: BOM_EXTRACTION_PROMPT,
          messages: [
            { role: "user", content: chunk },
          ],
        });

        totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

        // Claude returns content as an array of blocks
        const textBlock = response.content.find((b: any) => b.type === "text");
        const content = (textBlock as any)?.text ?? "";
        if (content) allBomLines.push(...this.parseAiBomResponse(content, config.displayName));
      } catch (err: any) {
        this.logger.warn(`[${config.displayName}] AI extraction failed for chunk: ${err?.message}`);
      }
    }

    return this.finalizeProviderResult("anthropic", config, allBomLines, totalTokens, Date.now() - startMs);
  }

  /** Parse AI response JSON into normalized BOM lines (shared across all providers) */
  private parseAiBomResponse(content: string, displayName: string): AiBomLine[] {
    try {
      // Strip markdown code fences if present (Claude sometimes wraps JSON)
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(cleaned);
      const rawItems: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.items)
          ? parsed.items
          : Array.isArray(parsed.bomLines)
            ? parsed.bomLines
            : Array.isArray(parsed.bom)
              ? parsed.bom
              : Array.isArray(parsed.materials)
                ? parsed.materials
                : [];

      return rawItems.map((raw) => ({
        csiDivision: raw.csiDivision ?? raw.csi_division ?? raw.division ?? null,
        csiDivisionName: raw.csiDivisionName ?? raw.csi_division_name ?? raw.divisionName ?? null,
        description: raw.description ?? raw.item ?? raw.name ?? raw.material ?? "",
        specification: raw.specification ?? raw.spec ?? raw.model ?? raw.specifications ?? raw.manufacturer ?? null,
        qty: raw.qty ?? raw.quantity ?? null,
        unit: raw.unit ?? null,
        sourcePage: raw.sourcePage ?? raw.source_page ?? raw.page ?? null,
        sourceSheet: raw.sourceSheet ?? raw.source_sheet ?? raw.sheet ?? null,
        notes: raw.notes ?? raw.note ?? null,
      })).filter((item) => item.description);
    } catch (err: any) {
      this.logger.warn(`[${displayName}] Failed to parse AI response JSON: ${err?.message}`);
      return [];
    }
  }

  /** Deduplicate and build final result (shared across all providers) */
  private finalizeProviderResult(
    providerName: AiProviderName,
    config: AiProviderConfig,
    allBomLines: AiBomLine[],
    totalTokens: number,
    elapsedMs: number,
  ): ProviderExtractionResult {
    const seen = new Map<string, AiBomLine>();
    for (const line of allBomLines) {
      const key = `${line.description}||${line.specification ?? ""}`.toLowerCase();
      const existing = seen.get(key);
      if (!existing || (line.qty != null && existing.qty == null)) {
        seen.set(key, line);
      }
    }
    const deduped = Array.from(seen.values());
    const csiDivisions = [...new Set(deduped.map((l) => l.csiDivision).filter(Boolean) as string[])].sort();

    return {
      provider: providerName,
      displayName: config.displayName,
      model: config.model,
      items: deduped,
      totalTokens,
      elapsedMs,
      csiDivisions,
    };
  }

  // ── Side-by-Side Comparison ──────────────────────────────────────────

  async compareBomExtraction(uploadId: string): Promise<ComparisonReport> {
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
    });
    if (!upload) throw new NotFoundException("Upload not found");

    // Need extracted text to compare
    const pages: ExtractedPage[] = (upload.extractedTextJson as any) ?? [];
    if (!pages.length) {
      throw new BadRequestException(
        "Text has not been extracted yet. Upload must reach EXTRACTING_BOM status or later.",
      );
    }

    this.logger.log(`Starting side-by-side comparison for upload ${uploadId}`);

    // Determine which providers are available
    const availableProviders: AiProviderName[] = [];
    for (const [name, config] of Object.entries(AI_PROVIDERS)) {
      if (this.configService.get<string>(config.envKey)) {
        availableProviders.push(name as AiProviderName);
      }
    }
    if (availableProviders.length < 2) {
      throw new BadRequestException(
        `Need at least 2 AI providers configured for comparison. Available: ${availableProviders.join(", ") || "none"}`,
      );
    }

    // Run all available providers in parallel
    const allResults = await Promise.all(
      availableProviders.map((p) => this.extractBomWithProvider(pages, p)),
    );
    const [resultA, resultB] = allResults;

    // Analyze differences
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    const aDescSet = new Map<string, AiBomLine>();
    for (const item of resultA.items) {
      aDescSet.set(normalize(item.description), item);
    }

    const bDescSet = new Map<string, AiBomLine>();
    for (const item of resultB.items) {
      bDescSet.set(normalize(item.description), item);
    }

    const onlyInA: AiBomLine[] = [];
    const onlyInB: AiBomLine[] = [];
    const inBoth: { description: string; aSpec: string | null; bSpec: string | null }[] = [];

    for (const [key, item] of aDescSet) {
      if (bDescSet.has(key)) {
        inBoth.push({
          description: item.description,
          aSpec: item.specification,
          bSpec: bDescSet.get(key)!.specification,
        });
      } else {
        onlyInA.push(item);
      }
    }
    for (const [key, item] of bDescSet) {
      if (!aDescSet.has(key)) {
        onlyInB.push(item);
      }
    }

    // Generate recommendation
    let recommendation: string;
    const aCount = resultA.items.length;
    const bCount = resultB.items.length;
    const aDiv = resultA.csiDivisions.length;
    const bDiv = resultB.csiDivisions.length;
    const aErr = resultA.error;
    const bErr = resultB.error;

    if (aErr && bErr) {
      recommendation = "Both providers failed. Check API keys.";
    } else if (aErr) {
      recommendation = `Only ${resultB.displayName} succeeded. Use it as default (AI_PROVIDER=xai).`;
    } else if (bErr) {
      recommendation = `Only ${resultA.displayName} succeeded. Use it as default (AI_PROVIDER=openai).`;
    } else if (aCount === bCount && aDiv === bDiv) {
      const faster = resultA.elapsedMs <= resultB.elapsedMs ? resultA : resultB;
      recommendation = `Both produced similar results (${aCount} items, ${aDiv} CSI divisions). ${faster.displayName} was faster (${faster.elapsedMs}ms). Choose based on cost preference.`;
    } else {
      const moreItems = aCount >= bCount ? resultA : resultB;
      const moreDivs = aDiv >= bDiv ? resultA : resultB;
      if (moreItems.provider === moreDivs.provider) {
        recommendation = `${moreItems.displayName} found more items (${moreItems.items.length} vs ${moreItems === resultA ? bCount : aCount}) and covered more CSI divisions (${moreDivs.csiDivisions.length}). Recommend AI_PROVIDER=${moreItems.provider}.`;
      } else {
        recommendation = `${moreItems.displayName} found more items (${moreItems.items.length}), but ${moreDivs.displayName} covered more CSI divisions (${moreDivs.csiDivisions.length}). Review the unique items below to decide.`;
      }
    }

    return {
      uploadId,
      fileName: upload.fileName,
      pageCount: pages.length,
      results: allResults,
      analysis: {
        itemCountDiff: Math.abs(aCount - bCount),
        onlyInA,
        onlyInB,
        inBoth,
        csiCoverageA: resultA.csiDivisions,
        csiCoverageB: resultB.csiDivisions,
        recommendation,
      },
    };
  }

  // ── 5. Cost Book Matching ────────────────────────────────────────────

  async matchBomToCostBook(uploadId: string) {
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
      include: { bomLines: true },
    });
    if (!upload) throw new NotFoundException("Upload not found");

    // Load the tenant's active cost book
    const costBook = await this.prisma.companyPriceList.findFirst({
      where: { companyId: upload.companyId, isActive: true },
      orderBy: { revision: "desc" },
    });

    if (!costBook) {
      this.logger.warn(`No active cost book for company ${upload.companyId}`);
      await this.prisma.projectDrawingUpload.update({
        where: { id: uploadId },
        data: { unmatchedBomLines: upload.bomLines.length, matchedBomLines: 0 },
      });
      return;
    }

    // Load all cost book items for matching
    const costBookItems = await this.prisma.companyPriceListItem.findMany({
      where: { companyPriceListId: costBook.id },
      select: {
        id: true,
        description: true,
        cat: true,
        sel: true,
        unit: true,
        unitPrice: true,
        divisionCode: true,
        activity: true,
      },
    });

    // Build keyword index for fast matching
    const itemsByKeyword = new Map<string, typeof costBookItems>();
    for (const item of costBookItems) {
      if (!item.description) continue;
      const words = this.extractKeywords(item.description);
      for (const word of words) {
        const list = itemsByKeyword.get(word) ?? [];
        list.push(item);
        itemsByKeyword.set(word, list);
      }
    }

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const bomLine of upload.bomLines) {
      const match = this.findBestMatch(bomLine, costBookItems, itemsByKeyword);

      if (match && match.confidence >= 0.2) {
        await this.prisma.drawingBomLine.update({
          where: { id: bomLine.id },
          data: {
            matchedCostBookItemId: match.companyPriceListItemId,
            matchConfidence: match.confidence,
            matchMethod: match.method,
            unitPrice: match.unitPrice,
            totalPrice:
              match.unitPrice != null && bomLine.qty != null
                ? match.unitPrice * bomLine.qty
                : null,
            isMatched: true,
          },
        });
        matchedCount++;
      } else {
        unmatchedCount++;
      }
    }

    await this.prisma.projectDrawingUpload.update({
      where: { id: uploadId },
      data: { matchedBomLines: matchedCount, unmatchedBomLines: unmatchedCount },
    });

    this.logger.log(
      `Cost book matching for ${uploadId}: ${matchedCount} matched, ${unmatchedCount} unmatched`,
    );
  }

  // ── Construction abbreviation / synonym map ────────────────────────

  private static readonly SYNONYMS: Record<string, string[]> = {
    gwb: ["gypsum", "drywall", "wallboard", "sheetrock"],
    gypsum: ["drywall", "gwb", "wallboard", "sheetrock"],
    drywall: ["gypsum", "gwb", "wallboard", "sheetrock"],
    cmu: ["concrete", "masonry", "block"],
    rebar: ["reinforcing", "reinforcement", "bar"],
    reinforcing: ["rebar", "reinforcement"],
    lvt: ["luxury", "vinyl", "tile", "plank"],
    osb: ["oriented", "strand", "board", "sheathing"],
    hvac: ["heating", "ventilation", "air", "conditioning"],
    ahu: ["air", "handler", "handling", "unit"],
    vav: ["variable", "air", "volume"],
    gfci: ["ground", "fault", "receptacle", "outlet"],
    led: ["light", "fixture", "lamp", "luminaire"],
    pvc: ["pipe", "piping", "plastic"],
    cpvc: ["pipe", "piping", "plastic"],
    abs: ["pipe", "piping", "drain"],
    emt: ["conduit", "electrical", "metallic", "tubing"],
    romex: ["wire", "cable", "nm"],
    xps: ["extruded", "polystyrene", "foam", "insulation"],
    eps: ["expanded", "polystyrene", "foam", "insulation"],
    tpo: ["roofing", "membrane", "thermoplastic"],
    epdm: ["roofing", "membrane", "rubber"],
    wwr: ["welded", "wire", "reinforcement", "mesh"],
    panelboard: ["panel", "electrical", "breaker", "distribution"],
    downspout: ["downspout", "leader", "drain", "gutter"],
    gutter: ["gutter", "downspout", "sheet", "metal"],
    flashing: ["flash", "flashing", "sheet", "metal"],
    underlayment: ["underlayment", "felt", "roofing", "paper"],
    sealant: ["sealant", "caulk", "caulking", "seal"],
    damper: ["damper", "fire", "smoke", "duct"],
    diffuser: ["diffuser", "register", "grille", "supply"],
  };

  // CSI division → likely Xactimate category prefixes
  private static readonly CSI_TO_XACT_CAT: Record<string, string[]> = {
    "03": ["CON", "FND"],
    "04": ["MAS", "STN", "BRK"],
    "05": ["STL", "MTL"],
    "06": ["FRM", "WDT", "TRM", "MLD"],
    "07": ["INS", "RFG", "SDG", "WPR", "FLG"],
    "08": ["DOR", "WIN", "GLS"],
    "09": ["DRY", "PNT", "FLR", "CER", "CPT", "TIL", "PLT"],
    "10": ["FNH", "SPL", "ACE"],
    "11": ["APP", "EQC"],
    "12": ["WDT", "FNH", "FRN"],
    "21": ["PLB", "SPR", "FPS"],
    "22": ["PLB", "PLM", "FXT"],
    "23": ["MEC", "HVC", "DUC"],
    "26": ["ELK", "ELC", "LIT"],
    "27": ["ELK", "ELC"],
    "28": ["ELK", "FRA"],
  };

  // Technical specification tokens to strip (they dilute keyword matching)
  private static readonly SPEC_NOISE = new Set([
    "astm", "nfpa", "ansi", "ashrae", "awc", "aci", "asce", "ieee", "nec",
    "nema", "smacna", "asme", "icc", "aisi", "wfcm",
    "psi", "ratio", "edition", "section", "specification", "specifications",
    "listed", "approved", "compliant", "compliance", "manufactured",
    "manufacture", "domestic", "written", "instructions", "manufacturer",
    "per", "refer", "specs", "specified", "submitted",
    "120v", "208v", "240v", "277v", "480v", "120", "208", "240", "277", "480",
    "120-208v", "120-240v", "208y", "120-208",
    "1ph", "3ph", "1-phase", "3-phase", "single-phase", "three-phase",
    "aic", "300a", "200a", "100a", "400a", "600a", "800a",
    "grade", "corrosion", "resistance", "rating", "greater",
    "c150", "c1396", "c260", "c1064", "a615", "a1064",
  ]);

  private findBestMatch(
    bomLine: { description: string; specification: string | null; csiDivision: string | null; unit: string | null },
    allItems: { id: string; description: string | null; cat: string | null; sel: string | null; unit: string | null; unitPrice: number | null; divisionCode: string | null; activity: string | null }[],
    itemsByKeyword: Map<string, typeof allItems>,
  ): CostBookMatch | null {
    // ── Pass 1: Full keyword match (original + synonyms, spec-noise stripped) ──
    const pass1 = this.scoreCandidates(bomLine, allItems, itemsByKeyword, false);
    if (pass1 && pass1.score >= 0.3) {
      return this.toMatch(pass1, "fuzzy_description");
    }

    // ── Pass 2: Core-material match (description-only, strip ALL spec text) ──
    const pass2 = this.scoreCandidates(bomLine, allItems, itemsByKeyword, true);
    if (pass2 && pass2.score >= 0.25) {
      return this.toMatch(pass2, "core_material");
    }

    // ── Pass 3: CSI→Xact category fallback (match within likely categories) ──
    const bomDiv = bomLine.csiDivision ?? null;
    if (bomDiv) {
      const xactCats = DrawingsBomService.CSI_TO_XACT_CAT[bomDiv] ?? [];
      if (xactCats.length) {
        const catItems = allItems.filter(
          (i) => i.cat && xactCats.some((c) => i.cat!.startsWith(c)),
        );
        if (catItems.length > 0) {
          const catKeywordIdx = new Map<string, typeof allItems>();
          for (const item of catItems) {
            if (!item.description) continue;
            for (const w of this.extractKeywords(item.description)) {
              const list = catKeywordIdx.get(w) ?? [];
              list.push(item);
              catKeywordIdx.set(w, list);
            }
          }
          const pass3 = this.scoreCandidates(bomLine, catItems, catKeywordIdx, true);
          if (pass3 && pass3.score >= 0.2) {
            return this.toMatch(pass3, "csi_category_match");
          }
        }
      }
    }

    // Return best from any pass if it beats a minimum threshold
    const best = [pass1, pass2].filter(Boolean).sort((a, b) => b!.score - a!.score)[0];
    if (best && best.score >= 0.2) {
      return this.toMatch(best, "low_confidence");
    }

    return null;
  }

  private scoreCandidates(
    bomLine: { description: string; specification: string | null; csiDivision: string | null; unit: string | null },
    allItems: { id: string; description: string | null; cat: string | null; sel: string | null; unit: string | null; unitPrice: number | null; divisionCode: string | null; activity: string | null }[],
    itemsByKeyword: Map<string, typeof allItems>,
    coreOnly: boolean,
  ): { item: (typeof allItems)[0]; score: number } | null {
    const bomDesc = (bomLine.description ?? "").toLowerCase();
    const bomSpec = (bomLine.specification ?? "").toLowerCase();
    const bomDiv = bomLine.csiDivision ?? null;

    // Build BOM keywords with synonym expansion
    let rawText = coreOnly ? bomDesc : bomDesc + " " + bomSpec;
    let bomKeywords = this.extractKeywords(rawText, coreOnly);

    // Expand with synonyms
    const expanded = new Set(bomKeywords);
    for (const kw of bomKeywords) {
      const syns = DrawingsBomService.SYNONYMS[kw];
      if (syns) syns.forEach((s) => expanded.add(s));
    }
    bomKeywords = [...expanded];

    type Scored = { item: (typeof allItems)[0]; score: number };
    const candidates: Scored[] = [];
    const candidateIds = new Set<string>();

    for (const kw of bomKeywords) {
      const items = itemsByKeyword.get(kw) ?? [];
      for (const item of items) {
        if (candidateIds.has(item.id)) continue;
        candidateIds.add(item.id);

        const itemDesc = (item.description ?? "").toLowerCase();
        const itemKeywords = this.extractKeywords(itemDesc, false);

        // Jaccard-style keyword overlap
        const overlap = bomKeywords.filter((k) => itemKeywords.includes(k)).length;
        const union = new Set([...bomKeywords, ...itemKeywords]).size;
        let score = union > 0 ? overlap / union : 0;

        // Boost if Xact category aligns with CSI division
        if (bomDiv && item.cat) {
          const xactCats = DrawingsBomService.CSI_TO_XACT_CAT[bomDiv] ?? [];
          if (xactCats.some((c) => item.cat!.startsWith(c))) {
            score += 0.12;
          }
        }

        // Boost if unit matches
        if (bomLine.unit && item.unit && bomLine.unit.toUpperCase() === item.unit.toUpperCase()) {
          score += 0.05;
        }

        // Boost for specification substring match
        if (bomSpec && itemDesc.includes(bomSpec)) {
          score += 0.2;
        }

        // Boost if BOM description core words appear in item description
        const coreWords = this.extractCoreWords(bomDesc);
        const itemLower = itemDesc;
        const coreHits = coreWords.filter((w) => itemLower.includes(w)).length;
        if (coreWords.length > 0 && coreHits >= Math.ceil(coreWords.length * 0.5)) {
          score += 0.1;
        }

        if (score > 0.08) {
          candidates.push({ item, score: Math.min(score, 1) });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] ?? null;
  }

  private toMatch(
    scored: { item: { id: string; description: string | null; cat: string | null; sel: string | null; unitPrice: number | null; unit: string | null }; score: number },
    method: string,
  ): CostBookMatch {
    return {
      companyPriceListItemId: scored.item.id,
      description: scored.item.description ?? "",
      cat: scored.item.cat ?? null,
      sel: scored.item.sel ?? null,
      unitPrice: scored.item.unitPrice ?? null,
      unit: scored.item.unit ?? null,
      confidence: scored.score,
      method,
    };
  }

  /** Extract the 1-3 core material words from a BOM description (strip qualifiers). */
  private extractCoreWords(text: string): string[] {
    const qualifiers = new Set([
      "for", "system", "assembly", "automatic", "manual", "standard",
      "grade", "high", "low", "medium", "heavy", "light", "duty",
      "commercial", "residential", "interior", "exterior",
    ]);
    return text
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !qualifiers.has(w))
      .slice(0, 4);
  }

  private extractKeywords(text: string, stripSpecNoise = false): string[] {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "of", "for", "in", "on", "at", "to",
      "with", "by", "from", "as", "is", "are", "be", "per", "all", "each",
      "type", "see", "ref", "provide", "install", "shall", "w", "min", "max",
      "not", "also", "use", "used", "using", "including", "included",
    ]);
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => {
        if (w.length < 3) return false;
        if (stopWords.has(w)) return false;
        if (stripSpecNoise && DrawingsBomService.SPEC_NOISE.has(w)) return false;
        // Filter pure numbers (pipe sizes, voltages, etc.)
        if (stripSpecNoise && /^\d+$/.test(w)) return false;
        return true;
      });
  }

  // ── 6. PETL Generation ───────────────────────────────────────────────

  async generatePetl(uploadId: string, actor: AuthenticatedUser) {
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
      include: { bomLines: true },
    });
    if (!upload) throw new NotFoundException("Upload not found");

    if (upload.status !== DrawingUploadStatus.READY) {
      throw new BadRequestException(
        `Upload is in '${upload.status}' state. Must be READY to generate PETL.`,
      );
    }

    await this.updateStatus(uploadId, DrawingUploadStatus.GENERATING);

    try {
      const project = await this.prisma.project.findUnique({
        where: { id: upload.projectId },
      });
      if (!project) throw new NotFoundException("Project not found");

      // Create or reuse a manual_cost_book estimate version
      let estimateVersion = await this.prisma.estimateVersion.findFirst({
        where: {
          projectId: upload.projectId,
          OR: [
            { sourceType: "drawings_bom" },
            { sourceType: "manual_cost_book" },
          ],
        },
        orderBy: [{ sequenceNo: "desc" }],
      });

      if (!estimateVersion) {
        const maxAgg = await this.prisma.estimateVersion.aggregate({
          where: { projectId: upload.projectId },
          _max: { sequenceNo: true },
        });
        const nextSeq = (maxAgg._max.sequenceNo ?? 0) + 1;

        estimateVersion = await this.prisma.estimateVersion.create({
          data: {
            projectId: upload.projectId,
            sourceType: "drawings_bom",
            fileName: `Drawings BOM – ${upload.fileName}`.slice(0, 255),
            storedPath: upload.storedPath,
            estimateKind: "manual",
            sequenceNo: nextSeq,
            defaultPayerType: "Client",
            description: `BOM estimate from architectural drawings: ${upload.fileName}`,
            status: "completed",
            importedByUserId: actor.userId,
            importedAt: new Date(),
          },
        });
      }

      // Ensure SOW exists
      let sow = await this.prisma.sow.findFirst({
        where: { projectId: upload.projectId, estimateVersionId: estimateVersion.id },
      });
      if (!sow) {
        sow = await this.prisma.sow.create({
          data: {
            projectId: upload.projectId,
            estimateVersionId: estimateVersion.id,
            sourceType: "drawings_bom",
            totalAmount: null,
          },
        });
      }

      // Ensure a default project particle exists
      const particle = await this.ensureDefaultParticle(upload.projectId, project.companyId, project.name);

      // Get next line number
      const maxLineAgg = await this.prisma.sowItem.aggregate({
        where: { estimateVersionId: estimateVersion.id },
        _max: { lineNo: true },
      });
      let nextLineNo = (maxLineAgg._max.lineNo ?? 0) + 1;

      // Create SowItem for each BOM line
      let totalAmount = 0;
      const createdItems: string[] = [];

      for (const bomLine of upload.bomLines) {
        const unitPrice = bomLine.unitPrice ?? 0;
        const qty = bomLine.qty ?? 1;
        const amount = unitPrice * qty;
        totalAmount += amount;

        // Create a RawXactRow placeholder for the SowItem FK requirement
        const rawRow = await this.prisma.rawXactRow.create({
          data: {
            estimateVersionId: estimateVersion.id,
            lineNo: nextLineNo,
            desc: bomLine.description,
            qty: bomLine.qty,
            unit: bomLine.unit,
            unitCost: unitPrice,
            itemAmount: amount,
            rcv: amount,
            note1: bomLine.specification
              ? `Spec: ${bomLine.specification}`
              : null,
          },
        });

        // Create logical item
        const signatureHash = `drawings-bom::${bomLine.id}`;
        const logicalItem = await this.prisma.sowLogicalItem.create({
          data: {
            projectId: upload.projectId,
            projectParticleId: particle.id,
            signatureHash,
          },
        });

        // Create the PETL line (SowItem)
        const sowItem = await this.prisma.sowItem.create({
          data: {
            sowId: sow.id,
            estimateVersionId: estimateVersion.id,
            rawRowId: rawRow.id,
            logicalItemId: logicalItem.id,
            projectParticleId: particle.id,
            lineNo: nextLineNo,
            sourceLineNo: bomLine.lineNo,
            description: bomLine.description,
            itemNote: [
              bomLine.specification ? `Spec: ${bomLine.specification}` : null,
              bomLine.csiDivisionName ? `CSI ${bomLine.csiDivision} – ${bomLine.csiDivisionName}` : null,
              bomLine.notes,
            ].filter(Boolean).join(" | ") || null,
            qty: bomLine.qty ?? 1,
            originalQty: bomLine.qty ?? 1,
            unit: bomLine.unit ?? "EA",
            unitCost: unitPrice,
            itemAmount: amount,
            rcvAmount: amount,
            acvAmount: amount,
            categoryCode: bomLine.csiDivision ?? null,
            selectionCode: null,
            activity: null,
            payerType: "Client",
            percentComplete: 0,
          },
        });

        createdItems.push(sowItem.id);
        nextLineNo++;
      }

      // Update SOW total
      await this.prisma.sow.update({
        where: { id: sow.id },
        data: { totalAmount },
      });

      // Mark upload as completed with the generated estimate version
      await this.prisma.projectDrawingUpload.update({
        where: { id: uploadId },
        data: {
          status: DrawingUploadStatus.COMPLETED,
          generatedEstimateVersionId: estimateVersion.id,
        },
      });

      this.logger.log(
        `PETL generated for upload ${uploadId}: ${createdItems.length} items, $${totalAmount.toFixed(2)} total`,
      );

      return {
        estimateVersionId: estimateVersion.id,
        sowId: sow.id,
        itemsCreated: createdItems.length,
        totalAmount,
      };
    } catch (err: any) {
      await this.updateStatus(uploadId, DrawingUploadStatus.FAILED, err?.message);
      throw err;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async ensureDefaultParticle(projectId: string, companyId: string, projectName: string) {
    const existing = await this.prisma.projectParticle.findFirst({
      where: {
        projectId,
        companyId,
        buildingId: null,
        unitId: null,
        fullLabel: projectName,
      },
    });
    if (existing) return existing;

    return this.prisma.projectParticle.create({
      data: {
        companyId,
        projectId,
        buildingId: null,
        unitId: null,
        type: "ROOM",
        name: projectName,
        fullLabel: projectName,
      },
    });
  }

  private async updateStatus(uploadId: string, status: DrawingUploadStatus, errorMessage?: string) {
    await this.prisma.projectDrawingUpload.update({
      where: { id: uploadId },
      data: { status, ...(errorMessage ? { errorMessage } : {}) },
    });
  }

  // ── Query endpoints ──────────────────────────────────────────────────

  async getUpload(uploadId: string, companyId: string, source?: string) {
    const validSources = ["xai", "anthropic", "consensus", "all"];
    const filterSource = source && validSources.includes(source) && source !== "all" ? source : undefined;

    const upload = await this.prisma.projectDrawingUpload.findFirst({
      where: { id: uploadId, companyId },
      include: {
        bomLines: {
          where: filterSource ? { aiSource: filterSource } : undefined,
          orderBy: { lineNo: "asc" },
        },
        _count: { select: { bomLines: true } },
      },
    });
    if (!upload) throw new NotFoundException("Drawing upload not found");

    // Compute per-source counts for the toggle UI
    const sourceCounts = await this.prisma.drawingBomLine.groupBy({
      by: ["aiSource"],
      where: { uploadId },
      _count: true,
    });

    return {
      ...upload,
      fileSizeBytes: upload.fileSizeBytes != null ? Number(upload.fileSizeBytes) : null,
      sourceCounts: sourceCounts.reduce(
        (acc, row) => ({ ...acc, [row.aiSource ?? "unknown"]: row._count }),
        {} as Record<string, number>,
      ),
    };
  }

  async listUploads(projectId: string, companyId: string) {
    return this.prisma.projectDrawingUpload.findMany({
      where: { projectId, companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        pageCount: true,
        status: true,
        totalBomLines: true,
        matchedBomLines: true,
        unmatchedBomLines: true,
        createdAt: true,
        generatedEstimateVersionId: true,
      },
    });
  }

  async updateBomLine(
    bomLineId: string,
    companyId: string,
    data: {
      matchedCostBookItemId?: string | null;
      unitPrice?: number | null;
      qty?: number | null;
      unit?: string | null;
      notes?: string | null;
    },
  ) {
    const bomLine = await this.prisma.drawingBomLine.findUnique({
      where: { id: bomLineId },
      include: { upload: true },
    });
    if (!bomLine || bomLine.upload.companyId !== companyId) {
      throw new NotFoundException("BOM line not found");
    }

    const updateData: any = {};

    if (data.matchedCostBookItemId !== undefined) {
      updateData.matchedCostBookItemId = data.matchedCostBookItemId;
      updateData.isMatched = data.matchedCostBookItemId != null;
      updateData.matchMethod = data.matchedCostBookItemId ? "manual" : null;
      updateData.matchConfidence = data.matchedCostBookItemId ? 1.0 : null;

      // If a cost book item was selected, pull its price
      if (data.matchedCostBookItemId) {
        const item = await this.prisma.companyPriceListItem.findUnique({
          where: { id: data.matchedCostBookItemId },
          select: { unitPrice: true, unit: true },
        });
        if (item) {
          updateData.unitPrice = item.unitPrice;
          updateData.unit = item.unit ?? bomLine.unit;
          const qty = data.qty ?? bomLine.qty ?? 1;
          updateData.totalPrice = (item.unitPrice ?? 0) * qty;
        }
      }
    }

    if (data.unitPrice !== undefined) {
      updateData.unitPrice = data.unitPrice;
      updateData.isManualPrice = true;
      const qty = data.qty ?? bomLine.qty ?? 1;
      updateData.totalPrice = (data.unitPrice ?? 0) * qty;
    }

    if (data.qty !== undefined) updateData.qty = data.qty;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.notes !== undefined) updateData.notes = data.notes;

    return this.prisma.drawingBomLine.update({
      where: { id: bomLineId },
      data: updateData,
    });
  }
}
