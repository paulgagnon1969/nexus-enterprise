import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NCC_LOGO_BASE64 } from "./logo.constants";

export interface ManualTocEntry {
  id: string;
  type: "chapter" | "document";
  title: string;
  level: number;
  anchor: string;
  revisionNo?: number;
  includeInPrint?: boolean; // false = "This Section Intentionally Blank"
  compact?: boolean; // true = single-doc chapter merged into one row
  children?: ManualTocEntry[];
}

/** JSON shape stored in ManualView.mapping */
export interface ViewMapping {
  compactSingleDocChapters?: boolean;
  documentMoves?: { manualDocumentId: string; toChapterId: string; sortOrder?: number }[];
  chapterOrder?: string[]; // chapter IDs in desired order
  hiddenChapterIds?: string[];
  hiddenDocumentIds?: string[];
  chapterMerges?: { targetChapterId: string; sourceChapterIds: string[] }[];
}

export interface RenderOptions {
  includeRevisionMarkers?: boolean;
  includeToc?: boolean;
  includeCoverPage?: boolean;
  /** Collapse single-document chapters into one TOC/content row */
  compactToc?: boolean;
  /** ID of a saved ManualView to apply */
  viewId?: string;
  companyBranding?: {
    name?: string;
    logoUrl?: string;
  };
  /** Base URL for assets (e.g., http://localhost:3000) */
  baseUrl?: string;
  /** User context for document serialization/tracking */
  userContext?: {
    userId: string;
    userName?: string;
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
      compactToc = false,
      baseUrl = '',
      userContext,
    } = options;

    // Generate document serial number for tracking
    const serialNumber = this.generateSerialNumber(manualId, userContext?.userId);

    let manual = await this.getManualWithContent(manualId);

    // Load and apply view mapping if a viewId was provided
    let viewMapping: ViewMapping | null = null;
    if (options.viewId) {
      const view = await this.prisma.manualView.findFirst({
        where: { id: options.viewId, manualId },
      });
      if (view) {
        viewMapping = view.mapping as ViewMapping;
        manual = this.applyView(manual, viewMapping);
      }
    } else {
      // If no viewId provided, try to apply the manual's default view (if any)
      const defaultView = await this.prisma.manualView.findFirst({
        where: { manualId, isDefault: true },
      });
      if (defaultView) {
        viewMapping = defaultView.mapping as ViewMapping;
        manual = this.applyView(manual, viewMapping);
      }
    }

    // Compact mode: view-level flag overrides explicit option
    const effectiveCompact = viewMapping?.compactSingleDocChapters ?? compactToc;
    const toc = this.buildToc(manual, effectiveCompact);

    const parts: string[] = [];

    // Add CSS
    parts.push(this.getPrintStyles());

    // Add page header with logo (for all pages)
    parts.push(this.renderPageHeader(baseUrl));

    // Cover page
    if (includeCoverPage) {
      parts.push(this.renderCoverPage(manual, options.companyBranding, baseUrl));
      parts.push('<div class="page-break-indicator">Page Break</div>');
    }

    // Table of contents
    if (includeToc) {
      parts.push(this.renderTocSection(toc));
      parts.push('<div class="page-break-indicator">Page Break</div>');
    }

    // Chapters and documents
    parts.push(this.renderContent(manual, toc, includeRevisionMarkers, effectiveCompact));

    // Confidentiality footer with serial number
    parts.push(this.renderConfidentialityFooter(serialNumber, userContext?.userName));

    // Footer with version info
    parts.push(this.renderFooterScript(manual));

