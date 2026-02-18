import { IsString, IsOptional, IsArray, IsEnum, IsNumber } from "class-validator";
import { SystemDocumentPublicationTarget } from "@prisma/client";

export class CreateSystemDocumentDto {
  @IsString()
  code!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  htmlContent!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSystemDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  htmlContent!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// Extended target types beyond Prisma enum
export type ExtendedPublicationTarget = 
  | "ALL_TENANTS" 
  | "SINGLE_TENANT" 
  | "MULTIPLE_TENANTS" 
  | "GROUP";

export class PublishSystemDocumentDto {
  @IsString()
  targetType!: ExtendedPublicationTarget;

  // For SINGLE_TENANT
  @IsOptional()
  @IsString()
  targetCompanyId?: string;

  // For MULTIPLE_TENANTS
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCompanyIds?: string[];

  // For GROUP
  @IsOptional()
  @IsString()
  targetGroupId?: string;
}

export class CopyToOrgDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class UpdateTenantCopyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  htmlContent!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RollbackTenantCopyDto {
  @IsOptional()
  @IsNumber()
  versionNo?: number;
}

export class ImportWithManualDto {
  // Document fields
  @IsString()
  code!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  htmlContent!: string;

  // Manual placement fields
  @IsString()
  manualCode!: string;

  @IsOptional()
  @IsString()
  manualTitle?: string;

  @IsOptional()
  @IsString()
  manualIcon?: string;

  @IsOptional()
  @IsNumber()
  chapterNumber?: number;

  @IsOptional()
  @IsString()
  chapterTitle?: string;
}
