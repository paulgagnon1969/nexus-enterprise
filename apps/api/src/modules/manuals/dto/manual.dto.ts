import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsArray,
  IsEnum,
} from "class-validator";

// =========================================================================
// Enums
// =========================================================================

export enum ManualStatusDto {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

// =========================================================================
// Manual DTOs
// =========================================================================

export class CreateManualDto {
  @IsString()
  code!: string;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  publicSlug?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  publishToAllTenants?: boolean;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsString()
  @IsOptional()
  iconEmoji?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetTagIds?: string[];

  // Ownership and access control
  @IsString()
  @IsOptional()
  ownerCompanyId?: string; // Null for NEXUS System manuals

  @IsBoolean()
  @IsOptional()
  isNexusInternal?: boolean; // If true, only users with requiredGlobalRoles can access

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredGlobalRoles?: string[]; // GlobalRole values (e.g., "SUPER_ADMIN", "NCC_SYSTEM_DEVELOPER")
}

export class UpdateManualDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  publicSlug?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  publishToAllTenants?: boolean;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsString()
  @IsOptional()
  iconEmoji?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetTagIds?: string[];

  // Ownership and access control
  @IsBoolean()
  @IsOptional()
  isNexusInternal?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredGlobalRoles?: string[];
}

export class PublishManualDto {
  @IsString()
  @IsOptional()
  changeNotes?: string;
}

// =========================================================================
// Chapter DTOs
// =========================================================================

export class CreateChapterDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateChapterDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class ReorderChaptersDto {
  @IsArray()
  @IsString({ each: true })
  chapterIds!: string[]; // In desired order
}

// =========================================================================
// Manual Document DTOs
// =========================================================================

export class AddDocumentToManualDto {
  @IsString()
  systemDocumentId!: string;

  @IsString()
  @IsOptional()
  chapterId?: string;

  @IsString()
  @IsOptional()
  displayTitleOverride?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateManualDocumentDto {
  @IsString()
  @IsOptional()
  chapterId?: string | null; // null to move to root

  @IsString()
  @IsOptional()
  displayTitleOverride?: string | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  includeInPrint?: boolean; // false = "This Section Intentionally Blank"
}

export class TogglePrintInclusionDto {
  @IsBoolean()
  includeInPrint!: boolean;
}

export class ReorderDocumentsDto {
  @IsArray()
  @IsString({ each: true })
  documentIds!: string[]; // ManualDocument IDs in desired order
}
