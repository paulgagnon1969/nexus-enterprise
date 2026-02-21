import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ManualVersionChangeType } from "@prisma/client";
import * as crypto from "crypto";
import { XMLParser } from "fast-xml-parser";

const ECFR_BASE = "https://www.ecfr.gov";
const CFR_TITLE = 29;
const CFR_PART = 1926;
const MANUAL_CODE = "osha-29cfr1926";
const MANUAL_TITLE = "OSHA Construction Standards (29 CFR 1926)";
const MANUAL_ICON = "🛡️";
const MANUAL_CATEGORY = "Safety & Compliance";

interface ParsedSection {
  subpartLetter: string;
  subpartTitle: string;
  sectionNumber: string; // e.g. "501"
  sectionCfr: string; // e.g. "1926.501"
  title: string;
  htmlContent: string;
  contentHash: string;
  sortOrder: number;
}

interface SyncResult {
  manualId: string;
  totalSections: number;
  newSections: number;
  updatedSections: number;
  unchangedSections: number;
  subpartCount: number;
  ecfrAmendedDate: string | null;
}

@Injectable()
export class OshaSyncService {
  private readonly logger = new Logger(OshaSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  // ---------------------------------------------------------------------------
  // eCFR API helpers
  // ---------------------------------------------------------------------------

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Fetch the eCFR titles metadata to get latest_amended_on for Title 29. */
  async getEcfrTitleMeta(): Promise<{ latestAmendedOn: string | null; upToDateAsOf: string | null }> {
    const res = await fetch(`${ECFR_BASE}/api/versioner/v1/titles`);
    if (!res.ok) throw new Error(`eCFR titles API returned ${res.status}`);
    const data: any = await res.json();
    const title29 = data.titles?.find((t: any) => t.number === CFR_TITLE);
    return {
      latestAmendedOn: title29?.latest_amended_on ?? null,
      upToDateAsOf: title29?.up_to_date_as_of ?? null,
    };
  }

  /** Fetch full XML for Part 1926 from the eCFR versioner. */
  async fetchPartXml(date?: string): Promise<string> {
    const d = date || this.todayIso();
    const url = `${ECFR_BASE}/api/versioner/v1/full/${d}/title-${CFR_TITLE}.xml?part=${CFR_PART}`;
    this.logger.log(`Fetching eCFR XML: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`eCFR full XML returned ${res.status}`);
    return res.text();
  }

  /** Fetch the structural TOC for Part 1926. */
  async fetchStructure(date?: string): Promise<any> {
    const d = date || this.todayIso();
    const url = `${ECFR_BASE}/api/versioner/v1/structure/${d}/title-${CFR_TITLE}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`eCFR structure API returned ${res.status}`);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // XML → HTML parsing
  // ---------------------------------------------------------------------------

  /** Convert eCFR XML text elements to clean HTML. */
  private xmlNodeToHtml(node: any): string {
    if (typeof node === "string") return this.escapeHtml(node);
    if (typeof node === "number") return String(node);
    if (!node) return "";
    if (Array.isArray(node)) return node.map((n) => this.xmlNodeToHtml(n)).join("");

    // Handle text content nodes
    if (node["#text"] !== undefined) {
      let text = this.escapeHtml(String(node["#text"]));
      return text;
    }

    return "";
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Recursively convert a parsed XML element into HTML. */
  private elementToHtml(el: any, tagName: string): string {
    if (el === undefined || el === null) return "";

    const attrs = el[":@"] || {};

    // Handle arrays (multiple sibling elements of the same tag)
    if (Array.isArray(el)) {
      return el.map((item) => this.elementToHtml(item, tagName)).join("\n");
    }

    // Simple text content
    if (typeof el === "string") return this.mapTag(tagName, this.escapeHtml(el), attrs);
    if (typeof el === "number") return this.mapTag(tagName, String(el), attrs);

    // Object with children
    let inner = "";

    // Handle #text
    if (el["#text"] !== undefined) {
      inner += this.escapeHtml(String(el["#text"]));
    }

    // Recurse into child elements
    for (const key of Object.keys(el)) {
      if (key === "#text" || key === ":@") continue;
      const child = el[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          inner += this.elementToHtml(c, key);
        }
      } else {
        inner += this.elementToHtml(child, key);
      }
    }

    return this.mapTag(tagName, inner, attrs);
  }

  /** Map eCFR XML tags to HTML equivalents. */
  private mapTag(tag: string, inner: string, attrs: any = {}): string {
    const t = tag.toUpperCase();
    switch (t) {
      case "HD": {
        const src = attrs?.SOURCE || attrs?.source || "";
        if (src === "HD1" || src === "HED") return `<h3>${inner}</h3>\n`;
        if (src === "HD2") return `<h4>${inner}</h4>\n`;
        if (src === "HD3") return `<h5>${inner}</h5>\n`;
        return `<h4>${inner}</h4>\n`;
      }
      case "P":
        return `<p>${inner}</p>\n`;
      case "FP":
        return `<p class="flush">${inner}</p>\n`;
      case "NOTE":
        return `<div class="osha-note">${inner}</div>\n`;
      case "EXTRACT":
        return `<blockquote>${inner}</blockquote>\n`;
      case "CITA":
        return `<cite>${inner}</cite>\n`;
      case "E": {
        const type = attrs?.T || attrs?.t || "";
        if (type === "03") return `<em>${inner}</em>`;
        if (type === "04") return `<strong>${inner}</strong>`;
        return `<em>${inner}</em>`;
      }
      case "SU":
        return `<sup>${inner}</sup>`;
      case "AC":
        return inner; // accent — just pass through
      case "AUTH":
      case "SOURCE":
        return `<div class="osha-auth"><small>${inner}</small></div>\n`;
      case "SECAUTH":
        return ""; // Skip section authority references
      case "SECTNO":
        return ""; // We handle section number in the title
      case "SUBJECT":
        return ""; // We handle subject in the title
      case "CONTENTS":
        return ""; // Skip TOC elements
      case "HEAD":
        return `<h3>${inner}</h3>\n`;
      case "SUBPART":
      case "DIV5":
      case "DIV6":
      case "DIV7":
      case "DIV8":
      case "DIV9":
        return inner; // Container — just pass children through
      case "PRTPAGE":
        return ""; // Page reference — skip
      case "FTNT":
        return `<div class="footnote"><small>${inner}</small></div>\n`;
      case "SIG":
        return `<div class="signature"><small>${inner}</small></div>\n`;
      case "GPH":
      case "GID":
        return `<p class="osha-graphic">[Graphic — see original at ecfr.gov]</p>\n`;
      case "MATH":
        return `<p class="osha-math">[Mathematical formula — see original at ecfr.gov]</p>\n`;
      case "APPENDIX":
        return `<div class="osha-appendix">${inner}</div>\n`;
      case "RESERVED":
        return `<p><em>[Reserved]</em></p>\n`;
      default:
        // Pass through unknown elements
        return inner;
    }
  }

  /** Parse full Part 1926 XML into individual sections. */
  parseXmlToSections(xml: string): ParsedSection[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      attributesGroupName: ":@",
      preserveOrder: true,
      textNodeName: "#text",
      trimValues: false,
    });

    const parsed = parser.parse(xml);
    const sections: ParsedSection[] = [];
    let globalSort = 0;

    // Walk the parsed tree to find sections
    this.walkForSections(parsed, sections, globalSort);

    return sections;
  }

