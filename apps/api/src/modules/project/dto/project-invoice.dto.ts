import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import {
  ProjectInvoiceLineItemKind,
  ProjectInvoicePetlLineBillingTag,
  ProjectPaymentMethod,
} from "@prisma/client";

export class CreateOrGetDraftInvoiceDto {
  // When true, always create a new draft invoice even if one already exists.
  @IsOptional()
  @IsBoolean()
  forceNew?: boolean;

  @IsOptional()
  @IsString()
  billToName?: string;

  @IsOptional()
  @IsString()
  billToEmail?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class AddInvoiceLineItemDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsEnum(ProjectInvoiceLineItemKind)
  kind?: ProjectInvoiceLineItemKind;

  @IsOptional()
  @IsEnum(ProjectInvoicePetlLineBillingTag)
  billingTag?: ProjectInvoicePetlLineBillingTag;

  // Optional pointer to the tenant cost book item that generated this line.
  @IsOptional()
  @IsString()
  companyPriceListItemId?: string;

  @IsOptional()
  @IsNumber()
  qty?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateInvoiceLineItemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectInvoiceLineItemKind)
  kind?: ProjectInvoiceLineItemKind;

  @IsOptional()
  @IsEnum(ProjectInvoicePetlLineBillingTag)
  billingTag?: ProjectInvoicePetlLineBillingTag;

  @IsOptional()
  @IsString()
  companyPriceListItemId?: string;

  @IsOptional()
  @IsNumber()
  qty?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class IssueInvoiceDto {
  @IsOptional()
  @IsString()
  billToName?: string;

  @IsOptional()
  @IsString()
  billToEmail?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  // ISO string. If omitted we leave dueAt unset.
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class RecordInvoicePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(ProjectPaymentMethod)
  method!: ProjectPaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

// Record a payment (cash receipt) for a project even if it is not yet applied to any invoice.
export class RecordProjectPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(ProjectPaymentMethod)
  method!: ProjectPaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

// Apply some or all of a previously recorded project payment to a specific invoice.
export class ApplyPaymentToInvoiceDto {
  @IsString()
  @IsNotEmpty()
  invoiceId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

// Apply some or all of a deposit/credit invoice to another invoice (invoice-to-invoice credit).
export class ApplyInvoiceToInvoiceDto {
  @IsString()
  @IsNotEmpty()
  sourceInvoiceId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class UpdateInvoicePetlLineDto {
  @IsEnum(ProjectInvoicePetlLineBillingTag)
  billingTag!: ProjectInvoicePetlLineBillingTag;
}
