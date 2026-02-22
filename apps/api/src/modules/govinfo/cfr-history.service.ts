import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { GovInfoService } from "./govinfo.service";
import { XMLParser } from "fast-xml-parser";
import * as crypto from "crypto";

interface SectionSnapshot {
  sectionCfr: string; // e.g., "1926.501"
  title: string;
  contentHash: string;
}

@Injectable()
export class CfrHistoryService {
  private readonly logger = new Logger(CfrHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly govInfo: GovInfoService,
  ) {}

  /**
   * Build a year-over-year diff for a CFR title/part.
   * Downloads annual edition XML for both years, parses sections,
   * and computes ADDED / REMOVED / MODIFIED diffs.
   */
  async buildDiff(
    cfrTitle: number,
    cfrPart: number,
    fromYear: number,
    toYear: number,
  ): Promise<{
    fromYear: number;
    toYear: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  }> {
    this.logger.log(
      `Building CFR diff: ${cfrTitle} CFR ${cfrPart} from ${fromYear} to ${toYear}`,
    );

    // 1. Get or fetch snapshots for both years
    const fromSections = await this.getOrFetchSnapshot(cfrTitle, cfrPart, fromYear);
    const toSections = await this.getOrFetchSnapshot(cfrTitle, cfrPart, toYear);

    if (!fromSections || !toSections) {
      throw new Error(
        `Could not fetch CFR data for one or both years (${fromYear}, ${toYear}). ` +
          "Check that the annual edition is available on GovInfo.",
      );
    }

    // 2. Build maps
    const fromMap = new Map(fromSections.map((s) => [s.sectionCfr, s]));
    const toMap = new Map(toSections.map((s) => [s.sectionCfr, s]));

    // 3. Compute diffs
    let added = 0;
    let removed = 0;
    let modified = 0;
    let unchanged = 0;

    const diffs: Array<{
      sectionCfr: string;
      changeType: string;
      summary: string;
    }> = [];

    // Sections in toYear
    for (const [cfr, toSec] of toMap) {
      const fromSec = fromMap.get(cfr);
      if (!fromSec) {
        added++;
        diffs.push({
          sectionCfr: cfr,
          changeType: "ADDED",
          summary: `New section: ${toSec.title}`,
        });
      } else if (fromSec.contentHash !== toSec.contentHash) {
        modified++;
        diffs.push({
          sectionCfr: cfr,
          changeType: "MODIFIED",
          summary: `Content changed: ${toSec.title}`,
        });
      } else {
        unchanged++;
      }
    }

    // Sections only in fromYear (removed)
    for (const [cfr, fromSec] of fromMap) {
      if (!toMap.has(cfr)) {
        removed++;
        diffs.push({
          sectionCfr: cfr,
          changeType: "REMOVED",
          summary: `Section removed: ${fromSec.title}`,
        });
      }
    }

    // 4. Upsert diffs into database
    // Clear existing diffs for this combo first
    await this.prisma.cfrAnnualDiff.deleteMany({
      where: { cfrTitle, cfrPart, fromYear, toYear },
    });

    if (diffs.length > 0) {
      await this.prisma.cfrAnnualDiff.createMany({
        data: diffs.map((d) => ({
          cfrTitle,
          cfrPart,
          fromYear,
          toYear,
          sectionCfr: d.sectionCfr,
          changeType: d.changeType,
          summary: d.summary,
        })),
      });
    }

    this.logger.log(
      `CFR diff complete: ${added} added, ${removed} removed, ${modified} modified, ${unchanged} unchanged`,
    );

    return { fromYear, toYear, added, removed, modified, unchanged };
  }

  // -----------------------------------------------------------------------
  // Snapshot Management
  // -----------------------------------------------------------------------

