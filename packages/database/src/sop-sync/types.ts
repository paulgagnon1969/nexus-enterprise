/**
 * SOP (Standard Operating Procedure) sync types
 */

export type SopType =
  | "CAM"
  | "Session Log"
  | "Feature SOP"
  | "Infrastructure"
  | "Admin SOP"
  | "Policy"
  | "Training Manual"
  | "Orphan SOP";

export interface SopFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: "draft" | "published" | "archived" | "complete" | "stub" | "active";
  created: string; // YYYY-MM-DD
  updated: string; // YYYY-MM-DD
  author: string;
  /** CAM-specific: maps to ModuleCatalog.code */
  module_code?: string;
  /** CAM-specific: unique CAM identifier */
  cam_id?: string;
  /** CAM scores (parsed from nested YAML) */
  scores?: {
    uniqueness?: number;
    value?: number;
    demonstrable?: number;
    defensible?: number;
    total?: number;
  };
  /** CAM mode code (EST, FIN, OPS, etc.) */
  mode?: string;
  /** CAM category code (AUTO, SPD, VIS, etc.) */
  category?: string;
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
