/**
 * NexFetch — Shared receipt types.
 *
 * Both Home Depot and Lowe's parsers return a `ParsedReceipt` so the
 * downstream matcher / bill-creator can work vendor-agnostically.
 */

// ── Line item ────────────────────────────────────────────────────────

export interface ParsedLineItem {
  /** Vendor item identifier (UPC for HD, Lowe's item # for Lowe's) */
  sku: string | null;
  /** Short / abbreviated description (from the line itself) */
  shortDescription: string;
  /** Full / expanded description (next line on HD receipts, or same on Lowe's) */
  fullDescription: string | null;
  /** Model number (Lowe's only) */
  modelNumber: string | null;
  /** Quantity purchased (defaults to 1) */
  quantity: number;
  /** Unit of measure (EA, LD, etc.) */
  uom: string;
  /** Unit price */
  unitPrice: number;
  /** Extended price (qty × unit price) */
  extendedPrice: number;
  /** Tax category code (e.g. "A" on HD receipts) */
  taxCategory: string | null;
  /** Discount applied to this line item */
  discount: number;
  /** Discount reason / promo description */
  discountReason: string | null;
  /** Max refund value (HD only) */
  maxRefundValue: number | null;
  /** Return policy ID (HD only) */
  returnPolicyId: string | null;
  /** Return policy days (HD only) */
  returnPolicyDays: number | null;
  /** Return policy expiration date (HD only) */
  returnPolicyExpires: string | null;
}

// ── Payment ──────────────────────────────────────────────────────────

export interface ParsedPayment {
  /** Card type (VISA, MASTERCARD, etc.) */
  cardType: string | null;
  /** Last 4 digits of card */
  cardLast4: string | null;
  /** Amount charged */
  amount: number;
  /** Auth code */
  authCode: string | null;
  /** Read method (Chip Read, Swipe, Contactless, etc.) */
  readMethod: string | null;
}

// ── Store ────────────────────────────────────────────────────────────

export interface ParsedStore {
  /** Store number (e.g. "6551" for HD, "3434" for Lowe's) */
  storeNumber: string | null;
  /** Street address */
  address: string | null;
  /** City */
  city: string | null;
  /** State abbreviation */
  state: string | null;
  /** Zip / postal code */
  zip: string | null;
  /** Phone number */
  phone: string | null;
  /** Store manager name (Lowe's only) */
  manager: string | null;
}

// ── Pro / loyalty ────────────────────────────────────────────────────

export interface ParsedLoyalty {
  /** Member phone (masked on HD: ###-###-0654) */
  memberPhone: string | null;
  /** PO / Job Name (HD Pro Xtra only — critical for project matching) */
  poJobName: string | null;
  /** Year-to-date spend */
  ytdSpend: number | null;
  /** Loyalty program name */
  programName: string | null;
}

// ── Full receipt ─────────────────────────────────────────────────────

export type VendorId = "HOME_DEPOT" | "LOWES";

export interface ParsedReceipt {
  /** Which vendor this receipt came from */
  vendor: VendorId;
  /** Vendor display name */
  vendorName: string;

  // Store
  store: ParsedStore;

  // Transaction
  /** Transaction / receipt number */
  transactionNumber: string | null;
  /** Receipt date (YYYY-MM-DD) */
  receiptDate: string | null;
  /** Receipt time (HH:mm) */
  receiptTime: string | null;
  /** Register / sale type (e.g. "SALE SELF CHECKOUT") */
  saleType: string | null;
  /** Invoice number (Lowe's) */
  invoiceNumber: string | null;
  /** Order number (Lowe's) */
  orderNumber: string | null;

  // Line items
  lineItems: ParsedLineItem[];

  // Totals
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  totalSavings: number | null;
  shippingAmount: number | null;
  currency: string;

  // Payment
  payments: ParsedPayment[];

  // Loyalty / Pro
  loyalty: ParsedLoyalty | null;

  // Return policies (HD — mapped by policy ID)
  returnPolicies: Array<{
    policyId: string;
    days: number;
    expiresOn: string | null;
  }>;

  /** Raw text extracted from the receipt (for audit / search) */
  rawText: string;
}
