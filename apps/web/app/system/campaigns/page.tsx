"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MultiSelectInviteModal from "../cam-dashboard/MultiSelectInviteModal";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
}
function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers as Record<string, string>) } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `API ${res.status}`);
  }
  return res.json();
}

function timeAgo(d: string | Date) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface CndaTemplate {
  id: string;
  name: string;
  isDefault: boolean;
}

interface CampaignDoc {
  id: string;
  systemDocumentId: string;
  code: string;
  title: string;
  sortOrder: number;
}

interface Campaign {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  cndaTemplate: { id: string; name: string };
  questionnaireEnabled: boolean;
  documentCount: number;
  documents: CampaignDoc[];
  inviteCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SystemDoc {
  id: string;
  code: string;
  title: string;
  category: string | null;
}

interface AnalyticsData {
  campaign: { id: string; name: string; slug: string; status: string };
  funnel: { totalTokens: number; opened: number; cndaAccepted: number; questionnaireCompleted: number; contentViewed: number };
  visitors: { tokenId: string; name: string | null; email: string | null; viewCount: number; firstVisit: string | null; lastVisit: string | null; cndaAccepted: boolean; questionnaireCompleted: boolean; accessGranted: boolean; status: string; createdAt: string }[];
  recentActivity: { type: string; name: string; createdAt: string; serialNumber: string | null }[];
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  DRAFT: { bg: "#f3f4f6", fg: "#6b7280", label: "Draft" },
  ACTIVE: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  PAUSED: { bg: "#fef3c7", fg: "#92400e", label: "Paused" },
  ARCHIVED: { bg: "#e5e7eb", fg: "#374151", label: "Archived" },
};

const VISITOR_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  viewing: { bg: "#dcfce7", fg: "#166534" },
  cnda_accepted: { bg: "#fef3c7", fg: "#92400e" },
  opened: { bg: "#dbeafe", fg: "#1e40af" },
  pending: { bg: "#f3f4f6", fg: "#6b7280" },
};

/* ═══════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

export default function CampaignsPage() {
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals / detail
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(() => searchParams.get("detail"));
  const initialTab = (searchParams.get("tab") as DetailTab) || undefined;

  const loadCampaigns = useCallback(async () => {
    try {
      const data = await api<Campaign[]>("/campaigns");
      setCampaigns(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, []);

  const handleStatusChange = useCallback(async (id: string, action: string) => {
    try {
      await api(`/campaigns/${id}/${action}`, { method: "POST" });
      await loadCampaigns();
    } catch (e: any) {
      alert(e.message);
    }
  }, [loadCampaigns]);

  if (detailId) {
    return (
      <CampaignDetail
        id={detailId}
        initialTab={initialTab}
        onBack={() => { setDetailId(null); loadCampaigns(); }}
      />
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>📋 Campaign Builder</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>Create and manage secure document portal campaigns</p>
        </div>
        <button onClick={() => { setEditingId(null); setShowCreate(true); }} style={btnPrimary}>
          + New Campaign
        </button>
      </div>

      {error && <div style={{ padding: 12, background: "#fef2f2", color: "#991b1b", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>⚠ {error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 15 }}>No campaigns yet. Create your first one to start sharing secure documents.</p>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Campaign", "Status", "Documents", "Invites", "Created", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb", color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const st = STATUS_COLORS[c.status] || STATUS_COLORS.DRAFT;
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => setDetailId(c.id)} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{c.slug}</div>
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: st.bg, color: st.fg }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.documentCount}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.inviteCount}</td>
                    <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 12 }}>{timeAgo(c.createdAt)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setEditingId(c.id); setShowCreate(true); }} style={btnSmall}>Edit</button>
                        {c.status === "DRAFT" && <button onClick={() => handleStatusChange(c.id, "activate")} style={{ ...btnSmall, background: "#059669", color: "#fff" }}>Activate</button>}
                        {c.status === "ACTIVE" && <button onClick={() => handleStatusChange(c.id, "pause")} style={{ ...btnSmall, background: "#f59e0b", color: "#fff" }}>Pause</button>}
                        {c.status === "PAUSED" && <button onClick={() => handleStatusChange(c.id, "activate")} style={{ ...btnSmall, background: "#059669", color: "#fff" }}>Resume</button>}
                        {(c.status === "DRAFT" || c.status === "PAUSED") && <button onClick={() => handleStatusChange(c.id, "archive")} style={{ ...btnSmall, color: "#991b1b" }}>Archive</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showCreate && (
        <CampaignModal
          editId={editingId}
          onClose={() => { setShowCreate(false); setEditingId(null); }}
          onSaved={() => { setShowCreate(false); setEditingId(null); loadCampaigns(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  CAMPAIGN DETAIL — Tabs: Overview / Documents / Invites / Analytics   */
