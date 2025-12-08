import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
import { ParcelStatus } from "@prisma/client";

export class CreateParcelDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parcelCode?: string;

  @IsOptional()
  @IsNumber()
  areaSqFt?: number;

  @IsOptional()
  @IsString()
  zoning?: string;
}

export class UpdateParcelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parcelCode?: string;

  @IsOptional()
  @IsEnum(ParcelStatus)
  status?: ParcelStatus;

  @IsOptional()
  @IsNumber()
  areaSqFt?: number;

  @IsOptional()
  @IsString()
  zoning?: string;
}
