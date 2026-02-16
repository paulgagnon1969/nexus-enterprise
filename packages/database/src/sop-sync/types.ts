/**
 * SOP (Standard Operating Procedure) sync types
 */

export interface SopFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  created: string; // YYYY-MM-DD
  updated: string; // YYYY-MM-DD
  author: string;
}

export interface ParsedSop {
  /** Unique code derived from filename (e.g., "file-deduplication-sop") */
  code: string;
  /** Parsed frontmatter */
  frontmatter: SopFrontmatter;
  /** Raw markdown body (after frontmatter) */
  markdownBody: string;
  /** HTML-converted body */
  htmlBody: string;
  /** SHA-256 hash of markdown content for change detection */
  contentHash: string;
  /** Original file path */
  filePath: string;
  /** File modification timestamp (ISO string) */
  fileModifiedAt: string;
}

export interface SopSyncResult {
  code: string;
  title: string;
  action: "created" | "updated" | "unchanged" | "error";
  previousRevision?: string;
  newRevision?: string;
  systemDocumentId?: string;
  error?: string;
}

export interface SopSyncReport {
  timestamp: string;
  results: SopSyncResult[];
  summary: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
  };
}
