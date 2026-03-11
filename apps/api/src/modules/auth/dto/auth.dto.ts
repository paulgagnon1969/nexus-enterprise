import { IsEmail, IsString, IsOptional, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  companyName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  @IsOptional()
  deviceFingerprint?: string;

  @IsString()
  @IsOptional()
  devicePlatform?: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
