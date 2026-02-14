import { IsString, IsOptional, IsBoolean, IsInt, Min, IsArray } from "class-validator";

// =========================================================================
// System Tag DTOs
// =========================================================================

export class CreateSystemTagDto {
  @IsString()
  code!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateSystemTagDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

// =========================================================================
// Company System Tag Assignment DTOs
// =========================================================================

export class AssignTagsToCompanyDto {
  @IsArray()
  @IsString({ each: true })
  tagIds!: string[];
}

export class RemoveTagFromCompanyDto {
  @IsString()
  tagId!: string;
}

export class BulkAssignTagDto {
  @IsString()
  tagId!: string;

  @IsArray()
  @IsString({ each: true })
  companyIds!: string[];
}
