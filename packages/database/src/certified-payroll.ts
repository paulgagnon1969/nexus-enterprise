import prisma from "./client";
import type { Company, CompanyOffice, TaxJurisdiction } from "@prisma/client";
import type { OfficePayrollConfig, CertifiedPayrollEmployerInfo } from "./payroll-types";

export interface ResolveEmployerInfoParams {
  companyId: string;
  /** Optional office context; if provided, office payrollConfig overrides
   * company-level defaults. If omitted, only company defaults are used. */
  officeId?: string | null;
}

export interface CertifiedPayrollTaxConfig {
  fedRate: number;
  ficaRate: number;
  medicareRate: number;
  stateRate: number;
  localRate: number;
  representational: boolean;
}

export const TAPOUT_BASELINE_TAX_PROFILE: CertifiedPayrollTaxConfig = {
  fedRate: 0.0693,
  ficaRate: 0.0608,
  medicareRate: 0.0142,
  stateRate: 0.0284,
  localRate: 0,
  representational: true,
};

/**
 * Resolve employer / jurisdiction configuration for Certified Payroll by
 * merging company-level defaults with optional office-level overrides.
 *
 * This helper does not yet touch any payroll transaction tables; it only
 * normalizes the employer-side configuration that the Certified Payroll
 * exporter will need.
 */
export async function resolveCertifiedPayrollEmployerInfo(
  params: ResolveEmployerInfoParams,
): Promise<CertifiedPayrollEmployerInfo> {
  const { companyId, officeId } = params;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new Error(`Company not found for id=${companyId}`);
  }

  let office: CompanyOffice | null = null;
  if (officeId) {
    office = await prisma.companyOffice.findFirst({
      where: {
        id: officeId,
        companyId,
        deletedAt: null,
      },
    });
  }

  const companyCfg = (company.defaultPayrollConfig || {}) as OfficePayrollConfig;
  const officeCfg = (office?.payrollConfig || {}) as OfficePayrollConfig;

  const merged: OfficePayrollConfig = {
    federalEin: officeCfg.federalEin ?? companyCfg.federalEin ?? null,
    stateWithholdingId:
      officeCfg.stateWithholdingId ?? companyCfg.stateWithholdingId ?? null,
    stateUnemploymentId:
      officeCfg.stateUnemploymentId ?? companyCfg.stateUnemploymentId ?? null,
    localTaxJurisdiction:
      officeCfg.localTaxJurisdiction ?? companyCfg.localTaxJurisdiction ?? null,
    localTaxAccountId:
      officeCfg.localTaxAccountId ?? companyCfg.localTaxAccountId ?? null,
  };

  return {
    companyId: company.id,
    companyName: company.name,
    defaultTimeZone: company.defaultTimeZone ?? null,
    federalEin: merged.federalEin ?? null,
    stateWithholdingId: merged.stateWithholdingId ?? null,
    stateUnemploymentId: merged.stateUnemploymentId ?? null,
    localTaxJurisdiction: merged.localTaxJurisdiction ?? null,
    localTaxAccountId: merged.localTaxAccountId ?? null,
  };
}

export interface ResolveTaxConfigParams {
  companyId: string;
  projectId?: string | null;
}

/**
 * Resolve the effective Certified Payroll tax configuration for a given
 * company + optional project. When a project is provided and has an attached
 * TaxJurisdiction, we use its rates; otherwise we fall back to the global
 * Tapout baseline profile.
 */
export async function resolveCertifiedPayrollTaxConfig(
  params: ResolveTaxConfigParams,
): Promise<CertifiedPayrollTaxConfig> {
  const { companyId, projectId } = params;

  if (!projectId) {
    return TAPOUT_BASELINE_TAX_PROFILE;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: { taxJurisdiction: true },
  });

  if (!project || !project.taxJurisdiction) {
    return TAPOUT_BASELINE_TAX_PROFILE;
  }

  const j = project.taxJurisdiction;
  return {
    fedRate: j.fedRate,
    ficaRate: j.ficaRate,
    medicareRate: j.medicareRate,
    stateRate: j.stateRate,
    localRate: j.localRate,
    representational: j.representational,
  };
}

