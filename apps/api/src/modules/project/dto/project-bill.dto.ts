import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ProjectBillLineItemKind, ProjectBillStatus } from "@prisma/client";

export class CreateProjectBillLineItemDto {
  @IsEnum(ProjectBillLineItemKind)
  kind!: ProjectBillLineItemKind;

  @IsString()
  @IsNotEmpty()
  description!: string;

  // Required for non-labor items. For labor, may be omitted when deriving from timecards.
  @IsOptional()
  @IsNumber()
  amount?: number | null;

  // When kind === LABOR and amount is omitted, we require these.
  @IsOptional()
  @IsDateString()
  timecardStartDate?: string;

  @IsOptional()
  @IsDateString()
  timecardEndDate?: string;
}

export class CreateProjectBillDto {
  @IsString()
  @IsNotEmpty()
  vendorName!: string;

  @IsOptional()
  @IsString()
  billNumber?: string;

  @IsDateString()
  billDate!: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(ProjectBillStatus)
  status?: ProjectBillStatus;

  @IsOptional()
  @IsString()
  memo?: string;

  @ValidateNested()
  @Type(() => CreateProjectBillLineItemDto)
  lineItem!: CreateProjectBillLineItemDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentProjectFileIds?: string[];
}

export class UpdateProjectBillLineItemDto {
  @IsOptional()
  @IsEnum(ProjectBillLineItemKind)
  kind?: ProjectBillLineItemKind;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  amount?: number | null;

  @IsOptional()
  @IsDateString()
  timecardStartDate?: string;

  @IsOptional()
  @IsDateString()
  timecardEndDate?: string;
}

export class UpdateProjectBillDto {
  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  billNumber?: string;

  @IsOptional()
  @IsDateString()
  billDate?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(ProjectBillStatus)
  status?: ProjectBillStatus;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProjectBillLineItemDto)
  lineItem?: UpdateProjectBillLineItemDto;
}

export class AttachProjectBillFileDto {
  @IsString()
  @IsNotEmpty()
  projectFileId!: string;
}