  /**
   * Get an existing snapshot from DB, or fetch + parse from GovInfo bulk data.
   * Returns section-level data for comparison.
   */
  private async getOrFetchSnapshot(
    cfrTitle: number,
    cfrPart: number,
    year: number,
  ): Promise<SectionSnapshot[] | null> {
    // Check if we already have a snapshot
    const existing = await this.prisma.cfrAnnualSnapshot.findUnique({
      where: {
        cfrTitle_cfrPart_year: { cfrTitle, cfrPart, year },
      },
    });

    if (existing) {
      // Re-fetch and parse (we don't store section-level data in the snapshot,
      // just the metadata). For efficiency, we could cache parsed sections.
      return this.fetchAndParseSections(cfrTitle, cfrPart, year);
    }

    // Fetch from GovInfo bulk data
    const sections = await this.fetchAndParseSections(cfrTitle, cfrPart, year);
    if (!sections) return null;

    // Compute content hash for the full snapshot
    const allHashes = sections.map((s) => s.contentHash).join("|");
    const overallHash = crypto
      .createHash("sha256")
      .update(allHashes)
      .digest("hex")
      .slice(0, 16);

    // Store snapshot metadata
    await this.prisma.cfrAnnualSnapshot.upsert({
      where: {
        cfrTitle_cfrPart_year: { cfrTitle, cfrPart, year },
      },
      create: {
        cfrTitle,
        cfrPart,
        year,
        sectionCount: sections.length,
        contentHash: overallHash,
      },
      update: {
        sectionCount: sections.length,
        contentHash: overallHash,
        fetchedAt: new Date(),
      },
    });

    return sections;
  }

  /**
   * Fetch and parse annual CFR XML from GovInfo bulk data.
   * Path format: CFR/{year}/title-{title}/CFR-{year}-title{title}-vol{vol}.xml
   *
   * The annual CFR is organized by volume, and a single part may span volumes.
   * We attempt the most common path patterns.
   */
  private async fetchAndParseSections(
    cfrTitle: number,
    cfrPart: number,
    year: number,
  ): Promise<SectionSnapshot[] | null> {
    // Try listing the bulk data index to find the correct volume
    const indexPath = `CFR/${year}/title-${cfrTitle}`;
    const index = await this.govInfo.listBulkDataIndex(indexPath);

    if (!index) {
      this.logger.warn(`No bulk data index for ${indexPath}`);

      // Fallback: try eCFR versioner for recent years
      if (year >= 2020) {
        return this.fetchFromEcfr(cfrTitle, cfrPart, year);
      }
      return null;
    }

    // Find XML files in the index and try to locate our part
    const files: string[] = [];
    if (Array.isArray(index?.files)) {
      for (const f of index.files) {
        const name = typeof f === "string" ? f : f?.name ?? f?.fileName ?? "";
        if (name.endsWith(".xml")) {
          files.push(name);
        }
      }
    }

    // Try each XML file to find our part
    for (const fileName of files) {
      const xmlPath = `CFR/${year}/title-${cfrTitle}/${fileName}`;
      const xml = await this.govInfo.fetchBulkXml(xmlPath);
      if (!xml) continue;

      const sections = this.parseCfrXml(xml, cfrPart);
      if (sections.length > 0) {
        return sections;
      }
    }

    // If no XML files found in index, try direct path pattern
    const directPath = `CFR/${year}/title-${cfrTitle}/CFR-${year}-title${cfrTitle}-vol${this.guessVolume(cfrTitle, cfrPart)}.xml`;
    const xml = await this.govInfo.fetchBulkXml(directPath);
    if (xml) {
      const sections = this.parseCfrXml(xml, cfrPart);
      if (sections.length > 0) return sections;
    }

    this.logger.warn(
      `Could not find Part ${cfrPart} in ${cfrTitle} CFR annual edition for ${year}`,
    );
    return null;
  }

