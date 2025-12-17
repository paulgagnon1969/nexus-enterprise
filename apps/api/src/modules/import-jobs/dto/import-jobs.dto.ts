import { IsOptional, IsString } from "class-validator";

export class CreateXactRawImportJobDto {
  @IsString()
  csvPath!: string;
}

export class CreateXactComponentsImportJobDto {
  @IsString()
  csvPath!: string;

  @IsOptional()
  @IsString()
  estimateVersionId?: string;
}
