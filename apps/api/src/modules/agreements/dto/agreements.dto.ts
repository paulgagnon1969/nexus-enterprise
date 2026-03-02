import { AgreementCategory, SignatoryRole, SignatureMethod, TemplateSourceType } from "@prisma/client";

// ─── Template DTOs ───────────────────────────────────────────────────────────

export class CreateAgreementTemplateDto {
  code!: string;
  title!: string;
  description?: string;
  jurisdiction?: string;
  category?: AgreementCategory;
  htmlContent!: string;
  variables?: TemplateVariableDef[];
  sourceType?: TemplateSourceType;
  originalFileUrl?: string;
  overlayFields?: OverlayFieldDef[];
  pageImageUrls?: string[];
}

export class UpdateAgreementTemplateDto {
  title?: string;
  description?: string;
  jurisdiction?: string;
  category?: AgreementCategory;
  htmlContent?: string;
  variables?: TemplateVariableDef[];
  isActive?: boolean;
  sourceType?: TemplateSourceType;
  originalFileUrl?: string;
  overlayFields?: OverlayFieldDef[];
  pageImageUrls?: string[];
}

export interface TemplateVariableDef {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "date" | "number" | "textarea";
  required?: boolean;
  group?: string; // e.g. "Company", "Property Owner", "Insurance"
  defaultValue?: string;
}

// ─── Agreement DTOs ──────────────────────────────────────────────────────────

export class CreateAgreementDto {
  templateId?: string;
  projectId?: string;
  title!: string;
  variables?: Record<string, string>;
  signatories?: CreateSignatoryDto[];
  dueDate?: string; // ISO date string
}

export class UpdateAgreementDto {
  title?: string;
  variables?: Record<string, string>;
  htmlContent?: string;
  dueDate?: string;
  projectId?: string;
}

export class CreateSignatoryDto {
  role!: SignatoryRole;
  name!: string;
  email?: string;
  phone?: string;
  sortOrder?: number;
}

// ─── Signing DTOs ────────────────────────────────────────────────────────────

export class SignAgreementDto {
  signatoryId!: string;
  signatureMethod!: SignatureMethod;
  signatureData!: string; // base64 for DRAWN/UPLOADED, full name for TYPED
}

// ─── Void / Send DTOs ────────────────────────────────────────────────────────

export class VoidAgreementDto {
  reason?: string;
}

export class SendAgreementDto {
  // Future: notification preferences, custom message, etc.
  message?: string;
}

// ─── Overlay Field Definition (for image/scanned template mode) ──────────────

export interface OverlayFieldDef {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "date" | "number" | "signature" | "initials" | "checkbox";
  x: number;       // Percentage from left (0-100)
  y: number;       // Percentage from top (0-100)
  width: number;   // Percentage width
  height: number;  // Percentage height
  pageIndex: number;
  required?: boolean;
  group?: string;
}