  /**
   * Fallback: Use eCFR versioner API with a year-end date.
   * The eCFR provides point-in-time data, so we use Dec 31 of the year.
   */
  private async fetchFromEcfr(
    cfrTitle: number,
    cfrPart: number,
    year: number,
  ): Promise<SectionSnapshot[] | null> {
    const date = `${year}-12-31`;
    const url = `https://www.ecfr.gov/api/versioner/v1/full/${date}/title-${cfrTitle}.xml?part=${cfrPart}`;

    this.logger.log(`Falling back to eCFR versioner: ${url}`);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`eCFR versioner returned ${res.status} for ${date}`);
        return null;
      }
      const xml = await res.text();
      return this.parseCfrXml(xml, cfrPart);
    } catch (err: any) {
      this.logger.warn(`eCFR fetch failed: ${err?.message}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // XML Parsing
  // -----------------------------------------------------------------------

  /** Parse CFR XML and extract section-level snapshots for a specific part. */
  private parseCfrXml(xml: string, targetPart: number): SectionSnapshot[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      attributesGroupName: ":@",
      preserveOrder: true,
      textNodeName: "#text",
      trimValues: false,
    });

    try {
      const parsed = parser.parse(xml);
      const sections: SectionSnapshot[] = [];
      this.walkForSections(parsed, sections, targetPart);
      return sections;
    } catch (err: any) {
      this.logger.warn(`CFR XML parse error: ${err?.message}`);
      return [];
    }
  }

  /** Walk parsed XML tree to extract sections with their content hashes. */
  private walkForSections(
    nodes: any[],
    sections: SectionSnapshot[],
    targetPart: number,
  ): void {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "#text" || key === ":@") continue;
        const upper = key.toUpperCase();

        if (upper === "SECTION" || upper === "DIV8") {
          const children = node[key];
          if (Array.isArray(children)) {
            const section = this.extractSectionSnapshot(children, targetPart);
            if (section) sections.push(section);
          }
          continue;
        }

        // Recurse
        const child = node[key];
        if (Array.isArray(child)) {
          this.walkForSections(child, sections, targetPart);
        }
      }
    }
  }

  /** Extract section number, title, and content hash from a section node. */
  private extractSectionSnapshot(
    nodes: any[],
    targetPart: number,
  ): SectionSnapshot | null {
    let sectionNumber = "";
    let title = "";
    let rawContent = "";

    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key === "#text" || key === ":@") continue;
        const upper = key.toUpperCase();

        if (upper === "SECTNO") {
          sectionNumber = this.getTextContent(node[key]).replace("§", "").trim();
        } else if (upper === "SUBJECT" || upper === "HEAD") {
          const text = this.getTextContent(node[key]).trim();
          if (!title && text) {
            const headMatch = text.match(/§\s*([\d.]+)\s*(.*)/);
            if (headMatch) {
              if (!sectionNumber) sectionNumber = headMatch[1].trim();
              title = headMatch[2].replace(/^[\u2014\-—–\s]+/, "").trim();
            } else {
              title = text;
            }
          }
        }

        // Accumulate raw content for hashing
        rawContent += JSON.stringify(node[key]);
      }
    }

    // Only include sections for our target part
    if (!sectionNumber) return null;
    if (targetPart && !sectionNumber.startsWith(`${targetPart}.`)) return null;

    const contentHash = crypto
      .createHash("sha256")
      .update(rawContent)
      .digest("hex")
      .slice(0, 16);

    return {
      sectionCfr: sectionNumber,
      title: title || sectionNumber,
      contentHash,
    };
  }

  /** Recursively extract text content from parsed XML nodes. */
  private getTextContent(el: any): string {
    if (typeof el === "string") return el;
    if (typeof el === "number") return String(el);
    if (!el) return "";
    if (Array.isArray(el)) return el.map((e) => this.getTextContent(e)).join("");
    if (el["#text"] !== undefined) return String(el["#text"]);
    let text = "";
    for (const key of Object.keys(el)) {
      if (key === ":@") continue;
      text += this.getTextContent(el[key]);
    }
    return text;
  }

  /** Guess the volume number for a CFR title/part combo. */
  private guessVolume(cfrTitle: number, cfrPart: number): number {
    // Common mappings for OSHA and EPA
    if (cfrTitle === 29) {
      if (cfrPart >= 1900 && cfrPart < 2000) return 7; // Parts 1900–1999
      if (cfrPart >= 1926) return 8; // May be in vol 8 for some years
    }
    if (cfrTitle === 40) {
      if (cfrPart <= 82) return 2;
      if (cfrPart <= 86) return 3;
      if (cfrPart >= 700) return 31;
    }
    return 1; // Default — will likely need adjustment
  }
}
