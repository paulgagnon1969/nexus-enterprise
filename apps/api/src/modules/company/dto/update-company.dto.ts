import { IsOptional, IsString, Length, IsEmail } from "class-validator";

// Minimal company-level settings that admins can edit today.
// Additional payroll and configuration fields can be layered into a
// JSON-based structure later without changing this DTO surface.
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  // Optional: default time zone for this organization (IANA name), used as a
  // sensible default for offices, projects, and payroll reporting.
  @IsOptional()
  @IsString()
  @Length(0, 100)
  defaultTimeZone?: string;

  // Optional: default payroll configuration at the company level. Shape is
  // owned by the payroll module; keep this loosely typed here.
  @IsOptional()
  defaultPayrollConfig?: any | null;

  // --- Company contact info (for invoices, public branding) ---

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  website?: string;

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
  @Length(0, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  state?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  tagline?: string;
}
