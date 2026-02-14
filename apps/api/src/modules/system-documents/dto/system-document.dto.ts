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

export class PublishSystemDocumentDto {
  @IsEnum(SystemDocumentPublicationTarget)
  targetType!: SystemDocumentPublicationTarget;

  @IsOptional()
  @IsString()
  targetCompanyId?: string;
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
