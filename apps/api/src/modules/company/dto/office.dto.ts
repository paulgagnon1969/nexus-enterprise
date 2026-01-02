import { IsOptional, IsString, Length } from "class-validator";

export class UpsertOfficeDto {
  @IsString()
  @Length(1, 200)
  label!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  state?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  country?: string;

  // Optional JSON payload for office-level payroll configuration. Shape is
  // owned by the payroll module; keep this loosely typed here.
  @IsOptional()
  payrollConfig?: any;
}
