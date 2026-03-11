import { apiJson } from "./client";

export interface SendShareInviteDto {
  recipientEmail: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryMethods: Array<"email" | "sms">;
  message?: string;
}

export interface ShareInviteResult {
  token: string;
  shareUrl: string;
  recipientEmail: string;
  recipientName: string | null;
  delivery: Record<string, { sent: boolean; error?: string }>;
}

export interface MyShareInvite {
  id: string;
  type: "cam_library" | "master_class";
  recipientEmail: string | null;
  recipientName: string | null;
  viewCount: number;
  status: "pending" | "opened" | "cnda_accepted" | "viewing";
  createdAt: string;
}

export function sendCamInvite(dto: SendShareInviteDto) {
  return apiJson<ShareInviteResult>("/share-invite/cam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
}

export function sendMasterClassInvite(dto: SendShareInviteDto) {
  return apiJson<ShareInviteResult>("/share-invite/master-class", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
}

export interface BulkShareInviteDto {
  recipients: Array<{ email: string; name?: string; phone?: string }>;
  deliveryMethods: Array<"email" | "sms">;
  message?: string;
  inviteType?: "cam" | "master_class";
}

export interface BulkShareInviteResult {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    email: string;
    name?: string;
    success: boolean;
    shareUrl?: string;
    error?: string;
  }>;
}

export function sendBulkShareInvites(dto: BulkShareInviteDto) {
  return apiJson<BulkShareInviteResult>("/share-invite/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
}

export function fetchMyShareInvites() {
  return apiJson<MyShareInvite[]>("/share-invite/my-invites");
}
