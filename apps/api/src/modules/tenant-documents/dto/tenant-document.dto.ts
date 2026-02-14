import { IsString, IsOptional, IsEnum } from "class-validator";

export enum TenantDocumentStatusDto {
  UNRELEASED = "UNRELEASED",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export class PublishDocumentDto {
  @IsString()
  @IsOptional()
  internalNotes?: string;
}

export class ArchiveDocumentDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateTenantDocumentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;
}

export class PublishManualDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;
}
