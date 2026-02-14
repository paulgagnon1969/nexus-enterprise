import { IsString, IsOptional, IsDateString, MinLength } from "class-validator";

export class AccessShareLinkDto {
  @IsOptional()
  @IsString()
  passcode?: string;
}

export class CreateShareLinkDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  passcode?: string;
}

export class UpdatePublicSettingsDto {
  @IsOptional()
  @IsString()
  publicSlug?: string;

  @IsOptional()
  isPublic?: boolean;
}
