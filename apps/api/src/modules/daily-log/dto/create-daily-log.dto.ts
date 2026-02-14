import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";

export enum DailyLogTypeDto {
  PUDL = 'PUDL',
  RECEIPT_EXPENSE = 'RECEIPT_EXPENSE',
  JSA = 'JSA',
  INCIDENT = 'INCIDENT',
  QUALITY = 'QUALITY',
}

export class CreateDailyLogDto {
  @IsDateString()
  logDate!: string;

  @IsOptional()
  @IsEnum(DailyLogTypeDto)
  type?: DailyLogTypeDto;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  weatherSummary?: string | null;

  @IsOptional()
  @IsString()
  crewOnSite?: string | null;

  @IsOptional()
  @IsString()
  workPerformed?: string | null;

  @IsOptional()
  @IsString()
  issues?: string | null;

  @IsOptional()
  @IsString()
  safetyIncidents?: string | null;

  @IsOptional()
  @IsString()
  manpowerOnsite?: string | null;

  @IsOptional()
  @IsString()
  personOnsite?: string | null;

  @IsOptional()
  @IsString()
  confidentialNotes?: string | null;

  // Optional PETL context
  @IsOptional()
  @IsString()
  buildingId?: string | null;

  @IsOptional()
  @IsString()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  roomParticleId?: string | null;

  @IsOptional()
  @IsString()
  sowItemId?: string | null;

  @IsOptional()
  @IsBoolean()
  shareInternal?: boolean;

  @IsOptional()
  @IsBoolean()
  shareSubs?: boolean;

  @IsOptional()
  @IsBoolean()
  shareClient?: boolean;

  @IsOptional()
  @IsBoolean()
  sharePrivate?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifyUserIds?: string[];

  // Receipt/expense fields (used when type = RECEIPT_EXPENSE)
  @IsOptional()
  @IsString()
  expenseVendor?: string | null;

  @IsOptional()
  @IsNumber()
  expenseAmount?: number | null;

  @IsOptional()
  @IsDateString()
  expenseDate?: string | null;

  // Optional: project file IDs to attach (triggers OCR if receipt type)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentProjectFileIds?: string[];
}