// --- Certified Payroll row building ---

export type EmploymentType = "W2" | "CONTRACTOR_1099";

export interface DailySodHours {
  /** Standard time hours for this day. */
  st: number;
  /** Overtime hours (paid at OT_rate). */
  ot: number;
  /** Double-time hours (paid at 2OT_rate). */
  dt: number;
}

/**
 * Internal source shape for a single worker / project / week that we
 * want to emit as one Certified Payroll row.
 */
export interface CertifiedPayrollSource {
  companyId: string;
  projectId?: string | null;
  officeId?: string | null;

  workerId?: string | null;
  employeeId?: string | null;

  firstName: string;
  lastName: string;
  /** Optional full SSN or masked; downstream exporter may further mask. */
  ssn?: string | null;

  classCode?: string | null;
  employmentType: EmploymentType;

  /** If known, explicit base hourly rate. */
  baseHourlyRate?: number | null;
  /** If paid by the day, use dayRate + base hours to derive hourly. */
  dayRate?: number | null;
  dayRateBaseHours?: number | null;

  /** Actual total pay for this worker/project/week (the 1099 or W-2 gross). */
  totalPay: number;

  /** Week ending date for this payroll row. */
  weekEndDate: Date;

  /** Optional check / ACH reference. */
  checkNum?: string | null;

  projectCode?: string | null;
  contractId?: string | null;
  workOrder?: string | null;

  /** Hours per day for this project/week, indexed 0..6 (Sun..Sat or Mon..Sun). */
  dailyHours: DailySodHours[];
}

/**
 * Minimal typed view of the LCPUpload Template row. We model explicitly the
 * columns we populate; the remaining columns can be added over time.
 */
export interface CertifiedPayrollRow {
  payroll_number?: string | null;
  project_code?: string | null;
  contract_id?: string | null;
  work_order?: string | null;
  week_end_date: string; // formatted date string (e.g. YYYY-MM-DD)
  check_num?: string | null;

  ssn?: string | null;
  employee_ID?: string | null;
  class_code?: string | null;

  gross_employee_pay: number;
  all_projects?: number | null;
  wages_paid_in_lieu_of_fringes: number;
  total_paid: number;

  st_hrs_date1: number;
  st_hrs_date2: number;
  st_hrs_date3: number;
  st_hrs_date4: number;
  st_hrs_date5: number;
  st_hrs_date6: number;
  st_hrs_date7: number;

  ov_hrs_date1: number;
  ov_hrs_date2: number;
  ov_hrs_date3: number;
  ov_hrs_date4: number;
  ov_hrs_date5: number;
  ov_hrs_date6: number;
  ov_hrs_date7: number;

  ov_hrsx2_date1: number;
  ov_hrsx2_date2: number;
  ov_hrsx2_date3: number;
  ov_hrsx2_date4: number;
  ov_hrsx2_date5: number;
  ov_hrsx2_date6: number;
  ov_hrsx2_date7: number;

  Total_Hours_All_Projects: number;

  ep_haw?: number | null;
  ep_pension?: number | null;
  ep_vac_hol?: number | null;
  ep_train?: number | null;
  ep_all_other?: number | null;

  vol_cont_pension?: number | null;
  vol_emp_pay_med?: number | null;

  dts_fed_tax: number;
  dts_fica: number;
  dts_medicare: number;
  dts_state_tax: number;
  dts_sdi?: number | null;
  dts_dues?: number | null;
  dts_savings?: number | null;
  dts_other?: number | null;
  dts_total: number;

  trav_subs?: number | null;

  pay_rate: number;
  OT_rate: number;
  "2OT_rate": number;

  prnotes?: string | null;
  Payment_date?: string | null;

  first_name?: string | null;
  last_name?: string | null;

