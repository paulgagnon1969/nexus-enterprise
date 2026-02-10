/**
 * Claim Journal types for the frontend
 */

export type ClaimJournalEntryType =
  | "SUBMISSION"
  | "RESPONSE"
  | "CALL"
  | "EMAIL"
  | "MEETING"
  | "NOTE"
  | "APPROVAL"
  | "DENIAL"
  | "PARTIAL_APPROVAL";

export type ClaimJournalDirection = "INBOUND" | "OUTBOUND" | "INTERNAL";

export interface CarrierContact {
  id: string;
  companyId: string;
  carrierName: string;
  contactName: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimJournalAttachment {
  id: string;
  journalEntryId: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  storageKey: string;
  storageUrl: string | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface ClaimJournalEntry {
  id: string;
  projectId: string;
  entryType: ClaimJournalEntryType;
  direction: ClaimJournalDirection;
  carrierContactId: string | null;
  carrierContact?: CarrierContact | null;
  actorNameOverride: string | null;
  actorOrgOverride: string | null;
  occurredAt: string;
  summary: string;
  details: string | null;
  disputedAmount: number | null;
  approvedAmount: number | null;
  deniedAmount: number | null;
  tags: string[];
  correctsEntryId: string | null;
  correctsEntry?: ClaimJournalEntry | null;
  correctedByEntries?: ClaimJournalEntry[];
  attachments?: ClaimJournalAttachment[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJournalEntryDto {
  entryType: ClaimJournalEntryType;
  direction: ClaimJournalDirection;
  carrierContactId?: string | null;
  actorNameOverride?: string | null;
  actorOrgOverride?: string | null;
  occurredAt: string;
  summary: string;
  details?: string | null;
  disputedAmount?: number | null;
  approvedAmount?: number | null;
  deniedAmount?: number | null;
  tags?: string[];
}

export interface CreateCarrierContactDto {
  carrierName: string;
  contactName?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export const ENTRY_TYPE_LABELS: Record<ClaimJournalEntryType, string> = {
  SUBMISSION: "Submission",
  RESPONSE: "Response",
  CALL: "Phone Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Internal Note",
  APPROVAL: "Approval",
  DENIAL: "Denial",
  PARTIAL_APPROVAL: "Partial Approval",
};

export const DIRECTION_LABELS: Record<ClaimJournalDirection, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  INTERNAL: "Internal",
};

export const ENTRY_TYPE_ICONS: Record<ClaimJournalEntryType, string> = {
  SUBMISSION: "📤",
  RESPONSE: "📥",
  CALL: "📞",
  EMAIL: "✉️",
  MEETING: "🤝",
  NOTE: "📝",
  APPROVAL: "✅",
  DENIAL: "❌",
  PARTIAL_APPROVAL: "⚠️",
};