/* ═══════════════════════════════════════════════════════════════════════ */

type DetailTab = "overview" | "documents" | "invites" | "analytics";

function CampaignDetail({ id, initialTab, onBack }: { id: string; initialTab?: DetailTab; onBack: () => void }) {
  const [campaign, setCampaign] = useState<any>(null);
  const [tab, setTab] = useState<DetailTab>(initialTab || "overview");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api(`/campaigns/${id}`);
      setCampaign(data);
    } catch {} finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>;
  if (!campaign) return <div style={{ padding: 40, textAlign: "center", color: "#991b1b" }}>Campaign not found</div>;

  const st = STATUS_COLORS[campaign.status] || STATUS_COLORS.DRAFT;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#2563eb", marginBottom: 12, padding: 0 }}>
        ← Back to campaigns
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{campaign.name}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>{campaign.slug}</span>
            <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: st.bg, color: st.fg }}>{st.label}</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>CNDA: {campaign.cndaTemplate?.name}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e5e7eb" }}>
        {([
          ["overview", "📋 Overview"],
          ["documents", "📄 Documents"],
          ["invites", "📨 Invites"],
          ["analytics", "📊 Analytics"],
        ] as [DetailTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600, border: "none",
              borderBottom: tab === key ? "2px solid #0f172a" : "2px solid transparent",
              marginBottom: -2, background: "none",
              color: tab === key ? "#0f172a" : "#6b7280", cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab campaign={campaign} />}
      {tab === "documents" && <DocumentsTab campaignId={id} onUpdate={load} />}
      {tab === "invites" && <InvitesTab campaignId={id} campaignName={campaign.name} campaignStatus={campaign.status} />}
      {tab === "analytics" && <AnalyticsTab campaignId={id} />}
    </div>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────────────────── */

function OverviewTab({ campaign }: { campaign: any }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Description</div>
        <div style={{ fontSize: 14, color: "#0f172a" }}>{campaign.description || "No description"}</div>
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Configuration</div>
        <div style={{ fontSize: 13 }}>
          <div>CNDA Template: <strong>{campaign.cndaTemplate?.name}</strong></div>
          <div>Questionnaire: <strong>{campaign.questionnaireEnabled ? "Enabled" : "Disabled"}</strong></div>
          <div>Documents: <strong>{campaign.documents?.length ?? 0}</strong></div>
          <div>Invites: <strong>{campaign._count?.shareTokens ?? 0}</strong></div>
        </div>
      </div>
    </div>
  );
}

/* ─── Documents Tab ───────────────────────────────────────────────────── */

function DocumentsTab({ campaignId, onUpdate }: { campaignId: string; onUpdate: () => void }) {
  const [docs, setDocs] = useState<CampaignDoc[]>([]);
  const [systemDocs, setSystemDocs] = useState<SystemDoc[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const campaign = await api<any>(`/campaigns/${campaignId}`);
      setDocs(campaign.documents?.map((d: any) => ({
        id: d.id,
        systemDocumentId: d.systemDocumentId ?? d.systemDocument?.id,
        code: d.systemDocument?.code ?? d.code ?? "",
        title: d.systemDocument?.title ?? d.title ?? "",
        sortOrder: d.sortOrder,
      })) ?? []);
    } catch {} finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { load(); }, []);

  const handleAdd = useCallback(async (systemDocId: string) => {
    try {
      await api(`/campaigns/${campaignId}/documents`, {
        method: "POST",
        body: JSON.stringify({ systemDocumentId: systemDocId }),
      });
      await load();
      onUpdate();
    } catch (e: any) {
      alert(e.message);
    }
  }, [campaignId, load, onUpdate]);

  const handleRemove = useCallback(async (docId: string) => {
    if (!confirm("Remove this document from the campaign?")) return;
    try {
      await api(`/campaigns/${campaignId}/documents/${docId}`, { method: "DELETE" });
      await load();
      onUpdate();
    } catch (e: any) {
      alert(e.message);
    }
  }, [campaignId, load, onUpdate]);

  const loadSystemDocs = useCallback(async () => {
    try {
      const data = await api<SystemDoc[]>("/system-documents");
      setSystemDocs(data);
    } catch {}
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{docs.length} document{docs.length !== 1 ? "s" : ""}</div>
        <button
          onClick={() => { loadSystemDocs(); setShowPicker(true); }}
          style={btnPrimary}
        >
          + Add Document
        </button>
      </div>

      {docs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          No documents attached. Add system documents to this campaign.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {docs.map((doc, i) => (
            <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < docs.length - 1 ? "1px solid #f3f4f6" : "none" }}>
              <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 700, width: 24, textAlign: "center" }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{doc.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{doc.code}</div>
              </div>
              <button onClick={() => handleRemove(doc.id)} style={{ ...btnSmall, color: "#991b1b" }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Document Picker Modal */}
      {showPicker && (
        <ModalOverlay onClose={() => setShowPicker(false)}>
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Add Document</h2>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {systemDocs.length === 0 ? (
              <div style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>Loading documents...</div>
            ) : (
              systemDocs.filter((sd) => !docs.some((d) => d.systemDocumentId === sd.id)).map((sd) => (
                <div key={sd.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{sd.title}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{sd.code} {sd.category ? `· ${sd.category}` : ""}</div>
                  </div>
                  <button onClick={() => { handleAdd(sd.id); setShowPicker(false); }} style={{ ...btnSmall, background: "#059669", color: "#fff" }}>Add</button>
                </div>
              ))
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ─── Invites Tab ─────────────────────────────────────────────────────── */

function InvitesTab({ campaignId, campaignName, campaignStatus }: { campaignId: string; campaignName: string; campaignStatus: string }) {
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invMessage, setInvMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [showMultiInvite, setShowMultiInvite] = useState(false);

  const loadInvitees = useCallback(async () => {
    try {
      const data = await api<AnalyticsData>(`/campaigns/${campaignId}/analytics`);
      setAnalytics(data);
    } catch {}
  }, [campaignId]);

  useEffect(() => { loadInvitees(); }, []);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invEmail.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const data = await api(`/campaigns/${campaignId}/invite`, {
        method: "POST",
        body: JSON.stringify({
          inviteeEmail: invEmail.trim(),
          inviteeName: invName.trim() || undefined,
          message: invMessage.trim() || undefined,
        }),
      });
      setResult({ success: true, message: `Invite sent to ${data.inviteeEmail}! Link: ${data.shareUrl}` });
      setInvEmail("");
      setInvName("");
      await loadInvitees();
    } catch (e: any) {
      setResult({ success: false, message: e.message });
    } finally {
      setSending(false);
    }
  }, [campaignId, invEmail, invName, invMessage, loadInvitees]);

  const isActive = campaignStatus === "ACTIVE";

  return (
    <div>
      {/* Multi-Select Invite button */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => setShowMultiInvite(true)}
          disabled={!isActive}
          style={{
            ...btnPrimary,
            opacity: isActive ? 1 : 0.5,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          📨 Multi-Select Invite
        </button>
        {!isActive && (
          <span style={{ fontSize: 12, color: "#92400e", alignSelf: "center" }}>
            Activate campaign to send invites
          </span>
        )}
      </div>

      {showMultiInvite && (
        <MultiSelectInviteModal
          mode="campaign"
          campaignId={campaignId}
          campaignName={campaignName}
          onClose={() => setShowMultiInvite(false)}
          onComplete={() => { setShowMultiInvite(false); loadInvitees(); }}
        />
      )}

      {/* Send invite form */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Quick Single Invite</h3>
        {!isActive && (
          <div style={{ padding: 10, background: "#fef3c7", borderRadius: 6, marginBottom: 12, fontSize: 13, color: "#92400e" }}>
            ⚠ Campaign must be ACTIVE to send invites. Current status: {campaignStatus}
          </div>
        )}

        {result && (
          <div style={{ padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13, background: result.success ? "#ecfdf5" : "#fef2f2", color: result.success ? "#065f46" : "#991b1b", border: `1px solid ${result.success ? "#a7f3d0" : "#fecaca"}` }}>
            {result.success ? "✅" : "⚠"} {result.message}
          </div>
        )}

        <form onSubmit={handleSend}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required style={inputStyle} placeholder="jane@company.com" disabled={!isActive} />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" value={invName} onChange={(e) => setInvName(e.target.value)} style={inputStyle} placeholder="Jane Smith" disabled={!isActive} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Personal Message (optional)</label>
            <textarea value={invMessage} onChange={(e) => setInvMessage(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Hey Jane, take a look at this..." disabled={!isActive} />
          </div>
          <button type="submit" disabled={!isActive || !invEmail.trim() || sending} style={{ ...btnPrimary, opacity: !isActive || !invEmail.trim() ? 0.5 : 1 }}>
            {sending ? "Sending..." : "Send Invite"}
          </button>
        </form>
      </div>

      {/* Invitees list */}
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Invitees ({analytics?.visitors.length ?? 0})</h3>
      {(!analytics || analytics.visitors.length === 0) ? (
        <div style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>No invitees yet.</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Name", "Email", "Views", "Status", "Invited"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analytics.visitors.map((v) => {
                const sc = VISITOR_STATUS_COLORS[v.status] || VISITOR_STATUS_COLORS.pending;
                return (
                  <tr key={v.tokenId}>
                    <td style={tdStyle}>{v.name || "—"}</td>
                    <td style={tdStyle}>{v.email || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{v.viewCount}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                        {v.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>{timeAgo(v.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Analytics Tab ───────────────────────────────────────────────────── */

function AnalyticsTab({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AnalyticsData>(`/campaigns/${campaignId}/analytics`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading analytics...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#991b1b" }}>Failed to load analytics</div>;

  const f = data.funnel;

  return (
    <div>
      {/* Funnel */}
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Conversion Funnel</h3>
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          ["Tokens Created", f.totalTokens, "#6366f1"],
          ["Opened", f.opened, "#0ea5e9"],
          ["CNDA Accepted", f.cndaAccepted, "#f59e0b"],
          ["Questionnaire", f.questionnaireCompleted, "#10b981"],
          ["Viewing", f.contentViewed, "#059669"],
        ].map(([label, val, color]) => (
          <div key={label as string} style={{ flex: 1, padding: 14, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{label as string}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: color as string }}>{val as number}</div>
          </div>
        ))}
      </div>

      {/* Visitors */}
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Visitors ({data.visitors.length})</h3>
      {data.visitors.length === 0 ? (
        <div style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>No visitors yet</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "auto", marginBottom: 24, maxHeight: 350 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Name", "Email", "Views", "First Visit", "Last Visit", "Status"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.visitors.map((v) => {
                const sc = VISITOR_STATUS_COLORS[v.status] || VISITOR_STATUS_COLORS.pending;
                return (
                  <tr key={v.tokenId}>
                    <td style={tdStyle}>{v.name || "—"}</td>
                    <td style={tdStyle}>{v.email || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: v.viewCount >= 3 ? "#059669" : "#0f172a" }}>{v.viewCount}</td>
                    <td style={tdStyle}>{v.firstVisit ? timeAgo(v.firstVisit) : "—"}</td>
                    <td style={tdStyle}>{v.lastVisit ? timeAgo(v.lastVisit) : "—"}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.fg }}>
                        {v.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Activity */}
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Recent Activity</h3>
      <div style={{ ...cardStyle, maxHeight: 300, overflow: "auto", padding: 12 }}>
        {data.recentActivity.length === 0 ? (
          <div style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>No activity yet</div>
        ) : (
          data.recentActivity.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: i < data.recentActivity.length - 1 ? "1px solid #f3f4f6" : "none", fontSize: 12 }}>
              <ActivityIcon type={a.type} />
              <span style={{ flex: 1 }}><strong>{a.name}</strong> — {a.type.replace(/_/g, " ").toLowerCase()}</span>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>{timeAgo(a.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    VIEW: "👁", CNDA_ACCEPT: "✍️", QUESTIONNAIRE_COMPLETE: "📝",
    CONTENT_VIEW: "📖", RETURN_VISIT: "🔄", IDENTITY_VERIFY: "🔐",
  };
  return <span style={{ fontSize: 14 }}>{icons[type] || "📌"}</span>;
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  CREATE / EDIT MODAL                                                   */
/* ═══════════════════════════════════════════════════════════════════════ */

function CampaignModal({ editId, onClose, onSaved }: { editId: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [cndaTemplateId, setCndaTemplateId] = useState("");
  const [questionnaireEnabled, setQuestionnaireEnabled] = useState(true);
  const [templates, setTemplates] = useState<CndaTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load CNDA templates
  useEffect(() => {
    api<CndaTemplate[]>("/cnda-templates").then((data) => {
      setTemplates(data);
      if (!editId && data.length > 0) {
        const def = data.find((t) => t.isDefault) || data[0];
        setCndaTemplateId(def.id);
      }
    }).catch(() => {});
  }, []);

  // Load existing campaign for edit
  useEffect(() => {
    if (!editId) return;
    api(`/campaigns/${editId}`).then((c: any) => {
      setName(c.name);
      setSlug(c.slug);
      setDescription(c.description || "");
      setCndaTemplateId(c.cndaTemplateId || c.cndaTemplate?.id || "");
      setQuestionnaireEnabled(c.questionnaireEnabled);
    }).catch(() => {});
  }, [editId]);

  // Auto-generate slug from name
  const handleNameChange = (v: string) => {
    setName(v);
    if (!editId) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !cndaTemplateId) return;
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await api(`/campaigns/${editId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined, cndaTemplateId, questionnaireEnabled }),
        });
      } else {
        await api("/campaigns", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined, cndaTemplateId, questionnaireEnabled }),
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>{editId ? "Edit Campaign" : "New Campaign"}</h2>

      {error && <div style={{ padding: 10, background: "#fef2f2", color: "#991b1b", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>⚠ {error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Campaign Name *</label>
          <input type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} required style={inputStyle} placeholder="Q2 Investor Deck" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>URL Slug *</label>
          <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} required style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} placeholder="q2-investor-deck" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Brief description of this campaign" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>CNDA Template *</label>
          <select value={cndaTemplateId} onChange={(e) => setCndaTemplateId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">Select template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={questionnaireEnabled} onChange={(e) => setQuestionnaireEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: 13, color: "#374151" }}>Require questionnaire before access</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button type="submit" disabled={!name.trim() || !slug.trim() || !cndaTemplateId || saving} style={{ flex: 2, ...btnPrimary, opacity: !name.trim() || !slug.trim() || !cndaTemplateId ? 0.5 : 1 }}>
            {saving ? "Saving..." : editId ? "Save Changes" : "Create Campaign"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  SHARED COMPONENTS                                                     */
/* ═══════════════════════════════════════════════════════════════════════ */

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "90vh", overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f3f4f6",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 6,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  color: "#374151",
};