  // Allow additional columns to be added without breaking callers.
  [column: string]: string | number | null | undefined;
}

function formatDate(date: Date): string {
  // ISO local date (YYYY-MM-DD); CSV exporter can reformat if needed.
  return date.toISOString().slice(0, 10);
}

// Header order taken from LCPUpload Template WW42.csv. Note the two
// unnamed columns after check_num which correspond to first/last name
// in the Tapout examples; we keep them for positional compatibility.
const LCP_UPLOAD_HEADERS: string[] = [
  "payroll_number",
  "project_code",
  "contract_id",
  "work_order",
  "week_end_date",
  "check_num",
  "", // first name (unnamed in template header)
  "", // last name (unnamed in template header)
  "ssn",
  "employee_ID",
  "class_code",
  "gross_employee_pay",
  "all_projects",
  "wages_paid_in_lieu_of_fringes",
  "total_paid",
  "st_hrs_date1",
  "st_hrs_date2",
  "st_hrs_date3",
  "st_hrs_date4",
  "st_hrs_date5",
  "st_hrs_date6",
  "st_hrs_date7",
  "ov_hrs_date1",
  "ov_hrs_date2",
  "ov_hrs_date3",
  "ov_hrs_date4",
  "ov_hrs_date5",
  "ov_hrs_date6",
  "ov_hrs_date7",
  "ov_hrsx2_date1",
  "ov_hrsx2_date2",
  "ov_hrsx2_date3",
  "ov_hrsx2_date4",
  "ov_hrsx2_date5",
  "ov_hrsx2_date6",
  "ov_hrsx2_date7",
  "Total_Hours_All_Projects",
  "ep_haw",
  "ep_pension",
  "ep_vac_hol",
  "ep_train",
  "ep_all_other",
  "vol_cont_pension",
  "vol_emp_pay_med",
  "dts_fed_tax",
  "dts_fica",
  "dts_medicare",
  "dts_state_tax",
  "dts_sdi",
  "dts_dues",
  "dts_savings",
  "dts_other",
  "dts_total",
  "trav_subs",
  "pay_rate",
  "OT_rate",
  "2OT_rate",
  "prnotes",
  "Payment_date",
  "first_name",
  "last_name",
  "address1",
  "address2",
  "city",
  "state",
  "ZIP",
  "phone",
  "gender",
  "ethnicity",
  "apprentice_id",
  "craft_id",
  "vac_hol_dues_rate",
  "emp_ep_haw",
  "emp_ep_pension",
  "emp_ep_other",
  "training_rate",
  "vol_cont_pension_rate",
  "vol_cont_medical_rate",
  "in_lieu_payment_rate",
  "vac_chk_box",
  "fringe_paid_chk_box",
  "date_hired",
  "emp_status",
  "work_county",
  "IsForeman",
  "IsDisadvantaged",
  "VeteranStatus",
  "OtherDeductionNotes",
  "num_exempt",
  "DriversLicense",
  "DriversLicenseState",
  "Owner_Operator",
  "I9Verified",
  "Geographic_Ward",
  "Geographic_Area",
  "Congressional_District",
  "State_Senate_District",
  "OD_Category",
  "OD_Type",
  "OD_Amount",
  "FringesProvidedByEmployer",
  "LocalUnionNumber",
  "YTD_SickPayTime",
  "Email",
];

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (s.includes("\"")) {
    // Escape double quotes per CSV rules by doubling them
    s = s.replace(/"/g, '""');
  }
  if (/[",\n\r]/.test(s)) {
    s = `"${s}"`;
  }
  return s;
}

/**
 * Build Certified Payroll rows for a homogeneous set of sources (typically a
 * single company + project + week). This does not write CSV; it only builds
 * row objects keyed by LCPUpload Template column names.
 */
export async function buildCertifiedPayrollRows(
  sources: CertifiedPayrollSource[],
): Promise<CertifiedPayrollRow[]> {
  if (!sources.length) return [];

  const rows: CertifiedPayrollRow[] = [];

  for (const src of sources) {
    // Basic validation
    if (!src.totalPay || src.totalPay < 0) {
      continue; // skip empty / invalid rows for now
    }

    const taxConfig = await resolveCertifiedPayrollTaxConfig({
      companyId: src.companyId,
      projectId: src.projectId ?? null,
    });

    const daily = src.dailyHours || [];
    const stByDay = new Array(7).fill(0).map((_, i) => daily[i]?.st ?? 0);
    const otByDay = new Array(7).fill(0).map((_, i) => daily[i]?.ot ?? 0);
    const dtByDay = new Array(7).fill(0).map((_, i) => daily[i]?.dt ?? 0);

    const H_S = stByDay.reduce((a, b) => a + b, 0);
    const H_O = otByDay.reduce((a, b) => a + b, 0);
    const H_D = dtByDay.reduce((a, b) => a + b, 0);
    const H_total = H_S + H_O + H_D;

    // Derive base hourly rate
    let baseRate: number;
    if (src.baseHourlyRate && src.baseHourlyRate > 0) {
      baseRate = src.baseHourlyRate;
    } else if (src.dayRate && src.dayRateBaseHours && src.dayRateBaseHours > 0) {
      baseRate = src.dayRate / src.dayRateBaseHours;
    } else {
      const denom = H_S + 1.5 * H_O + 2 * H_D;
      baseRate = denom > 0 ? src.totalPay / denom : 0;
    }

    const otRate = baseRate * 1.5;
    const dtRate = baseRate * 2;

    // Allocate wages across S/O/D buckets and scale to match totalPay
    const wS_theory = H_S * baseRate;
    const wO_theory = H_O * otRate;
    const wD_theory = H_D * dtRate;
    const w_total_theory = wS_theory + wO_theory + wD_theory;

    const k = w_total_theory > 0 ? src.totalPay / w_total_theory : 1;
    const gross = src.totalPay;

    // Representational deductions per Tapout-style taxConfig
    const D_fed = gross * taxConfig.fedRate;
    const D_fica = gross * taxConfig.ficaRate;
    const D_med = gross * taxConfig.medicareRate;
    const D_state = gross * taxConfig.stateRate;
    const D_local = gross * taxConfig.localRate;

    const dts_total = D_fed + D_fica + D_med + D_state + D_local;

    let wagesInLieu = 0;
    let totalPaid = gross;

    if (taxConfig.representational) {
      // Option B: show deductions but offset fully via in-lieu so net == gross
      wagesInLieu = dts_total;
      totalPaid = gross;
    } else {
      // Non-representational path: treat deductions as actually reducing net
      wagesInLieu = 0;
      totalPaid = gross - dts_total;
    }

    const row: CertifiedPayrollRow = {
      payroll_number: undefined,
      project_code: src.projectCode ?? null,
      contract_id: src.contractId ?? null,
      work_order: src.workOrder ?? null,
      week_end_date: formatDate(src.weekEndDate),
      check_num: src.checkNum ?? null,

      ssn: src.ssn ?? null,
      employee_ID: src.employeeId ?? src.workerId ?? null,
      class_code: src.classCode ?? null,

      gross_employee_pay: gross,
      all_projects: gross, // single-project context for now
      wages_paid_in_lieu_of_fringes: wagesInLieu,
      total_paid: totalPaid,

      st_hrs_date1: stByDay[0],
      st_hrs_date2: stByDay[1],
      st_hrs_date3: stByDay[2],
      st_hrs_date4: stByDay[3],
      st_hrs_date5: stByDay[4],
      st_hrs_date6: stByDay[5],
      st_hrs_date7: stByDay[6],

      ov_hrs_date1: otByDay[0],
      ov_hrs_date2: otByDay[1],
      ov_hrs_date3: otByDay[2],
      ov_hrs_date4: otByDay[3],
      ov_hrs_date5: otByDay[4],
      ov_hrs_date6: otByDay[5],
      ov_hrs_date7: otByDay[6],

      ov_hrsx2_date1: dtByDay[0],
      ov_hrsx2_date2: dtByDay[1],
      ov_hrsx2_date3: dtByDay[2],
      ov_hrsx2_date4: dtByDay[3],
      ov_hrsx2_date5: dtByDay[4],
      ov_hrsx2_date6: dtByDay[5],
      ov_hrsx2_date7: dtByDay[6],

      Total_Hours_All_Projects: H_total,

      ep_haw: null,
      ep_pension: null,
      ep_vac_hol: null,
      ep_train: null,
      ep_all_other: null,

      vol_cont_pension: null,
      vol_emp_pay_med: null,

      dts_fed_tax: D_fed,
      dts_fica: D_fica,
      dts_medicare: D_med,
      dts_state_tax: D_state,
      dts_sdi: 0,
      dts_dues: 0,
      dts_savings: 0,
      // For now, treat local burden as "other" deduction; can be split later.
      dts_other: D_local,
      dts_total,

      trav_subs: null,

      pay_rate: baseRate,
      OT_rate: otRate,
      "2OT_rate": dtRate,

      prnotes: null,
      Payment_date: null,

      first_name: src.firstName,
      last_name: src.lastName,
    };

    rows.push(row);
  }

  return rows;
}

export async function buildSourcesForProjectWeek(params: {
  companyId: string;
  projectId: string;
  weekEndDate: Date;
}): Promise<CertifiedPayrollSource[]> {
  const { companyId, projectId, weekEndDate } = params;

  const records = await prisma.payrollWeekRecord.findMany({
    where: { companyId, projectId, weekEndDate },
  });

  return records.map((r: any) => {
    const daily: DailySodHours[] = [];

    if (r.dailyHoursJson) {
      const parsed = r.dailyHoursJson as any[];
      for (let i = 0; i < 7; i++) {
        const d = parsed[i] || {};
        daily.push({
          st: typeof d.st === "number" ? d.st : 0,
          ot: typeof d.ot === "number" ? d.ot : 0,
          dt: typeof d.dt === "number" ? d.dt : 0,
        });
      }
    } else {
      daily.push({
        st: r.totalHoursSt ?? 0,
        ot: r.totalHoursOt ?? 0,
        dt: r.totalHoursDt ?? 0,
      } as any);
      while (daily.length < 7) {
        daily.push({ st: 0, ot: 0, dt: 0 });
      }
    }

    return {
      companyId,
      projectId,
      officeId: null,
      workerId: r.workerId ?? null,
      employeeId: r.employeeId ?? null,
      firstName: r.firstName ?? "",
      lastName: r.lastName ?? "",
      ssn: r.ssn ?? null,
      classCode: r.classCode ?? null,
      employmentType: (r.employmentType as EmploymentType) ?? "CONTRACTOR_1099",
      baseHourlyRate: r.baseHourlyRate ?? null,
      dayRate: r.dayRate ?? null,
      dayRateBaseHours: r.dayRateBaseHours ?? null,
      totalPay: r.totalPay,
      weekEndDate: r.weekEndDate,
      checkNum: null,
      projectCode: r.projectCode ?? null,
      contractId: null,
      workOrder: null,
      dailyHours: daily,
    } satisfies CertifiedPayrollSource;
  });
}

/**
 * Render CertifiedPayrollRow objects to a CSV string matching the
 * LCPUpload Template header order used by the Tapout/BIA examples.
 */
export function buildCertifiedPayrollCsv(rows: CertifiedPayrollRow[]): string {
  const headerLine = LCP_UPLOAD_HEADERS.join(",");
  const lines: string[] = [headerLine];

  for (const row of rows) {
    const cols = LCP_UPLOAD_HEADERS.map((key) => {
      if (!key) return ""; // unnamed columns
      const v = (row as any)[key] as string | number | null | undefined;
      return csvEscape(v);
    });
    lines.push(cols.join(","));
  }

  return lines.join("\n");
}
