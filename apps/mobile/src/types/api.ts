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

export interface SyncCredentials {
  userToken: string;
  companyToken: string;
}

export interface LoginResponse extends AuthTokens {
  user?: { id: string; email: string };
  company?: { id: string; name: string };
  syncCredentials?: SyncCredentials;
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
  // Location fields
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // Primary contact
  primaryContactName?: string | null;
  primaryContactPhone?: string | null;
  primaryContactEmail?: string | null;
}

// Contact categories for the Contacts screen
export type ContactCategory = "internal" | "external" | "subs" | "clients";

export interface Contact {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  title?: string | null;
  company?: string | null;
  category: ContactCategory;
}

export type DailyLogType = "PUDL" | "RECEIPT_EXPENSE" | "JSA" | "INCIDENT" | "QUALITY";

export interface DailyLogCreateRequest {
  logDate: string; // ISO date
  type?: DailyLogType;
  title?: string | null;

  // Common "PUDL" style fields
  weatherSummary?: string | null;
  crewOnSite?: string | null;
  workPerformed?: string | null;
  issues?: string | null;
  safetyIncidents?: string | null;
  manpowerOnsite?: string | null;
  personOnsite?: string | null;
  confidentialNotes?: string | null;

  // Receipt/expense fields (used when type = RECEIPT_EXPENSE)
  expenseVendor?: string | null;
  expenseAmount?: number | null;
  expenseDate?: string | null;

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

// Daily log list item (returned from feed endpoint)
export interface DailyLogListItem {
  id: string;
  projectId: string;
  projectName: string;
  logDate: string;
  type?: DailyLogType;
  title: string | null;
  workPerformed: string | null;
  issues: string | null;
  status: string;
  createdAt: string;
  createdById: string;
  // Delay publish workflow
  isDelayedPublish: boolean;
  delayedById?: string | null;
  delayedAt?: string | null;
  publishedById?: string | null;
  publishedAt?: string | null;
  createdByUser: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  attachments?: DailyLogAttachment[];
}

// Daily log attachment
export interface DailyLogAttachment {
  id: string;
  fileName: string | null;
  fileUrl: string | null;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
}

// Daily log full detail
export interface DailyLogDetail extends DailyLogListItem {
  weatherSummary: string | null;
  crewOnSite: string | null;
  safetyIncidents: string | null;
  manpowerOnsite: string | null;
  personOnsite: string | null;
  confidentialNotes: string | null;
  // Receipt/expense fields
  expenseVendor: string | null;
  expenseAmount: number | null;
  expenseDate: string | null;
  shareInternal: boolean;
  shareSubs: boolean;
  shareClient: boolean;
  sharePrivate: boolean;
  effectiveShareClient: boolean;
  building?: { id: string; name: string; code: string | null } | null;
  unit?: { id: string; label: string; floor: string | null } | null;
  roomParticle?: { id: string; name: string; fullLabel: string | null } | null;
  sowItem?: { id: string; description: string | null } | null;
}

// Feed response
export interface DailyLogFeedResponse {
  items: DailyLogListItem[];
  total: number;
  limit: number;
  offset: number;
}

// Daily log update request (all fields optional)
export interface DailyLogUpdateRequest {
  logDate?: string;
  title?: string | null;
  tags?: string[];
  weatherSummary?: string | null;
  crewOnSite?: string | null;
  workPerformed?: string | null;
  issues?: string | null;
  safetyIncidents?: string | null;
  manpowerOnsite?: string | null;
  personOnsite?: string | null;
  confidentialNotes?: string | null;
  shareInternal?: boolean;
  shareSubs?: boolean;
  shareClient?: boolean;
  sharePrivate?: boolean;
}

// Daily log revision history item
export interface DailyLogRevision {
  id: string;
  revisionNumber: number;
  editedAt: string;
  editedBy: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  changes: Record<string, any>;
  previousValues: Record<string, any>;
}
