export type ApiRole = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT";
export type ApiGlobalRole = "SUPER_ADMIN" | "SUPPORT" | "NONE";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user?: { id: string; email: string };
  company?: { id: string; name: string };
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse extends AuthTokens {}

export interface UserMeResponse {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  globalRole?: ApiGlobalRole | string;
  userType?: string | null;
  memberships?: Array<{
    companyId: string;
    role: ApiRole | string;
    company?: { id: string; name: string; kind?: string | null };
  }>;
}

export interface ProjectListItem {
  id: string;
  name: string;
  status?: string | null;
}

export interface DailyLogCreateRequest {
  logDate: string; // ISO date
  title?: string | null;

  // Common “PUDL” style fields
  weatherSummary?: string | null;
  crewOnSite?: string | null;
  workPerformed?: string | null;
  issues?: string | null;
  safetyIncidents?: string | null;
  manpowerOnsite?: string | null;
  personOnsite?: string | null;
  confidentialNotes?: string | null;

  // Sharing flags (optional)
  shareInternal?: boolean;
  shareSubs?: boolean;
  shareClient?: boolean;
  sharePrivate?: boolean;
}

// Scope-only PETL view for PUDL / Daily Logs.
export interface FieldPetlItem {
  sowItemId: string;
  lineNo: number;
  roomParticleId: string | null;
  roomName: string | null;
  categoryCode: string | null;
  selectionCode: string | null;
  activity: string | null;
  description: string | null;
  unit: string | null;
  originalQty: number | null;
  qty: number | null;
  qtyFlaggedIncorrect: boolean;
  qtyFieldReported: number | null;
  qtyReviewStatus: string | null;
  orgGroupCode: string | null;
  percentComplete?: number;
}