    return this.wrapInHtmlDocument(manual.title, parts.join("\n"));
  }

  /**
   * Apply a view mapping to the canonical manual structure.
   * Returns a shallow-cloned manual with chapters/documents rearranged.
   */
  private applyView(manual: any, mapping: ViewMapping): any {
    // Deep-clone the mutable parts so we don't mutate the original
    let chapters: any[] = manual.chapters.map((ch: any) => ({
      ...ch,
      documents: [...ch.documents],
    }));
    let rootDocs: any[] = [...manual.documents];

    // 1. Chapter merges: move all docs from source chapters into target chapter
    if (mapping.chapterMerges) {
      for (const merge of mapping.chapterMerges) {
        const target = chapters.find((ch) => ch.id === merge.targetChapterId);
        if (!target) continue;
        for (const srcId of merge.sourceChapterIds) {
          const srcIdx = chapters.findIndex((ch) => ch.id === srcId);
          if (srcIdx === -1) continue;
          target.documents.push(...chapters[srcIdx].documents);
          chapters.splice(srcIdx, 1);
        }
      }
    }

    // 2. Document moves: relocate individual docs between chapters
    if (mapping.documentMoves) {
      for (const move of mapping.documentMoves) {
        let doc: any = null;
        // Remove from current location
        for (const ch of chapters) {
          const idx = ch.documents.findIndex((d: any) => d.id === move.manualDocumentId);
          if (idx !== -1) {
            doc = ch.documents.splice(idx, 1)[0];
            break;
          }
        }
        if (!doc) {
          const rootIdx = rootDocs.findIndex((d: any) => d.id === move.manualDocumentId);
          if (rootIdx !== -1) {
            doc = rootDocs.splice(rootIdx, 1)[0];
          }
        }
        if (!doc) continue;
        // Insert into target chapter
        const targetCh = chapters.find((ch) => ch.id === move.toChapterId);
        if (targetCh) {
          if (typeof move.sortOrder === "number") {
            targetCh.documents.splice(move.sortOrder, 0, doc);
          } else {
            targetCh.documents.push(doc);
          }
        }
      }
    }

    // 3. Chapter ordering
    if (mapping.chapterOrder && mapping.chapterOrder.length > 0) {
      const orderMap = new Map(mapping.chapterOrder.map((id, i) => [id, i]));
      chapters.sort((a, b) => {
        const ai = orderMap.get(a.id) ?? 9999;
        const bi = orderMap.get(b.id) ?? 9999;
        return ai - bi;
      });
    }

    // 4. Hidden chapters
    if (mapping.hiddenChapterIds && mapping.hiddenChapterIds.length > 0) {
      const hidden = new Set(mapping.hiddenChapterIds);
      chapters = chapters.filter((ch) => !hidden.has(ch.id));
    }

    // 5. Hidden documents
    if (mapping.hiddenDocumentIds && mapping.hiddenDocumentIds.length > 0) {
      const hidden = new Set(mapping.hiddenDocumentIds);
      for (const ch of chapters) {
        ch.documents = ch.documents.filter((d: any) => !hidden.has(d.id));
      }
      rootDocs = rootDocs.filter((d: any) => !hidden.has(d.id));
    }

    return { ...manual, chapters, documents: rootDocs };
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
   * Chapters come first, then root-level documents (appendices) at the end.
   * When compact=true, single-document chapters are collapsed into one entry.
   */
  private buildToc(manual: any, compact = false): ManualTocEntry[] {
    const entries: ManualTocEntry[] = [];

    // Chapters with their documents FIRST
    for (const chapter of manual.chapters) {
      // Compact mode: collapse chapter + single doc into one row
      if (compact && chapter.documents.length === 1) {
        const doc = chapter.documents[0];
        entries.push({
          id: chapter.id,
          type: "chapter",
          title: chapter.title,
          level: 1,
          anchor: `chapter-${chapter.id}`,
          revisionNo: doc.systemDocument.currentVersion?.versionNo,
          includeInPrint: doc.includeInPrint ?? true,
          compact: true,
          children: [],
        });
        continue;
      }

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
          includeInPrint: doc.includeInPrint ?? true,
        });
      }

      entries.push(chapterEntry);
    }

    // Root-level documents (appendices) AFTER chapters
    for (const doc of manual.documents) {
      entries.push({
        id: doc.id,
        type: "document",
        title: doc.displayTitleOverride || doc.systemDocument.title,
        level: 1,
        anchor: `doc-${doc.id}`,
        revisionNo: doc.systemDocument.currentVersion?.versionNo,
        includeInPrint: doc.includeInPrint ?? true,
      });
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
    position: relative;
  }

  /* Watermark - positioned behind all content */
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    height: 400px;
    opacity: 0.06;
    pointer-events: none;
    z-index: -1;
  }

  @media print {
    .watermark {
      opacity: 0.05;
      /* Ensure it prints */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }

  /* Cover Page */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid #ccc;
  }

  .cover-page .icon-emoji {
    font-size: 2rem;
    margin-bottom: 0.25rem;
  }

  .cover-page h1 {
    font-size: 1.25rem;
    margin: 0;
  }

  .cover-page .description {
    font-size: 0.8rem;
    margin: 0.25rem auto;
    max-width: 400px;
  }

  .cover-page .meta {
    margin-top: 0.5rem;
    font-size: 0.7rem;
  }

  @media print {
    .cover-page {
      min-height: 90vh; /* Slightly less than full page to avoid blank page after */
      page-break-after: always;
      border-bottom: none;
      margin-bottom: 0;
      padding: 2rem 0;
    }
    .cover-page .icon-emoji {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .cover-page h1 {
      font-size: 2.5rem;
      margin: 0 0 0.5rem 0;
    }
    .cover-page .description {
      font-size: 1.1rem;
      margin: 1rem auto;
    }
    .cover-page .meta {
      margin-top: 3rem;
    }
  }

  .cover-page .logo,
  .cover-page .cover-logo {
    max-width: 200px;
    max-height: 120px;
    margin-bottom: 1.5rem;
  }

  @media print {
    .cover-page .logo,
    .cover-page .cover-logo {
      max-width: 300px;
      max-height: 180px;
    }
  }

  .cover-page .meta div {
    margin: 0.15rem 0;
  }

  /* Table of Contents */
  .toc-section {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #ddd;
  }

  @media print {
    .toc-section {
      border-bottom: none;
      margin-bottom: 2rem;
    }
  }

  .toc-section h2 {
    font-size: 1.25rem;
    border-bottom: 2px solid #333;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
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
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 2px solid #ddd;
  }

  @media print {
    .chapter {
      margin-top: 2rem;
      padding-top: 0;
      border-top: none;
    }
    
    /* Only start new chapters on fresh pages if there's content before */
    .chapter:not(:first-of-type) {
      page-break-before: always;
    }
  }

  .chapter-header {
    background: #f5f5f5;
    padding: 1rem;
    margin: 0 0 1rem 0;
    border-bottom: 2px solid #333;
    border-radius: 4px;
  }

  @media print {
    .chapter-header {
      margin: 0 -0.75in 1.5rem -0.75in;
      padding: 1.5rem 0.75in;
      border-radius: 0;
    }
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
    margin-bottom: 1.5rem;
  }

  .document-header {
    border-bottom: 2px solid #ccc;
    padding-bottom: 0.5rem;
    margin-bottom: 0.75rem;
    page-break-after: avoid; /* Keep header with content */
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
    margin-top: 0.75rem;
  }

  /* Hide revision markers in print - they cause orphaned pages */
  @media print {
    .revision-marker {
      display: none;
    }
  }

  .document-content {
    /* Reset some potential HTML content styles */
  }

  /* Intentionally blank section placeholder */
  .document-content.intentionally-blank {
    text-align: center;
    padding: 3rem 2rem;
    background: #f9fafb;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    margin: 1rem 0;
  }

  .document-content.intentionally-blank .blank-notice {
    font-size: 1.1rem;
    font-style: italic;
    color: #6b7280;
    margin: 0;
  }

  @media print {
    .document-content.intentionally-blank {
      min-height: 1in;
      padding: 1rem;
    }
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

  /* Page break indicator for screen view */
  .page-break-indicator {
    display: none;
  }

  @media screen {
    body {
      max-width: 100%;
      margin: 0;
      padding: 0.25rem 0.5rem;
      background: #e5e7eb;
    }
    
    .page-break-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 0.5rem 0;
      margin: 0.75rem 0;
      color: #6b7280;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .page-break-indicator::before,
    .page-break-indicator::after {
      content: '';
      flex: 1;
      height: 2px;
      background: repeating-linear-gradient(
        90deg,
        #9ca3af 0,
        #9ca3af 4px,
        transparent 4px,
        transparent 8px
      );
    }
    
    .cover-page,
    .toc-section,
    .chapter {
      background: #ffffff;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .cover-page {
      margin: 0;
      padding: 1rem;
    }
    
    .toc-section {
      margin: 0;
      padding: 0.75rem 1rem;
    }
    
    .chapter {
      margin: 0;
      padding: 0.75rem 1rem;
    }
  }

  /* Page header with logo */
  .page-header {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 2px solid #1e3a5f;
    margin-bottom: 1rem;
    background: #ffffff;
  }
  
  .page-header .nexus-logo {
    height: 40px;
    width: auto;
    display: block !important;
    visibility: visible !important;
  }
  
  .page-header .header-title {
    font-size: 0.85rem;
    color: #1e3a5f;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Confidentiality footer */
  .confidentiality-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.4rem 1rem;
    background: #f8f9fa;
    border-top: 1px solid #dee2e6;
    font-size: 0.65rem;
    color: #6c757d;
    text-align: center;
  }
  
  .confidentiality-footer .confidential-text {
    font-weight: 600;
    color: #dc3545;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.7rem;
  }
  
  .confidentiality-footer .footer-note {
    margin-top: 0.15rem;
  }
  
  .confidentiality-footer .serial-number {
    margin-top: 0.25rem;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.6rem;
    color: #888;
    letter-spacing: 0.05em;
  }

  @media print {
    .page-break-indicator {
      display: none;
    }
    
    /* Hide HTML header/footer in print - Puppeteer uses its own templates */
    .page-header {
      display: none;
    }
    
    .confidentiality-footer {
      display: none;
    }
  }
  
  @media screen {
    .confidentiality-footer {
      position: sticky;
      bottom: 0;
      z-index: 100;
    }
    
    body {
      padding-bottom: 4rem; /* Space for fixed footer */
    }
  }
</style>`;
  }

  /**
   * Render page header with Nexus logo (embedded base64 for PDF/print compatibility)
   */
  private renderPageHeader(_baseUrl: string): string {
    return `
<div class="page-header">
  <img src="${NCC_LOGO_BASE64}" alt="NCC" class="nexus-logo" />
  <span class="header-title">Official Documentation</span>
</div>`;
  }

  /**
   * Generate a unique serial number for document tracking
   * Format: NXG-[DOC_SHORT]-[USER_SHORT]-[TIMESTAMP]-[RANDOM]
   */
  private generateSerialNumber(documentId: string, userId?: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); // YYYYMMDDHHmmss
    const docShort = documentId.slice(-6).toUpperCase();
    const userShort = userId ? userId.slice(-4).toUpperCase() : 'ANON';
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    
    return `NXG-${docShort}-${userShort}-${timestamp}-${random}`;
  }

  /**
   * Render confidentiality footer with serial number for tracking
   */
  private renderConfidentialityFooter(serialNumber: string, userName?: string): string {
    const now = new Date();
    const dateTimeStr = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const issuedTo = userName ? `Issued to: ${this.escapeHtml(userName)} | ` : '';
    
    return `
<div class="confidentiality-footer">
  <div class="confidential-text">Confidential &amp; Proprietary</div>
  <div class="footer-note">
    This document contains confidential and proprietary information belonging to Nexus Group and affiliates.
    Unauthorized reproduction, distribution, or disclosure is strictly prohibited.
  </div>
  <div class="serial-number">
    ${issuedTo}Serial: ${serialNumber} | Generated: ${dateTimeStr}
  </div>
</div>`;
  }

  /**
   * Render cover page
   */
  private renderCoverPage(
    manual: any,
    branding?: { name?: string; logoUrl?: string },
    _baseUrl?: string
  ): string {
    const formattedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Use embedded base64 logo for PDF/print compatibility
    const logoSrc = branding?.logoUrl || NCC_LOGO_BASE64;

    return `
<div class="cover-page">
  <img src="${logoSrc}" alt="NCC" class="logo cover-logo" style="max-height: 80px; margin-bottom: 1rem;" />
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
   * Chapters come first, then root-level documents (appendices) at the end.
   * When compact=true, single-document chapters skip the nested document header.
   */
  private renderContent(
    manual: any,
    toc: ManualTocEntry[],
    includeRevisionMarkers: boolean,
    compact = false
  ): string {
    const parts: string[] = [];

    // Build a set of compact chapter IDs from the TOC for quick lookup
    const compactChapterIds = new Set(
      toc.filter(e => e.compact).map(e => e.id)
    );

    // Chapters with documents FIRST
    for (let i = 0; i < manual.chapters.length; i++) {
      const chapter = manual.chapters[i];
      
      // Add page break indicator before each chapter (except first)
      if (i > 0) {
        parts.push('<div class="page-break-indicator">Page Break</div>');
      }

      // Compact: single-doc chapter — merge chapter header with document content (no nested doc header)
      if (compact && compactChapterIds.has(chapter.id) && chapter.documents.length === 1) {
        const doc = chapter.documents[0];
        parts.push(this.renderCompactChapter(chapter, doc, includeRevisionMarkers));
        continue;
      }
      
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

    // Root-level documents (appendices) AFTER chapters
    if (manual.documents.length > 0) {
      // Add page break before appendices section if there were chapters
      if (manual.chapters.length > 0) {
        parts.push('<div class="page-break-indicator">Page Break</div>');
      }
      
      parts.push(`
<div class="chapter appendices-section" id="appendices">
  <div class="chapter-header">
    <h2>Appendices</h2>
  </div>
  <div class="chapter-content">`);
      
      for (const doc of manual.documents) {
        parts.push(this.renderDocument(doc, includeRevisionMarkers));
      }
      
      parts.push(`
  </div>
</div>`);
    }

    return parts.join("\n");
  }

  /**
   * Render a compact chapter — single-doc chapter with no nested document header.
   * The chapter header shows the chapter title + revision badge, and the document
   * content flows directly beneath it.
   */
  private renderCompactChapter(
    chapter: any,
    doc: any,
    includeRevisionMarkers: boolean
  ): string {
    const title = chapter.title;
    const versionNo = doc.systemDocument.currentVersion?.versionNo || 1;
    const includeInPrint = doc.includeInPrint ?? true;

    if (!includeInPrint) {
      return `
<div class="chapter compact-chapter" id="chapter-${chapter.id}">
  <div class="chapter-header">
    <h2>${this.escapeHtml(title)} <span class="revision-badge">Rev ${versionNo}</span></h2>
    ${chapter.description ? `<p class="chapter-description">${this.escapeHtml(chapter.description)}</p>` : ""}
  </div>
  <div class="chapter-content">
    <div class="document-content intentionally-blank">
      <p class="blank-notice">This Section Intentionally Blank</p>
    </div>
  </div>
</div>`;
    }

    const content = doc.systemDocument.currentVersion?.htmlContent || "<p>No content available</p>";
    const docTitle = doc.displayTitleOverride || doc.systemDocument.title;

    const revisionStart = includeRevisionMarkers
      ? `<p class="revision-marker start">▸ Document: ${this.escapeHtml(docTitle)} — Revision ${versionNo}</p>`
      : "";
    const revisionEnd = includeRevisionMarkers
      ? `<p class="revision-marker end">◂ End of ${this.escapeHtml(docTitle)} (Rev ${versionNo})</p>`
      : "";

    return `
<div class="chapter compact-chapter" id="chapter-${chapter.id}">
  <div class="chapter-header">
    <h2>${this.escapeHtml(title)} <span class="revision-badge">Rev ${versionNo}</span></h2>
    ${chapter.description ? `<p class="chapter-description">${this.escapeHtml(chapter.description)}</p>` : ""}
  </div>
  <div class="chapter-content">
    ${revisionStart}
    <div class="document-content">
      ${content}
    </div>
    ${revisionEnd}
  </div>
</div>`;
  }

  /**
   * Render a single document section
   */
  private renderDocument(doc: any, includeRevisionMarkers: boolean): string {
    const title = doc.displayTitleOverride || doc.systemDocument.title;
    const versionNo = doc.systemDocument.currentVersion?.versionNo || 1;
    const includeInPrint = doc.includeInPrint ?? true;
    
    // If section is excluded from print, show placeholder message
    if (!includeInPrint) {
      return `
<div class="document-section" id="doc-${doc.id}">
  <div class="document-header">
    <h3>
      ${this.escapeHtml(title)}
      <span class="revision-badge">Rev ${versionNo}</span>
    </h3>
  </div>
  <div class="document-content intentionally-blank">
    <p class="blank-notice">This Section Intentionally Blank</p>
  </div>
</div>`;
    }
    
    const content = doc.systemDocument.currentVersion?.htmlContent || "<p>No content available</p>";

    const revisionStart = includeRevisionMarkers
      ? `<p class="revision-marker start">▸ Document: ${this.escapeHtml(title)} — Revision ${versionNo}</p>`
      : "";

    const revisionEnd = includeRevisionMarkers
      ? `<p class="revision-marker end">◂ End of ${this.escapeHtml(title)} (Rev ${versionNo})</p>`
      : "";

    return `
<div class="document-section" id="doc-${doc.id}">
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
   * Wrap content in full HTML document with Mermaid support
   */
  private wrapInHtmlDocument(title: string, content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <!-- Mermaid.js for diagram rendering -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    /* Mermaid diagram styling */
    .mermaid {
      text-align: center;
      margin: 1rem 0;
      page-break-inside: avoid;
    }
    .mermaid svg {
      max-width: 100%;
      height: auto;
    }
    @media print {
      .mermaid {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
<img src="${NCC_LOGO_BASE64}" alt="" class="watermark" />
${content}
<script>
  // Initialize Mermaid with secure settings
  mermaid.initialize({
    startOnLoad: true,
    securityLevel: 'strict',
    theme: 'default',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis'
    }
  });
  
  // Signal that Mermaid has finished rendering (for PDF generation)
  mermaid.run().then(() => {
    window.mermaidRendered = true;
    // Dispatch custom event for Puppeteer to detect
    document.dispatchEvent(new CustomEvent('mermaidRendered'));
  }).catch((err) => {
    console.error('Mermaid rendering error:', err);
    window.mermaidRendered = true;
    document.dispatchEvent(new CustomEvent('mermaidRendered'));
  });
</script>
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
