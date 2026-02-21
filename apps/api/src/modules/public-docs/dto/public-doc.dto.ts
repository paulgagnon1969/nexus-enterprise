import {
  IsString,
  IsOptional,
  IsDateString,
  MinLength,
  IsEmail,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";

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

// =========================================================================
// Secure Share DTOs
// =========================================================================

export class SecureShareRecipientDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateSecureShareDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SecureShareRecipientDto)
  recipients!: SecureShareRecipientDto[];

  @IsOptional()
  @IsString()
  readerGroupId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class AccessSecureShareDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

// =========================================================================
// Reader Group DTOs
// =========================================================================

export class CreateReaderGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateReaderGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ReaderGroupMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class AddReaderGroupMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReaderGroupMemberDto)
  members!: ReaderGroupMemberDto[];
}
