import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateDailyLogDto {
  @IsOptional()
  @IsDateString()
  logDate?: string;

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
  weatherJson?: any;

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
  @IsIn(['PUDL', 'RECEIPT_EXPENSE', 'JSA', 'INCIDENT', 'QUALITY', 'TADL', 'CUSTOM'])
  type?: string;

  @IsOptional()
  @IsString()
  expenseVendor?: string | null;

  @IsOptional()
  @IsNumber()
  expenseAmount?: number | null;

  @IsOptional()
  @IsDateString()
  expenseDate?: string | null;

  // Structured personnel onsite (JSON array of PersonnelEntry)
  @IsOptional()
  personnelOnsiteJson?: any;

  // Source JSA log ID
  @IsOptional()
  @IsString()
  sourceJsaId?: string | null;

  // JSA safety notes (JSON)
  @IsOptional()
  jsaSafetyJson?: any;
}
