import { StagedDocumentStatus, DocumentScanJobStatus } from "@prisma/client";

// --- Scan Job DTOs ---

export class CreateScanJobDto {
  scanPath!: string;
}

// Response types use interfaces (not instantiated, just type shapes)
export interface ScanJobResponseDto {
  id: string;
  scanPath: string;
  status: DocumentScanJobStatus;
  documentsFound: number;
  documentsProcessed: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

// --- Staged Document DTOs ---

export interface StagedDocumentResponseDto {
  id: string;
  fileName: string;
  filePath: string;
  breadcrumb: string[];
  fileType: string;
  fileSize: bigint;
  mimeType?: string;
  thumbnailUrl?: string;
  status: StagedDocumentStatus;
  scannedAt: Date;
  archivedAt?: Date;
  importedAt?: Date;
  importedToType?: string;
  importedToId?: string;
}

export class UpdateStagedDocumentDto {
  status?: StagedDocumentStatus;
}

export class BulkUpdateStagedDocumentsDto {
  documentIds!: string[];
  status!: StagedDocumentStatus;
}

// --- List Query DTOs ---

export class ListStagedDocumentsQueryDto {
  scanJobId?: string;
  status?: StagedDocumentStatus | "ALL";
  fileType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export class ListScanJobsQueryDto {
  status?: DocumentScanJobStatus;
  page?: number;
  pageSize?: number;
}