  private walkForSections(
    nodes: any[],
    sections: ParsedSection[],
    sortCounter: number,
    currentSubpart?: { letter: string; title: string },
  ): number {
    if (!Array.isArray(nodes)) return sortCounter;

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "#text" || key === ":@") continue;
        const upper = key.toUpperCase();

        // Detect SUBPART containers
        if (upper === "SUBPART" || upper === "DIV5") {
          const children = node[key];
          if (Array.isArray(children)) {
            // Try to extract subpart heading
            const subInfo = this.extractSubpartInfo(children);
            const sub = subInfo || currentSubpart || { letter: "?", title: "General" };
            sortCounter = this.walkForSections(children, sections, sortCounter, sub);
          }
          continue;
        }

        // Detect SECTION containers (DIV8)
        if (upper === "SECTION" || upper === "DIV8") {
          const children = node[key];
          if (Array.isArray(children)) {
            const section = this.extractSection(children, currentSubpart);
            if (section) {
              sortCounter++;
              sections.push({ ...section, sortOrder: sortCounter });
            }
          }
          continue;
        }

        // Recurse into other containers
        const child = node[key];
        if (Array.isArray(child)) {
          sortCounter = this.walkForSections(child, sections, sortCounter, currentSubpart);
        }
      }
    }

    return sortCounter;
  }

  private extractSubpartInfo(nodes: any[]): { letter: string; title: string } | null {
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key.toUpperCase() === "HEAD" || key.toUpperCase() === "HD") {
          const text = this.getTextContent(node[key]);
          // Pattern: "Subpart M—Fall Protection" or "Subpart M - Fall Protection"
          const match = text.match(/Subpart\s+([A-Z]{1,2})\s*[\u2014\-—–]\s*(.*)/i);
          if (match) {
            return { letter: match[1].toUpperCase(), title: match[2].trim() };
          }
          // Simpler: "Subpart A"
          const simpleMatch = text.match(/Subpart\s+([A-Z]{1,2})/i);
          if (simpleMatch) {
            return { letter: simpleMatch[1].toUpperCase(), title: text.replace(/Subpart\s+[A-Z]{1,2}\s*[\u2014\-—–]?\s*/, "").trim() || `Subpart ${simpleMatch[1]}` };
          }
        }
      }
    }
    return null;
  }

  private extractSection(
    nodes: any[],
    currentSubpart?: { letter: string; title: string },
  ): Omit<ParsedSection, "sortOrder"> | null {
    let sectionNumber = "";
    let title = "";
    let bodyHtml = "";

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "#text" || key === ":@") continue;
        const upper = key.toUpperCase();

        if (upper === "SECTNO") {
          sectionNumber = this.getTextContent(node[key]).replace("§", "").trim();
          // e.g., "1926.501"
        } else if (upper === "SUBJECT") {
          title = this.getTextContent(node[key]).trim();
        } else if (upper === "RESERVED") {
          title = this.getTextContent(node[key]).trim() || "[Reserved]";
          bodyHtml += `<p><em>[Reserved]</em></p>\n`;
        } else {
          // Build HTML from other elements
          const attrs = node[":@"] || {};
          bodyHtml += this.elementToHtml(node[key], key);
        }
      }
    }

    if (!sectionNumber) return null;

    // Clean section number: "1926.501" → "501"
    const shortNum = sectionNumber.replace(`${CFR_PART}.`, "");
    const sub = currentSubpart || { letter: "?", title: "General" };

    const fullHtml = [
      `<div class="osha-section" data-section="${sectionNumber}">`,
      `<h2>§${sectionNumber} — ${title}</h2>`,
      bodyHtml,
      `</div>`,
    ].join("\n");

    return {
      subpartLetter: sub.letter,
      subpartTitle: sub.title,
      sectionNumber: shortNum,
      sectionCfr: sectionNumber,
      title: `§${sectionNumber} — ${title}`,
      htmlContent: fullHtml,
      contentHash: this.hashContent(fullHtml),
    };
  }

  private getTextContent(el: any): string {
    if (typeof el === "string") return el;
    if (typeof el === "number") return String(el);
    if (!el) return "";
    if (Array.isArray(el)) return el.map((e) => this.getTextContent(e)).join("");
    if (el["#text"] !== undefined) return String(el["#text"]);
    // Recurse into children
    let text = "";
    for (const key of Object.keys(el)) {
      if (key === ":@") continue;
      text += this.getTextContent(el[key]);
    }
    return text;
  }

  // ---------------------------------------------------------------------------
  // Sync orchestration
  // ---------------------------------------------------------------------------

  /** Check if eCFR has newer amendments than our last sync. */
  async checkForUpdates(): Promise<{
    hasUpdates: boolean;
    ecfrDate: string | null;
    storedDate: string | null;
    syncStatus: string;
  }> {
    const meta = await this.getEcfrTitleMeta();
    const state = await this.prisma.oshaSyncState.findUnique({
      where: { cfrTitle_cfrPart: { cfrTitle: CFR_TITLE, cfrPart: CFR_PART } },
    });

    return {
      hasUpdates: !state?.lastAmendedDate || state.lastAmendedDate !== meta.latestAmendedOn,
      ecfrDate: meta.latestAmendedOn,
      storedDate: state?.lastAmendedDate ?? null,
      syncStatus: state?.syncStatus ?? "NEVER",
    };
  }

  /** Get current sync status. */
  async getSyncStatus() {
    const state = await this.prisma.oshaSyncState.findUnique({
      where: { cfrTitle_cfrPart: { cfrTitle: CFR_TITLE, cfrPart: CFR_PART } },
    });
    return state ?? {
      cfrTitle: CFR_TITLE,
      cfrPart: CFR_PART,
      syncStatus: "NEVER",
      lastSyncedAt: null,
      lastAmendedDate: null,
      sectionCount: 0,
      manualId: null,
      lastError: null,
    };
  }

  /** Full sync: fetch, parse, upsert all sections + manual structure. */
  async syncOsha(userId: string): Promise<SyncResult> {
    this.logger.log("Starting OSHA 29 CFR 1926 sync...");

    // Mark as syncing
    await this.prisma.oshaSyncState.upsert({
      where: { cfrTitle_cfrPart: { cfrTitle: CFR_TITLE, cfrPart: CFR_PART } },
      create: { cfrTitle: CFR_TITLE, cfrPart: CFR_PART, syncStatus: "SYNCING" },
      update: { syncStatus: "SYNCING", lastError: null },
    });

    try {
      // 1. Get eCFR metadata
      const meta = await this.getEcfrTitleMeta();
      const date = meta.upToDateAsOf || this.todayIso();

      // 2. Fetch XML
      const xml = await this.fetchPartXml(date);
      this.logger.log(`Fetched XML: ${(xml.length / 1024).toFixed(0)} KB`);

      // 3. Parse into sections
      const sections = this.parseXmlToSections(xml);
      this.logger.log(`Parsed ${sections.length} sections`);

      if (sections.length === 0) {
        throw new Error("No sections parsed from XML — possible format change");
      }

      // 4. Upsert into database
      const result = await this.upsertSections(userId, sections);

      // 5. Update sync state
      await this.prisma.oshaSyncState.upsert({
        where: { cfrTitle_cfrPart: { cfrTitle: CFR_TITLE, cfrPart: CFR_PART } },
        create: {
          cfrTitle: CFR_TITLE,
          cfrPart: CFR_PART,
          syncStatus: "SUCCESS",
          lastSyncedAt: new Date(),
          lastAmendedDate: meta.latestAmendedOn,
          lastContentHash: this.hashContent(xml),
          manualId: result.manualId,
          sectionCount: result.totalSections,
        },
        update: {
          syncStatus: "SUCCESS",
          lastSyncedAt: new Date(),
          lastAmendedDate: meta.latestAmendedOn,
          lastContentHash: this.hashContent(xml),
          manualId: result.manualId,
          sectionCount: result.totalSections,
          lastError: null,
        },
      });

      this.logger.log(
        `Sync complete: ${result.totalSections} sections (${result.newSections} new, ${result.updatedSections} updated)`,
      );

      return { ...result, ecfrAmendedDate: meta.latestAmendedOn };
    } catch (err: any) {
      this.logger.error(`OSHA sync failed: ${err.message}`, err.stack);

      await this.prisma.oshaSyncState.upsert({
        where: { cfrTitle_cfrPart: { cfrTitle: CFR_TITLE, cfrPart: CFR_PART } },
        create: {
          cfrTitle: CFR_TITLE,
          cfrPart: CFR_PART,
          syncStatus: "ERROR",
          lastError: err.message,
        },
        update: { syncStatus: "ERROR", lastError: err.message },
      });

      throw err;
    }
  }

  /** Upsert all sections into SystemDocuments and assemble the Manual. */
  private async upsertSections(
    userId: string,
    sections: ParsedSection[],
  ): Promise<Omit<SyncResult, "ecfrAmendedDate">> {
    let newSections = 0;
    let updatedSections = 0;
    let unchangedSections = 0;

    // Group sections by subpart
    const subpartMap = new Map<string, { title: string; sections: ParsedSection[] }>();
    for (const s of sections) {
      const key = s.subpartLetter;
      if (!subpartMap.has(key)) {
        subpartMap.set(key, { title: s.subpartTitle, sections: [] });
      }
      subpartMap.get(key)!.sections.push(s);
    }

    // Use a transaction for the whole operation
    const manualId = await this.prisma.$transaction(
      async (tx) => {
        // --- Find or create the Manual ---
        let manual = await tx.manual.findUnique({ where: { code: MANUAL_CODE } });
        let manualVersion = 1;

        if (!manual) {
          manual = await tx.manual.create({
            data: {
              code: MANUAL_CODE,
              title: MANUAL_TITLE,
              iconEmoji: MANUAL_ICON,
              description: "The complete OSHA Safety and Health Regulations for Construction, imported from the Electronic Code of Federal Regulations (eCFR). Automatically monitored for updates.",
              isNexusInternal: true,
              createdByUserId: userId,
              currentVersion: 1,
            },
          });

          await tx.manualVersion.create({
            data: {
              manualId: manual.id,
              version: 1,
              changeType: ManualVersionChangeType.INITIAL,
              changeNotes: "Initial import from eCFR",
              createdByUserId: userId,
              structureSnapshot: { chapters: [], documents: [] },
            },
          });
        } else {
          manualVersion = manual.currentVersion;
        }

        // --- Process each subpart as a chapter ---
        let subpartSort = 0;
        for (const [letter, { title, sections: subSections }] of subpartMap) {
          subpartSort++;
          const chapterTitle = `Subpart ${letter} — ${title}`;

          // Find or create chapter
          let chapter = await tx.manualChapter.findFirst({
            where: { manualId: manual.id, title: { startsWith: `Subpart ${letter}` }, active: true },
          });

          if (!chapter) {
            chapter = await tx.manualChapter.create({
              data: {
                manualId: manual.id,
                title: chapterTitle,
                sortOrder: subpartSort,
              },
            });
          } else if (chapter.title !== chapterTitle) {
            await tx.manualChapter.update({
              where: { id: chapter.id },
              data: { title: chapterTitle, sortOrder: subpartSort },
            });
          }

          // --- Process each section as a SystemDocument ---
          for (const section of subSections) {
            const docCode = `osha-1926-${section.sectionNumber}`;

            const existingDoc = await tx.systemDocument.findUnique({
              where: { code: docCode },
              include: { currentVersion: true },
            });

            let docId: string;

            if (existingDoc) {
              docId = existingDoc.id;
              if (existingDoc.currentVersion?.contentHash !== section.contentHash) {
                // Content changed — create new version
                const lastVersion = await tx.systemDocumentVersion.findFirst({
                  where: { systemDocumentId: existingDoc.id },
                  orderBy: { versionNo: "desc" },
                });
                const nextVersionNo = (lastVersion?.versionNo ?? 0) + 1;

                const version = await tx.systemDocumentVersion.create({
                  data: {
                    systemDocumentId: existingDoc.id,
                    versionNo: nextVersionNo,
                    htmlContent: section.htmlContent,
                    contentHash: section.contentHash,
                    notes: "Updated via eCFR sync",
                    createdByUserId: userId,
                  },
                });

                await tx.systemDocument.update({
                  where: { id: existingDoc.id },
                  data: {
                    currentVersionId: version.id,
                    title: section.title,
                    category: MANUAL_CATEGORY,
                    subcategory: `Subpart ${section.subpartLetter}`,
                  },
                });

                updatedSections++;
              } else {
                unchangedSections++;
              }
            } else {
              // Create new document
              const newDoc = await tx.systemDocument.create({
                data: {
                  code: docCode,
                  title: section.title,
                  category: MANUAL_CATEGORY,
                  subcategory: `Subpart ${section.subpartLetter}`,
                  tags: ["osha", "safety", "construction", `subpart-${section.subpartLetter.toLowerCase()}`],
                  createdByUserId: userId,
                },
              });
              docId = newDoc.id;

              const version = await tx.systemDocumentVersion.create({
                data: {
                  systemDocumentId: newDoc.id,
                  versionNo: 1,
                  htmlContent: section.htmlContent,
                  contentHash: section.contentHash,
                  notes: "Initial version via eCFR import",
                  createdByUserId: userId,
                },
              });

              await tx.systemDocument.update({
                where: { id: newDoc.id },
                data: { currentVersionId: version.id },
              });

              newSections++;
            }

            // Ensure ManualDocument link exists
            const existingLink = await tx.manualDocument.findFirst({
              where: {
                manualId: manual.id,
                systemDocumentId: docId,
                active: true,
              },
            });

            if (!existingLink) {
              await tx.manualDocument.create({
                data: {
                  manualId: manual.id,
                  chapterId: chapter.id,
                  systemDocumentId: docId,
                  sortOrder: section.sortOrder,
                  displayTitleOverride: section.title,
                  addedInManualVersion: manualVersion,
                },
              });
            }
          }
        }

        // Bump manual version if anything changed
        if (newSections > 0 || updatedSections > 0) {
          const newVersion = manualVersion + 1;
          await tx.manual.update({
            where: { id: manual.id },
            data: { currentVersion: newVersion },
          });

          await tx.manualVersion.create({
            data: {
              manualId: manual.id,
              version: newVersion,
              changeType: newSections > 0
                ? ManualVersionChangeType.DOCUMENT_ADDED
                : ManualVersionChangeType.METADATA_UPDATED,
              changeNotes: `eCFR sync: ${newSections} new, ${updatedSections} updated sections`,
              createdByUserId: userId,
              structureSnapshot: {
                subparts: Array.from(subpartMap.keys()),
                totalSections: sections.length,
              },
            },
          });
        }

        return manual.id;
      },
      { timeout: 120_000 }, // Allow up to 2 minutes for the large transaction
    );

    return {
      manualId,
      totalSections: sections.length,
      newSections,
      updatedSections,
      unchangedSections,
      subpartCount: subpartMap.size,
    };
  }
}
