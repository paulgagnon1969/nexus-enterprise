import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { ProjectRole } from "@prisma/client";

export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsString()
  addressLine1!: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  primaryContactName?: string;

  @IsOptional()
  @IsString()
  primaryContactPhone?: string;

  @IsOptional()
  @IsString()
  primaryContactEmail?: string;

  @IsOptional()
  @IsString()
  tenantClientId?: string;
}

export class AddProjectMemberDto {
  // User IDs are Prisma string IDs (cuid), not RFC4122 UUIDs.
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  primaryContactName?: string;

  @IsOptional()
  @IsString()
  primaryContactPhone?: string;

  @IsOptional()
  @IsString()
  primaryContactEmail?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  tenantClientId?: string;
}

export class ImportXactDto {
  @IsString()
  csvPath!: string;
}

export class ImportXactComponentsDto {
  @IsString()
  csvPath!: string;

  @IsOptional()
  @IsString()
  estimateVersionId?: string;
}
