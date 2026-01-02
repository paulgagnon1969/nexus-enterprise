export interface OfficePayrollConfig {
  /** Federal Employer Identification Number (no formatting enforced here). */
  federalEin?: string | null;
  /** State withholding account ID for this office's jurisdiction. */
  stateWithholdingId?: string | null;
  /** State unemployment insurance account ID. */
  stateUnemploymentId?: string | null;
  /** Local tax / city or county jurisdiction code (if applicable). */
  localTaxJurisdiction?: string | null;
  /** Local withholding/tax account ID. */
  localTaxAccountId?: string | null;
}

export interface CompanyPayrollDefaults {
  /** Default time zone for payroll calculations (IANA name). */
  defaultTimeZone?: string | null;
  /** Organization-wide payroll configuration JSON (free-form, but often
   * mirrors the OfficePayrollConfig shape for the primary jurisdiction). */
  defaultPayrollConfig?: OfficePayrollConfig | null;
}

/**
 * Resolved employer/jurisdiction info used when generating Certified Payroll
 * rows. This merges company-level defaults with office-level overrides.
 */
export interface CertifiedPayrollEmployerInfo extends OfficePayrollConfig {
  companyId: string;
  companyName: string;
  /** Effective time zone used for payroll calculations and reporting. */
  defaultTimeZone: string | null;
}
