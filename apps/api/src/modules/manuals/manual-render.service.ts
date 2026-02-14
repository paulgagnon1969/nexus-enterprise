import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

export interface ManualTocEntry {
  id: string;
  type: "chapter" | "document";
  title: string;
  level: number;
  anchor: string;
  revisionNo?: number;
  children?: ManualTocEntry[];
}

export interface RenderOptions {
  includeRevisionMarkers?: boolean;
  includeToc?: boolean;
  includeCoverPage?: boolean;
  companyBranding?: {
    name?: string;
    logoUrl?: string;
  };
}

@Injectable()
export class ManualRenderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate table of contents for a manual
   */
  async getTableOfContents(manualId: string): Promise<ManualTocEntry[]> {
    const manual = await this.getManualWithContent(manualId);
    return this.buildToc(manual);
  }

  /**
   * Render full manual as HTML with cover page, TOC, and all content
   */
  async renderManualHtml(
    manualId: string,
    options: RenderOptions = {}
  ): Promise<string> {
    const {
      includeRevisionMarkers = true,
      includeToc = true,
      includeCoverPage = true,
    } = options;

    const manual = await this.getManualWithContent(manualId);
    const toc = this.buildToc(manual);

    const parts: string[] = [];

    // Add CSS
    parts.push(this.getPrintStyles());

    // Cover page
    if (includeCoverPage) {
      parts.push(this.renderCoverPage(manual, options.companyBranding));
    }

    // Table of contents
    if (includeToc) {
      parts.push(this.renderTocSection(toc));
    }

    // Chapters and documents
    parts.push(this.renderContent(manual, toc, includeRevisionMarkers));

    // Footer with version info
    parts.push(this.renderFooterScript(manual));

    return this.wrapInHtmlDocument(manual.title, parts.join("\n"));
  }

  /**
   * Get manual with all content needed for rendering
   */
  private async getManualWithContent(manualId: string) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
      include: {
        chapters: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          include: {
            documents: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  include: {
                    currentVersion: true,
                  },
                },
              },
            },
          },
        },
        documents: {
          where: { active: true, chapterId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            systemDocument: {
              include: {
                currentVersion: true,
              },
            },
          },
        },
      },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return manual;
  }

  /**
   * Build table of contents structure
   */
  private buildToc(manual: any): ManualTocEntry[] {
    const entries: ManualTocEntry[] = [];
    let sectionIndex = 1;

    // Root-level documents first
    for (const doc of manual.documents) {
      entries.push({
        id: doc.id,
        type: "document",
        title: doc.displayTitleOverride || doc.systemDocument.title,
        level: 1,
        anchor: `doc-${doc.id}`,
        revisionNo: doc.systemDocument.currentVersion?.versionNo,
      });
    }

    // Chapters with their documents
    for (const chapter of manual.chapters) {
      const chapterEntry: ManualTocEntry = {
        id: chapter.id,
        type: "chapter",
        title: chapter.title,
        level: 1,
        anchor: `chapter-${chapter.id}`,
        children: [],
      };

      for (const doc of chapter.documents) {
        chapterEntry.children!.push({
          id: doc.id,
          type: "document",
          title: doc.displayTitleOverride || doc.systemDocument.title,
          level: 2,
          anchor: `doc-${doc.id}`,
          revisionNo: doc.systemDocument.currentVersion?.versionNo,
        });
      }

      entries.push(chapterEntry);
      sectionIndex++;
    }

    return entries;
  }

  /**
   * Print-optimized CSS styles
   */
  private getPrintStyles(): string {
    return `
<style>
  @page {
    size: letter;
    margin: 1in 0.75in;
    @bottom-center {
      content: counter(page);
    }
  }

  @media print {
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    .avoid-break { page-break-inside: avoid; }
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
  }

  /* Cover Page */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    text-align: center;
    page-break-after: always;
  }

  .cover-page .logo {
    max-width: 200px;
    margin-bottom: 2rem;
  }

  .cover-page .icon-emoji {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .cover-page h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: #111;
  }

  .cover-page .description {
    font-size: 1.1rem;
    color: #666;
    max-width: 400px;
    margin: 1rem auto;
  }

  .cover-page .meta {
    margin-top: 3rem;
    font-size: 0.9rem;
    color: #888;
  }

  .cover-page .meta div {
    margin: 0.25rem 0;
  }

  /* Table of Contents */
  .toc-section {
    page-break-after: always;
  }

  .toc-section h2 {
    font-size: 1.5rem;
    border-bottom: 2px solid #333;
    padding-bottom: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .toc-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .toc-entry {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.4rem 0;
    border-bottom: 1px dotted #ccc;
  }

  .toc-entry.level-1 {
    font-weight: 600;
  }

  .toc-entry.level-2 {
    padding-left: 1.5rem;
    font-weight: normal;
  }

  .toc-entry a {
    color: #333;
    text-decoration: none;
    flex: 1;
  }

  .toc-entry a:hover {
    color: #0066cc;
  }

  .toc-revision {
    font-size: 0.85em;
    color: #666;
    margin-left: 1rem;
    white-space: nowrap;
  }

  /* Chapters */
  .chapter {
    page-break-before: always;
  }

  .chapter-header {
    background: #f5f5f5;
    padding: 1.5rem;
    margin: 0 -0.75in 1.5rem -0.75in;
    padding-left: 0.75in;
    padding-right: 0.75in;
    border-bottom: 3px solid #333;
  }

  .chapter-header h2 {
    font-size: 1.75rem;
    margin: 0;
    color: #111;
  }

  .chapter-description {
    color: #666;
    margin-top: 0.5rem;
    font-size: 0.95rem;
  }

  /* Documents */
  .document-section {
    margin-bottom: 2rem;
    page-break-inside: avoid;
  }

  .document-header {
    border-bottom: 2px solid #ccc;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  .document-header h3 {
    font-size: 1.25rem;
    margin: 0;
    color: #222;
  }

  .document-header .revision-badge {
    display: inline-block;
    background: #e0e0e0;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-size: 0.8rem;
    color: #555;
    margin-left: 0.75rem;
    font-weight: normal;
  }

  .revision-marker {
    font-size: 0.85rem;
    color: #666;
    font-style: italic;
    margin: 0.5rem 0;
  }

  .revision-marker.start {
    border-left: 3px solid #0066cc;
    padding-left: 0.75rem;
  }

  .revision-marker.end {
    border-left: 3px solid #0066cc;
    padding-left: 0.75rem;
    margin-top: 1rem;
  }

  .document-content {
    /* Reset some potential HTML content styles */
  }

  .document-content h1,
  .document-content h2,
  .document-content h3,
  .document-content h4 {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .document-content p {
    margin: 0.75rem 0;
  }

  .document-content ul,
  .document-content ol {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }

  .document-content li {
    margin: 0.25rem 0;
  }

  .document-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.9rem;
  }

  .document-content th,
  .document-content td {
    border: 1px solid #ccc;
    padding: 0.5rem;
    text-align: left;
  }

  .document-content th {
    background: #f5f5f5;
    font-weight: 600;
  }

  /* Footer */
  .page-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    font-size: 0.75rem;
    color: #888;
    display: flex;
    justify-content: space-between;
    padding: 0 0.75in;
    border-top: 1px solid #ddd;
  }

  @media screen {
    body {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 1in 0.75in;
      background: #f9f9f9;
    }
    
    .cover-page,
    .toc-section,
    .chapter {
      background: white;
      margin: 1rem 0;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  }
</style>`;
  }

  /**
   * Render cover page
   */
  private renderCoverPage(
    manual: any,
    branding?: { name?: string; logoUrl?: string }
  ): string {
    const formattedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return `
<div class="cover-page">
  ${branding?.logoUrl ? `<img src="${branding.logoUrl}" alt="" class="logo" />` : ""}
  ${manual.iconEmoji ? `<div class="icon-emoji">${manual.iconEmoji}</div>` : ""}
  <h1>${this.escapeHtml(manual.title)}</h1>
  ${manual.description ? `<p class="description">${this.escapeHtml(manual.description)}</p>` : ""}
  <div class="meta">
    <div><strong>Version ${manual.currentVersion}</strong></div>
    <div>${formattedDate}</div>
    ${branding?.name ? `<div>${this.escapeHtml(branding.name)}</div>` : ""}
  </div>
</div>`;
  }

  /**
   * Render table of contents section
   */
  private renderTocSection(toc: ManualTocEntry[]): string {
    const renderEntry = (entry: ManualTocEntry): string => {
      const revisionText = entry.revisionNo ? `Rev ${entry.revisionNo}` : "";
      const lines = [
        `<li class="toc-entry level-${entry.level}">
          <a href="#${entry.anchor}">${this.escapeHtml(entry.title)}</a>
          ${revisionText ? `<span class="toc-revision">${revisionText}</span>` : ""}
        </li>`,
      ];

      if (entry.children && entry.children.length > 0) {
        for (const child of entry.children) {
          lines.push(renderEntry(child));
        }
      }

      return lines.join("\n");
    };

    const items = toc.map(renderEntry).join("\n");

    return `
<div class="toc-section">
  <h2>Table of Contents</h2>
  <ul class="toc-list">
    ${items}
  </ul>
</div>`;
  }

  /**
   * Render all chapters and documents
   */
  private renderContent(
    manual: any,
    toc: ManualTocEntry[],
    includeRevisionMarkers: boolean
  ): string {
    const parts: string[] = [];

    // Root-level documents
    for (const doc of manual.documents) {
      parts.push(
        this.renderDocument(doc, includeRevisionMarkers)
      );
    }

    // Chapters with documents
    for (const chapter of manual.chapters) {
      parts.push(`
<div class="chapter" id="chapter-${chapter.id}">
  <div class="chapter-header">
    <h2>${this.escapeHtml(chapter.title)}</h2>
    ${chapter.description ? `<p class="chapter-description">${this.escapeHtml(chapter.description)}</p>` : ""}
  </div>
  <div class="chapter-content">`);

      for (const doc of chapter.documents) {
        parts.push(this.renderDocument(doc, includeRevisionMarkers));
      }

      parts.push(`
  </div>
</div>`);
    }

    return parts.join("\n");
  }

  /**
   * Render a single document section
   */
  private renderDocument(doc: any, includeRevisionMarkers: boolean): string {
    const title = doc.displayTitleOverride || doc.systemDocument.title;
    const versionNo = doc.systemDocument.currentVersion?.versionNo || 1;
    const content = doc.systemDocument.currentVersion?.htmlContent || "<p>No content available</p>";

    const revisionStart = includeRevisionMarkers
      ? `<p class="revision-marker start">▸ Document: ${this.escapeHtml(title)} — Revision ${versionNo}</p>`
      : "";

    const revisionEnd = includeRevisionMarkers
      ? `<p class="revision-marker end">◂ End of ${this.escapeHtml(title)} (Rev ${versionNo})</p>`
      : "";

    return `
<div class="document-section avoid-break" id="doc-${doc.id}">
  <div class="document-header">
    <h3>
      ${this.escapeHtml(title)}
      <span class="revision-badge">Rev ${versionNo}</span>
    </h3>
  </div>
  ${revisionStart}
  <div class="document-content">
    ${content}
  </div>
  ${revisionEnd}
</div>`;
  }

  /**
   * Footer script for page numbers (works in PDF)
   */
  private renderFooterScript(manual: any): string {
    // For screen view, we don't need page numbers
    // Puppeteer will handle actual page numbers during PDF generation
    return `
<script>
  // This runs on print preview - actual PDF uses Puppeteer headerTemplate/footerTemplate
  window.manualTitle = ${JSON.stringify(manual.title)};
  window.manualVersion = ${manual.currentVersion};
</script>`;
  }

  /**
   * Wrap content in full HTML document
   */
  private wrapInHtmlDocument(title: string, content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
</head>
<body>
${content}
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
