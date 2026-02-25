import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DrawingUploadStatus } from "@prisma/client";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);

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

type AiProviderName = "openai" | "xai";

interface AiProviderConfig {
  name: AiProviderName;
  displayName: string;
  baseURL?: string;
  model: string;
  envKey: string;
}

const AI_PROVIDERS: Record<AiProviderName, AiProviderConfig> = {
  openai: {
    name: "openai",
    displayName: "OpenAI GPT-4o",
    model: "gpt-4o",
    envKey: "OPENAI_API_KEY",
    // baseURL defaults to OpenAI's
  },
  xai: {
    name: "xai",
    displayName: "xAI Grok-3",
    baseURL: "https://api.x.ai/v1",
    model: "grok-3",
    envKey: "XAI_API_KEY",
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  private getDefaultProvider(): AiProviderName {
    const env = this.configService.get<string>("AI_PROVIDER");
    if (env === "xai" || env === "openai") return env;
    // Fallback: use whichever key is configured (prefer xai if both present)
    if (this.configService.get<string>("XAI_API_KEY")) return "xai";
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

    // Store the file locally (in prod this would go to GCS)
    const uploadsDir = path.join(process.cwd(), "uploads", "drawings");
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const safeName = file.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    const storedPath = path.join(uploadsDir, storedName);
    await fs.promises.writeFile(storedPath, file.buffer);

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

      // Step 2: AI BOM extraction
      await this.updateStatus(uploadId, DrawingUploadStatus.EXTRACTING_BOM);
      const bomLines = await this.extractBomWithAI(uploadId, pages);

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

  private async extractPdfText(uploadId: string): Promise<ExtractedPage[]> {
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
    });
    if (!upload) throw new Error(`Upload ${uploadId} not found`);

    if (!fs.existsSync(upload.storedPath)) {
      throw new Error(`PDF file not found at ${upload.storedPath}`);
    }

    // Write to temp path for PDFParse (it works better with file paths)
    const tempPath = `/tmp/drawings-bom-${Date.now()}.pdf`;
    const buffer = await fs.promises.readFile(upload.storedPath);
    await writeFile(tempPath, buffer);

    let rawText: string;
    try {
      const pdfParser = new PDFParse({ url: tempPath });
      const result = await pdfParser.getText();
      rawText = result?.text || "";
    } finally {
      fs.unlink(tempPath, () => {});
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

    // Persist extracted text and page count
    await this.prisma.projectDrawingUpload.update({
      where: { id: uploadId },
      data: {
        pageCount: pages.length || rawPages.length,
        extractedTextJson: pages as any,
      },
    });

    this.logger.log(`Extracted text from ${pages.length} pages for upload ${uploadId}`);
    return pages;
  }

  // ── 4. AI BOM Extraction ─────────────────────────────────────────────

  private async extractBomWithAI(
    uploadId: string,
    pages: ExtractedPage[],
  ): Promise<AiBomLine[]> {
    const provider = this.getDefaultProvider();
    const result = await this.extractBomWithProvider(pages, provider);

    // Persist BOM lines
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
    });

    if (upload) {
      // Clear any prior BOM lines for re-runs
      await this.prisma.drawingBomLine.deleteMany({ where: { uploadId } });

      if (result.items.length > 0) {
        await this.prisma.drawingBomLine.createMany({
          data: result.items.map((line, idx) => ({
            uploadId,
            lineNo: idx + 1,
            csiDivision: line.csiDivision ?? null,
            csiDivisionName: line.csiDivisionName ?? null,
            description: line.description,
            specification: line.specification ?? null,
            qty: line.qty ?? null,
            unit: line.unit ?? null,
            sourcePage: line.sourcePage ?? null,
            sourceSheet: line.sourceSheet ?? null,
            notes: line.notes ?? null,
            needsReview: true,
            isMatched: false,
          })),
        });
      }

      await this.prisma.projectDrawingUpload.update({
        where: { id: uploadId },
        data: {
          totalBomLines: result.items.length,
          aiModelUsed: `${provider}:${result.model}`,
          aiTokensUsed: result.totalTokens,
          aiExtractionMs: result.elapsedMs,
        },
      });
    }

    this.logger.log(
      `AI extracted ${result.items.length} BOM lines via ${result.displayName} (${result.totalTokens} tokens, ${result.elapsedMs}ms) for upload ${uploadId}`,
    );
    return result.items;
  }

  // ── Core extraction (provider-agnostic) ──────────────────────────────

  private async extractBomWithProvider(
    pages: ExtractedPage[],
    providerName: AiProviderName,
  ): Promise<ProviderExtractionResult> {
    const config = AI_PROVIDERS[providerName];
    let client: OpenAI;

    try {
      client = this.getClient(providerName);
    } catch (err: any) {
      return {
        provider: providerName,
        displayName: config.displayName,
        model: config.model,
        items: [],
        totalTokens: 0,
        elapsedMs: 0,
        csiDivisions: [],
        error: err?.message ?? String(err),
      };
    }

    // Chunk by character count (~20K chars ≈ 5K tokens per chunk) to stay within
    // context limits and get better extraction quality.
    const MAX_CHARS_PER_CHUNK = 20_000;
    const chunks: string[] = [];

    // First, build the full text with page markers
    const allPageTexts: string[] = [];
    for (const p of pages) {
      allPageTexts.push(`--- PAGE ${p.page} (Sheet: ${p.sheetId ?? "unknown"}) ---\n${p.text}`);
    }
    const fullText = allPageTexts.join("\n\n");

    // Split into chunks by character count, breaking at line boundaries
    if (fullText.length <= MAX_CHARS_PER_CHUNK) {
      chunks.push(fullText);
    } else {
      let offset = 0;
      while (offset < fullText.length) {
        let end = Math.min(offset + MAX_CHARS_PER_CHUNK, fullText.length);
        // Try to break at a newline to avoid splitting mid-sentence
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
        if (!content) continue;

        // Parse JSON — handle both array and {items: [...]} formats
        const parsed = JSON.parse(content);
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

        // Normalize field names — different providers use different keys
        const items: AiBomLine[] = rawItems.map((raw) => ({
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

        allBomLines.push(...items);
      } catch (err: any) {
        this.logger.warn(`[${config.displayName}] AI extraction failed for chunk: ${err?.message}`);
      }
    }

    const elapsedMs = Date.now() - startMs;

    // Deduplicate by description + specification
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

    // Run both providers in parallel
    const [resultA, resultB] = await Promise.all([
      this.extractBomWithProvider(pages, "openai"),
      this.extractBomWithProvider(pages, "xai"),
    ]);

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
      results: [resultA, resultB],
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

      if (match && match.confidence >= 0.3) {
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

  private findBestMatch(
    bomLine: { description: string; specification: string | null; csiDivision: string | null; unit: string | null },
    allItems: { id: string; description: string | null; cat: string | null; sel: string | null; unit: string | null; unitPrice: number | null; divisionCode: string | null; activity: string | null }[],
    itemsByKeyword: Map<string, typeof allItems>,
  ): CostBookMatch | null {
    const bomDesc = (bomLine.description ?? "").toLowerCase();
    const bomSpec = (bomLine.specification ?? "").toLowerCase();
    const bomKeywords = this.extractKeywords(bomDesc + " " + bomSpec);
    const bomDiv = bomLine.csiDivision ?? null;

    // Candidate scoring
    type Scored = { item: (typeof allItems)[0]; score: number; method: string };
    const candidates: Scored[] = [];

    // Gather candidates from keyword overlap
    const candidateIds = new Set<string>();
    for (const kw of bomKeywords) {
      const items = itemsByKeyword.get(kw) ?? [];
      for (const item of items) {
        if (candidateIds.has(item.id)) continue;
        candidateIds.add(item.id);

        const itemDesc = (item.description ?? "").toLowerCase();
        const itemKeywords = this.extractKeywords(itemDesc);

        // Jaccard-style keyword overlap
        const overlap = bomKeywords.filter((k) => itemKeywords.includes(k)).length;
        const union = new Set([...bomKeywords, ...itemKeywords]).size;
        let score = union > 0 ? overlap / union : 0;

        // Boost if CSI division matches
        if (bomDiv && item.divisionCode && bomDiv === item.divisionCode) {
          score += 0.15;
        }

        // Boost if unit matches
        if (bomLine.unit && item.unit && bomLine.unit.toUpperCase() === item.unit.toUpperCase()) {
          score += 0.05;
        }

        // Boost for specification substring match
        if (bomSpec && itemDesc.includes(bomSpec)) {
          score += 0.2;
        }

        if (score > 0.1) {
          candidates.push({ item, score: Math.min(score, 1), method: "fuzzy_description" });
        }
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    if (!best) return null;

    return {
      companyPriceListItemId: best.item.id,
      description: best.item.description ?? "",
      cat: best.item.cat ?? null,
      sel: best.item.sel ?? null,
      unitPrice: best.item.unitPrice ?? null,
      unit: best.item.unit ?? null,
      confidence: best.score,
      method: best.method,
    };
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "of", "for", "in", "on", "at", "to",
      "with", "by", "from", "as", "is", "are", "be", "per", "all", "each",
      "type", "see", "ref", "provide", "install", "shall", "w", "min", "max",
    ]);
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
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

  async getUpload(uploadId: string, companyId: string) {
    const upload = await this.prisma.projectDrawingUpload.findFirst({
      where: { id: uploadId, companyId },
      include: {
        bomLines: {
          orderBy: { lineNo: "asc" },
        },
        _count: { select: { bomLines: true } },
      },
    });
    if (!upload) throw new NotFoundException("Drawing upload not found");

    return {
      ...upload,
      fileSizeBytes: upload.fileSizeBytes != null ? Number(upload.fileSizeBytes) : null,
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
