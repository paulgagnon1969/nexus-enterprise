import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
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
}

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class ImportXactDto {
  @IsString()
  csvPath!: string;
}
