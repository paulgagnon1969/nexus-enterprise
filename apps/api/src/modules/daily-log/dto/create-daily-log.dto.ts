import { IsArray, IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";

export class CreateDailyLogDto {
  @IsDateString()
  logDate!: string;

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
}
