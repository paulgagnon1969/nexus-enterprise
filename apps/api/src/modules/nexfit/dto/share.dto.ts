/**
 * DTOs for viral document sharing & lightweight VIEWER registration.
 * Part of CLT-COLLAB-0003 — Graduated Identity System.
 */

export interface ShareDocumentDto {
  /** Sharer's email (becomes inviterEmail on the token) */
  email: string;
  /** Optional display name */
  name?: string;
  /** Which document type is being shared */
  documentType: "NEXFIT_REPORT" | "CAM_LIBRARY" | "CAM_DOCUMENT";
  /** Optional reference (e.g. specific CAM ID) */
  documentRef?: string;
  /** If the sharer was themselves invited, pass their token to build the chain */
  parentToken?: string;
}

export interface RegisterViewerDto {
  email: string;
  password: string;
  /** Optionally link this registration to a share token */
  token?: string;
  /** Whether the user opts into the Nexus Marketplace */
  marketplaceOptIn?: boolean;
}

export interface MarketplaceOptInDto {
  /** The user wants to join the marketplace */
  optIn: boolean;
}
