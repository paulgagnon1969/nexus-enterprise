import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { DocumentTemplateType } from "@prisma/client";

export class CreateDocumentTemplateDto {
  @IsOptional()
  @IsEnum(DocumentTemplateType)
  type?: DocumentTemplateType;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Initial HTML for version 1
  @IsOptional()
  @IsString()
  templateHtml?: string;

  @IsOptional()
  @IsString()
  versionLabel?: string;

  @IsOptional()
  @IsString()
  versionNotes?: string;
}

export class UpdateDocumentTemplateDto {
  @IsOptional()
  @IsEnum(DocumentTemplateType)
  type?: DocumentTemplateType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // If provided, creates a new version and sets it as current.
  @IsOptional()
  @IsString()
  templateHtml?: string;

  @IsOptional()
  @IsString()
  versionLabel?: string;

  @IsOptional()
  @IsString()
  versionNotes?: string;

  // If provided (and belongs to this template), sets currentVersionId.
  @IsOptional()
  @IsString()
  currentVersionId?: string;
}
