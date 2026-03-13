"use client";

import { useCallback, useEffect, useState } from "react";
import DOMPurify from "dompurify";
import MultiSelectInviteModal from "./MultiSelectInviteModal";

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
  if (!res.ok) throw new Error(`API ${res.status}`);
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

function sanitize(html: string) {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, { FORBID_TAGS: ["script", "iframe"], FORBID_ATTR: ["onerror", "onload"] });
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

type Tab = "analytics" | "handbook" | "discussion" | "invites";

export default function CamDashboardPage() {
  const [tab, setTab] = useState<Tab>("analytics");

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>🏆 CAM Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>Manage CAM sharing, analytics, discussion, and invites</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 }}>
        {([
          ["analytics", "📊 Analytics"],
          ["handbook", "📖 Handbook"],
          ["discussion", "💬 Discussion"],
          ["invites", "📨 Invites"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderBottom: tab === key ? "2px solid #0f172a" : "2px solid transparent",
              marginBottom: -2,
              background: "none",
              color: tab === key ? "#0f172a" : "#6b7280",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "analytics" && <AnalyticsTab />}
      {tab === "handbook" && <HandbookTab />}
      {tab === "discussion" && <DiscussionTab />}
      {tab === "invites" && <InvitesTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  TAB: ANALYTICS                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [tree, setTree] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api("/cam-dashboard/analytics"), api("/cam-dashboard/referral-tree")])
      .then(([a, t]) => { setData(a); setTree(t); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!data) return <Err msg="Failed to load analytics" />;

  const f = data.funnel;

  return (
    <div>
      {/* Funnel */}
      <SectionTitle>Conversion Funnel</SectionTitle>
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

      {/* Referral Tree Summary */}
      {tree && (
        <>
          <SectionTitle>Referral Network</SectionTitle>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <MiniStat label="Total Shares" value={tree.totalTokens} />
            <MiniStat label="Max Chain Depth" value={tree.maxDepth} />
            <MiniStat label="Viral Coefficient" value={tree.viralCoefficient} />
          </div>
          {tree.tree.length > 0 && (
            <div style={{ ...cardStyle, maxHeight: 400, overflow: "auto", padding: 16 }}>
              {tree.tree.map((node: any) => (
                <ReferralNode key={node.id} node={node} depth={0} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Repeat Visitors */}
      <SectionTitle>Repeat Visitors ({data.visitors.length})</SectionTitle>
      {data.visitors.length === 0 ? (
        <EmptyState msg="No visitors yet" />
      ) : (
        <div style={{ ...cardStyle, overflow: "auto", maxHeight: 350 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Name", "Email", "Views", "First Visit", "Last Visit", "Status"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.visitors.map((v: any, i: number) => (
                <tr key={i}>
                  <td style={tdStyle}>{v.name || "—"}</td>
                  <td style={tdStyle}>{v.email || "—"}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: v.viewCount >= 3 ? "#059669" : "#0f172a" }}>{v.viewCount}</td>
                  <td style={tdStyle}>{v.firstVisit ? timeAgo(v.firstVisit) : "—"}</td>
                  <td style={tdStyle}>{v.lastVisit ? timeAgo(v.lastVisit) : "—"}</td>
                  <td style={tdStyle}><StatusBadge granted={v.accessGranted} cnda={v.cndaAccepted} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity Timeline */}
      <SectionTitle>Recent Activity</SectionTitle>
      <div style={{ ...cardStyle, maxHeight: 300, overflow: "auto", padding: 12 }}>
        {data.recentActivity.length === 0 ? (
          <EmptyState msg="No recent activity" />
        ) : (
          data.recentActivity.slice(0, 50).map((a: any, i: number) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: i < 49 ? "1px solid #f3f4f6" : "none", fontSize: 12 }}>
              <ActivityIcon type={a.type} />
              <span style={{ flex: 1 }}><strong>{a.name || "Unknown"}</strong> — {a.type.replace(/_/g, " ").toLowerCase()}</span>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>{timeAgo(a.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReferralNode({ node, depth }: { node: any; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;
  const statusColors: Record<string, string> = { viewing: "#059669", cnda_accepted: "#f59e0b", opened: "#0ea5e9", pending: "#9ca3af" };
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, cursor: hasChildren ? "pointer" : "default" }}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? <span style={{ fontSize: 10, width: 14 }}>{open ? "▾" : "▸"}</span> : <span style={{ width: 14 }} />}
        <span style={{ fontWeight: 600 }}>{node.inviteeName || node.inviteeEmail || node.inviterName}</span>
        <span style={{ color: "#9ca3af" }}>→ {node.inviteeEmail || "pending"}</span>
        <span style={{ padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: `${statusColors[node.gateStatus] || "#9ca3af"}20`, color: statusColors[node.gateStatus] || "#9ca3af" }}>
          {node.gateStatus}
        </span>
        {node.viewCount > 1 && <span style={{ fontSize: 10, color: "#059669" }}>({node.viewCount} views)</span>}
      </div>
      {open && hasChildren && node.children.map((c: any) => <ReferralNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  TAB: HANDBOOK                                                     */
/* ═══════════════════════════════════════════════════════════════════ */

function HandbookTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api("/cam-dashboard/handbook").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!data) return <Err msg="Failed to load handbook" />;

  const toggleModule = (mode: string) => {
    const next = new Set(expanded);
    next.has(mode) ? next.delete(mode) : next.add(mode);
    setExpanded(next);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setExpanded(new Set(data.modules.map((m: any) => m.mode)))} style={btnStyle}>Expand All</button>
        <button onClick={() => setExpanded(new Set())} style={btnStyle}>Collapse All</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>
          {data.totalCams} CAMs · Avg {data.overallAvgScore}/40
        </div>
      </div>

      {data.modules.map((mod: any) => (
        <div key={mod.mode} style={{ ...cardStyle, marginBottom: 12, padding: 0, overflow: "hidden" }}>
          <button
            onClick={() => toggleModule(mod.mode)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "none", background: "#f9fafb", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.modeLabel} <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 400 }}>({mod.camCount} CAMs · {mod.aggregateScore}/40)</span></span>
            <span style={{ color: "#9ca3af" }}>{expanded.has(mod.mode) ? "▾" : "▸"}</span>
          </button>
          {expanded.has(mod.mode) && (
            <div style={{ padding: "0 16px 16px" }}>
              {mod.cams.map((cam: any) => (
                <div key={cam.code} style={{ borderTop: "1px solid #f3f4f6", padding: "14px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{cam.title}</span>
                      <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 8 }}>{cam.code}</span>
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: cam.scores.total >= 30 ? "#ecfdf5" : "#f9fafb", color: cam.scores.total >= 30 ? "#059669" : "#6b7280" }}>
                      {cam.scores.total}/40
                    </span>
                  </div>
                  {cam.htmlBody && (
                    <div className="cam-content" style={{ fontSize: 13, lineHeight: 1.7, color: "#374151" }} dangerouslySetInnerHTML={{ __html: sanitize(cam.htmlBody) }} />
                  )}
                  {cam.htmlContent && !cam.htmlBody && (
                    <div className="cam-content" style={{ fontSize: 13, lineHeight: 1.7, color: "#374151" }} dangerouslySetInnerHTML={{ __html: sanitize(cam.htmlContent) }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  TAB: DISCUSSION                                                   */
/* ═══════════════════════════════════════════════════════════════════ */

function DiscussionTab() {
  const [topics, setTopics] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<any>(null);
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadBody, setNewThreadBody] = useState("");
  const [newThreadTopic, setNewThreadTopic] = useState("");
  const [newThreadVis, setNewThreadVis] = useState<string>("PUBLIC");
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    Promise.all([api("/cam-dashboard/topics"), api("/cam-dashboard/threads")])
      .then(([t, th]) => { setTopics(t); setThreads(th); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMessages = useCallback((threadId: string) => {
    setSelectedThread(threadId);
    api(`/cam-dashboard/threads/${threadId}/messages`).then(setMessages).catch(() => {});
  }, []);

  const handleCreateTopic = async () => {
    if (!newTopicTitle.trim()) return;
    await api("/cam-dashboard/topics", { method: "POST", body: JSON.stringify({ title: newTopicTitle.trim() }) });
    setNewTopicTitle("");
    setNewTopicOpen(false);
    loadData();
  };

  const handleCreateThread = async () => {
    if (!newThreadTitle.trim() || !newThreadBody.trim()) return;
    await api("/cam-dashboard/threads", {
      method: "POST",
      body: JSON.stringify({ title: newThreadTitle.trim(), body: newThreadBody.trim(), topicId: newThreadTopic || undefined, visibility: newThreadVis }),
    });
    setNewThreadTitle("");
    setNewThreadBody("");
    setNewThreadOpen(false);
    loadData();
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !selectedThread) return;
    await api(`/cam-dashboard/threads/${selectedThread}/messages`, { method: "POST", body: JSON.stringify({ body: replyBody.trim() }) });
    setReplyBody("");
    loadMessages(selectedThread);
  };

  const handleToggleFaq = async (threadId: string, current: boolean) => {
    await api(`/cam-dashboard/threads/${threadId}`, { method: "PATCH", body: JSON.stringify({ isFaq: !current }) });
    loadData();
  };

  const handleTogglePin = async (threadId: string, current: boolean) => {
    await api(`/cam-dashboard/threads/${threadId}`, { method: "PATCH", body: JSON.stringify({ isPinned: !current }) });
    loadData();
  };

  if (loading) return <Loader />;

  return (
    <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
      {/* Left: Topics + Thread list */}
      <div style={{ width: 380, flexShrink: 0 }}>
        {/* Topics */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Topics</span>
          <button onClick={() => setNewTopicOpen(!newTopicOpen)} style={{ ...btnSmall, background: "#0f172a", color: "#fff" }}>+ Topic</button>
        </div>
        {newTopicOpen && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} placeholder="Topic name..." style={inputSm} />
            <button onClick={handleCreateTopic} style={{ ...btnSmall, background: "#059669", color: "#fff" }}>Add</button>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {topics.map((t: any) => (
            <span key={t.id} style={{ padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500, background: "#f3f4f6", color: "#374151" }}>
              {t.title} ({t.threadCount})
            </span>
          ))}
          {topics.length === 0 && <span style={{ fontSize: 11, color: "#9ca3af" }}>No topics yet</span>}
        </div>

        {/* New Thread */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Threads ({threads.length})</span>
          <button onClick={() => setNewThreadOpen(!newThreadOpen)} style={{ ...btnSmall, background: "#2563eb", color: "#fff" }}>+ Thread</button>
        </div>
        {newThreadOpen && (
          <div style={{ ...cardStyle, padding: 12, marginBottom: 10 }}>
            <input value={newThreadTitle} onChange={(e) => setNewThreadTitle(e.target.value)} placeholder="Thread title..." style={{ ...inputSm, width: "100%", marginBottom: 6 }} />
            <textarea value={newThreadBody} onChange={(e) => setNewThreadBody(e.target.value)} placeholder="First message..." rows={2} style={{ ...inputSm, width: "100%", resize: "vertical", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <select value={newThreadTopic} onChange={(e) => setNewThreadTopic(e.target.value)} style={{ ...inputSm, flex: 1 }}>
                <option value="">No topic</option>
                {topics.map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <select value={newThreadVis} onChange={(e) => setNewThreadVis(e.target.value)} style={{ ...inputSm, width: 100 }}>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
                <option value="NOTE">Note</option>
              </select>
            </div>
            <button onClick={handleCreateThread} style={{ ...btnSmall, background: "#2563eb", color: "#fff", width: "100%" }}>Create Thread</button>
          </div>
        )}

        {/* Thread list */}
        <div style={{ maxHeight: 400, overflow: "auto" }}>
          {threads.map((t: any) => (
            <div
              key={t.id}
              onClick={() => loadMessages(t.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                marginBottom: 4,
                cursor: "pointer",
                background: selectedThread === t.id ? "#eff6ff" : "#fff",
                border: `1px solid ${selectedThread === t.id ? "#bfdbfe" : "#f3f4f6"}`,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {t.isPinned && <span style={{ fontSize: 10 }}>📌</span>}
                {t.isFaq && <span style={{ fontSize: 10 }}>❓</span>}
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{t.title}</span>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>{t.messageCount}</span>
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                {t.createdBy.name} · {timeAgo(t.updatedAt)}
                {t.topicTitle && <> · <span style={{ color: "#6366f1" }}>{t.topicTitle}</span></>}
                {t.visibility !== "PUBLIC" && <> · <span style={{ color: t.visibility === "NOTE" ? "#b45309" : "#dc2626" }}>{t.visibility}</span></>}
              </div>
            </div>
          ))}
          {threads.length === 0 && <EmptyState msg="No threads yet — start a discussion!" />}
        </div>
      </div>

      {/* Right: Thread messages */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!messages ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Select a thread to view messages</div>
        ) : (
          <div style={{ ...cardStyle, padding: 0, display: "flex", flexDirection: "column", height: "100%", maxHeight: 600 }}>
            {/* Thread header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{messages.thread.title}</div>
                {messages.thread.camSection && <span style={{ fontSize: 10, color: "#6366f1", fontFamily: "monospace" }}>{messages.thread.camSection}</span>}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => handleTogglePin(messages.thread.id, messages.thread.isPinned)} style={btnSmall}>
                  {messages.thread.isPinned ? "📌 Unpin" : "Pin"}
                </button>
                <button onClick={() => handleToggleFaq(messages.thread.id, messages.thread.isFaq)} style={btnSmall}>
                  {messages.thread.isFaq ? "❓ Un-FAQ" : "FAQ"}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {messages.messages.map((m: any) => (
                <div key={m.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{m.author.name}</span>
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{timeAgo(m.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: "#374151", whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8 }}>
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReply()}
                placeholder="Type a reply..."
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}
              />
              <button onClick={handleReply} disabled={!replyBody.trim()} style={{ ...btnSmall, background: "#0f172a", color: "#fff", padding: "8px 16px" }}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  TAB: INVITES                                                      */
/* ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_BLURB = `Hi {name},

I'd like to personally invite you to review the Nexus Competitive Advantage Modules (CAM) Library — a curated collection of the technologies and operational systems that set Nexus apart in restoration and construction.

This isn't a sales pitch. It's a transparent look at the tools and processes we've built to deliver faster, more accurate, and more accountable project outcomes. I think you'll find it valuable whether you're evaluating partners, exploring technology, or just curious about where the industry is headed.

The process is straightforward:
1. Accept a brief confidentiality agreement (CNDA+)
2. Complete a quick 30-second assessment
3. Access the full CAM Library with interactive discussion

I look forward to your feedback.

— Paul Gagnon, Nexus`;

const BLURB_KEY = "cam-invite-blurb";

function loadBlurb(): string {
  if (typeof window === "undefined") return DEFAULT_BLURB;
  return localStorage.getItem(BLURB_KEY) || DEFAULT_BLURB;
}

function saveBlurb(v: string) {
  if (typeof window !== "undefined") localStorage.setItem(BLURB_KEY, v);
}

interface CsvRow { name: string; email: string; phone: string }

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const emailIdx = header.split(",").findIndex((h) => h.trim().includes("email"));
  const nameIdx = header.split(",").findIndex((h) => h.trim().includes("name"));
  const phoneIdx = header.split(",").findIndex((h) => h.trim().includes("phone"));
  if (emailIdx < 0) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return { email: cols[emailIdx] || "", name: cols[nameIdx] || "", phone: cols[phoneIdx] || "" };
  }).filter((r) => r.email && r.email.includes("@"));
}

function downloadCsvTemplate() {
  const csv = "name,email,phone\nJane Smith,jane@company.com,+15551234567\nJohn Doe,john@example.com,\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cam-invite-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function InvitesTab() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Blurb
  const [blurb, setBlurb] = useState(loadBlurb);
  const [blurbSaved, setBlurbSaved] = useState(true);
  const [blurbEditing, setBlurbEditing] = useState(false);
  // Single invite
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [methods, setMethods] = useState<Set<string>>(new Set(["email"]));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  // Bulk CSV
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  // Shared
  const [copied, setCopied] = useState<string | null>(null);
  const [multiSelectOpen, setMultiSelectOpen] = useState(false);
  // Invite groups
  const [groups, setGroups] = useState<{ id: string; name: string; inviteCount: number; createdAt: string }[]>([]);
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Sort & search
  const [sortCol, setSortCol] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [inviteSearch, setInviteSearch] = useState("");

  const loadInvites = useCallback(() => {
    api("/cam-dashboard/invites").then(setInvites).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadGroups = useCallback(() => {
    api<{ id: string; name: string; inviteCount: number; createdAt: string }[]>("/cam-dashboard/invite-groups")
      .then(setGroups)
      .catch(() => {});
  }, []);

  useEffect(() => { loadInvites(); loadGroups(); }, [loadInvites, loadGroups]);

  const handleRenameGroup = useCallback(async (groupId: string) => {
    if (!renameValue.trim()) return;
    try {
      await api(`/cam-dashboard/invite-groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, name: renameValue.trim() } : g));
      setRenamingGroupId(null);
      setRenameValue("");
    } catch {
      alert("Failed to rename group");
    }
  }, [renameValue]);

  const handleSaveBlurb = () => {
    saveBlurb(blurb);
    setBlurbSaved(true);
    setBlurbEditing(false);
  };

  const handleResetBlurb = () => {
    setBlurb(DEFAULT_BLURB);
    saveBlurb(DEFAULT_BLURB);
    setBlurbSaved(true);
  };

  const toggleMethod = (m: string) => {
    const next = new Set(methods);
    next.has(m) ? next.delete(m) : next.add(m);
    setMethods(next);
  };

  const personalizedBlurb = (recipientName?: string) => {
    return blurb.replace(/\{name\}/gi, recipientName?.split(" ")[0] || "there");
  };

  // Single send
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || methods.size === 0) return;
    setSending(true);
    try {
      const res = await api("/cam-dashboard/invite", {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: email.trim(),
          recipientName: name.trim() || undefined,
          recipientPhone: phone.trim() || undefined,
          deliveryMethods: Array.from(methods),
          message: personalizedBlurb(name.trim()),
        }),
      });
      setResult(res);
      loadInvites();
    } catch {
      alert("Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  // CSV upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      setCsvRows(rows);
      setBulkResult(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const removeCsvRow = (idx: number) => {
    setCsvRows((prev) => prev.filter((_, i) => i !== idx));
  };

  // Bulk send
  const handleBulkSend = async () => {
    if (csvRows.length === 0 || methods.size === 0) return;
    setBulkSending(true);
    try {
      const res = await api("/cam-dashboard/invite/bulk", {
        method: "POST",
        body: JSON.stringify({
          recipients: csvRows.map((r) => ({ email: r.email, name: r.name || undefined, phone: r.phone || undefined })),
          deliveryMethods: Array.from(methods),
          message: blurb,
        }),
      });
      setBulkResult(res);
      loadInvites();
    } catch {
      alert("Bulk send failed");
    } finally {
      setBulkSending(false);
    }
  };

  const handleResend = async (tokenId: string) => {
    await api(`/cam-dashboard/invite/${tokenId}/resend`, { method: "POST" });
    alert("Resent!");
  };

  const handleRescind = async (tokenId: string, recipientEmail: string) => {
    if (!confirm(`Rescind invite for ${recipientEmail || "this recipient"}? They will no longer be able to access the CAM Library.`)) return;
    try {
      await api(`/cam-dashboard/invite/${tokenId}`, { method: "DELETE" });
      loadInvites();
    } catch {
      alert("Failed to rescind invite");
    }
  };

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const resetForm = () => {
    setFormOpen(false);
    setEmail("");
    setName("");
    setPhone("");
    setResult(null);
    setMethods(new Set(["email"]));
  };

  if (loading) return <Loader />;

  // Multi-select invite modal (rendered at InvitesTab level)
  const multiSelectModal = multiSelectOpen ? (
    <MultiSelectInviteModal
      onClose={() => setMultiSelectOpen(false)}
      onComplete={() => { loadInvites(); loadGroups(); }}
    />
  ) : null;

  const statusColors: Record<string, { bg: string; fg: string }> = {
    viewing: { bg: "#dcfce7", fg: "#166534" },
    cnda_accepted: { bg: "#fef3c7", fg: "#92400e" },
    opened: { bg: "#dbeafe", fg: "#1e40af" },
    pending: { bg: "#f3f4f6", fg: "#6b7280" },
    revoked: { bg: "#fee2e2", fg: "#991b1b" },
  };

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "viewCount" ? "desc" : "asc");
    }
  };

  const sortIndicator = (col: string) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const searchTerm = inviteSearch.trim().toLowerCase();

  const filteredInvites = (filterGroupId
    ? invites.filter((inv: any) => inv.groupId === filterGroupId)
    : invites
  ).filter((inv: any) => {
    if (!searchTerm) return true;
    const name = (inv.recipientName || "").toLowerCase();
    const email = (inv.recipientEmail || "").toLowerCase();
    const status = (inv.status || "").toLowerCase();
    const group = (inv.groupId ? (groupMap.get(inv.groupId) || "") : "").toLowerCase();
    return name.includes(searchTerm) || email.includes(searchTerm) || status.includes(searchTerm) || group.includes(searchTerm);
  }).slice().sort((a: any, b: any) => {
    let av: any, bv: any;
    switch (sortCol) {
      case "recipientName": av = (a.recipientName || "").toLowerCase(); bv = (b.recipientName || "").toLowerCase(); break;
      case "recipientEmail": av = (a.recipientEmail || "").toLowerCase(); bv = (b.recipientEmail || "").toLowerCase(); break;
      case "viewCount": av = a.viewCount ?? 0; bv = b.viewCount ?? 0; break;
      case "status": av = a.status || ""; bv = b.status || ""; break;
      case "group": av = (groupMap.get(a.groupId) || "").toLowerCase(); bv = (groupMap.get(b.groupId) || "").toLowerCase(); break;
      case "createdAt": default: av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div>
      {/* ── Invite Blurb ── */}
      <div style={{ ...cardStyle, padding: 20, marginBottom: 20, borderLeft: "4px solid #059669" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>📝 Invite Message</span>
            <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>This message is included with every invite (email &amp; single send). Use <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>{`{name}`}</code> for personalization.</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {!blurbEditing ? (
              <button onClick={() => setBlurbEditing(true)} style={{ ...btnSmall, background: "#2563eb", color: "#fff", border: "none" }}>Edit</button>
            ) : (
              <>
                <button onClick={handleSaveBlurb} style={{ ...btnSmall, background: "#059669", color: "#fff", border: "none" }}>Save</button>
                <button onClick={() => { setBlurb(loadBlurb()); setBlurbEditing(false); }} style={btnSmall}>Cancel</button>
              </>
            )}
            <button onClick={handleResetBlurb} style={btnSmall} title="Reset to default">Reset</button>
          </div>
        </div>
        {blurbEditing ? (
          <textarea
            value={blurb}
            onChange={(e) => { setBlurb(e.target.value); setBlurbSaved(false); }}
            rows={12}
            style={{ width: "100%", padding: 12, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        ) : (
          <div style={{ padding: 14, background: "#f9fafb", borderRadius: 6, fontSize: 13, lineHeight: 1.7, color: "#374151", whiteSpace: "pre-wrap", maxHeight: 280, overflow: "auto" }}>
            {blurb}
          </div>
        )}
        {!blurbSaved && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>Unsaved changes</div>}
      </div>

      {/* ── Actions row ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { setFormOpen(!formOpen); setCsvRows([]); setBulkResult(null); }} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#0f172a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Single Invite
          </button>
          <button onClick={() => setMultiSelectOpen(true)} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            👥 Multi-Select Invite
          </button>
          <button onClick={downloadCsvTemplate} style={{ ...btnStyle, display: "flex", alignItems: "center", gap: 4 }}>
            ⬇ CSV Template
          </button>
          <label style={{ ...btnStyle, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}>
            ⬆ Upload CSV
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Delivery:</span>
          {["email", "sms"].map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={methods.has(m)} onChange={() => toggleMethod(m)} />
              {m === "email" ? "📧 Email" : "📱 Text"}
            </label>
          ))}
        </div>
      </div>

      {/* ── CSV Preview ── */}
      {csvRows.length > 0 && !bulkResult && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#1e40af" }}>📋 CSV Preview — {csvRows.length} recipients</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCsvRows([])} style={btnSmall}>Clear</button>
              <button
                onClick={handleBulkSend}
                disabled={bulkSending || methods.size === 0}
                style={{ ...btnSmall, background: "#059669", color: "#fff", border: "none", padding: "4px 14px", fontWeight: 600, opacity: methods.size === 0 ? 0.5 : 1 }}
              >
                {bulkSending ? "Sending..." : `Send All ${csvRows.length} Invites`}
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 250, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Name", "Email", "Phone", ""].map((h) => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{r.name || "—"}</td>
                    <td style={tdStyle}>{r.email}</td>
                    <td style={tdStyle}>{r.phone || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => removeCsvRow(i)} style={{ ...btnSmall, color: "#dc2626", border: "none", background: "none", fontSize: 13 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bulk Result ── */}
      {bulkResult && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>
            {bulkResult.failed === 0 ? "✅" : "⚠️"} Bulk Send Complete — {bulkResult.sent}/{bulkResult.total} sent
          </h3>
          {bulkResult.failed > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>{bulkResult.failed} failed:</span>
              {bulkResult.results.filter((r: any) => !r.success).map((r: any, i: number) => (
                <div key={i} style={{ fontSize: 11, color: "#dc2626", marginLeft: 12 }}>• {r.email}: {r.error}</div>
              ))}
            </div>
          )}
          <button onClick={() => { setBulkResult(null); setCsvRows([]); }} style={btnSmall}>Dismiss</button>
        </div>
      )}

      {/* ── Single Invite Form ── */}
      {formOpen && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 20 }}>
          {!result ? (
            <form onSubmit={handleSend}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Single Invite</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@company.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone (SMS)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" style={inputStyle} />
                </div>
              </div>
              {name.trim() && (
                <div style={{ padding: 10, background: "#f0fdf4", borderRadius: 6, border: "1px solid #bbf7d0", fontSize: 11, color: "#166534", marginBottom: 12, maxHeight: 100, overflow: "auto", whiteSpace: "pre-wrap" }}>
                  <strong>Preview:</strong> {personalizedBlurb(name.trim()).slice(0, 200)}...
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={resetForm} style={btnStyle}>Cancel</button>
                <button type="submit" disabled={!email.trim() || methods.size === 0 || sending} style={{ ...btnStyle, background: "#0f172a", color: "#fff", border: "none", opacity: !email.trim() || methods.size === 0 ? 0.5 : 1 }}>
                  {sending ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>✅ Invite Sent!</h3>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Link created for <strong>{result.recipientEmail}</strong></p>
              {result.delivery?.email && (
                <p style={{ fontSize: 12 }}>📧 Email: {result.delivery.email.sent ? <span style={{ color: "#059669" }}>Sent ✓</span> : <span style={{ color: "#dc2626" }}>Failed — {result.delivery.email.error}</span>}</p>
              )}
              {result.delivery?.sms && (
                <p style={{ fontSize: 12 }}>📱 SMS: {result.delivery.sms.sent ? <span style={{ color: "#059669" }}>Sent ✓</span> : <span style={{ color: "#dc2626" }}>Failed — {result.delivery.sms.error}</span>}</p>
              )}
              <div style={{ padding: 10, background: "#f1f5f9", borderRadius: 6, fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", marginTop: 8 }}>{result.shareUrl}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={resetForm} style={btnStyle}>Close</button>
                <button onClick={() => handleCopy(result.shareUrl, "new")} style={{ ...btnStyle, background: "#2563eb", color: "#fff", border: "none" }}>
                  {copied === "new" ? "✓ Copied!" : "Copy Link"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invite Groups ── */}
      {groups.length > 0 && (
        <>
          <SectionTitle>📂 Invite Groups ({groups.length})</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {groups.map((g) => {
              const isActive = filterGroupId === g.id;
              return (
                <div
                  key={g.id}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: isActive ? "2px solid #0f172a" : "1px solid #e5e7eb",
                    background: isActive ? "#f0f9ff" : "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    transition: "all 0.15s",
                  }}
                  onClick={() => setFilterGroupId(isActive ? null : g.id)}
                >
                  <div>
                    {renamingGroupId === g.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameGroup(g.id); if (e.key === "Escape") { setRenamingGroupId(null); setRenameValue(""); } }}
                          style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 12, width: 120 }}
                        />
                        <button onClick={() => handleRenameGroup(g.id)} style={{ ...btnSmall, background: "#059669", color: "#fff", border: "none", padding: "2px 8px" }}>✓</button>
                        <button onClick={() => { setRenamingGroupId(null); setRenameValue(""); }} style={{ ...btnSmall, padding: "2px 6px" }}>✕</button>
                      </div>
                    ) : (
                      <span
                        style={{ fontWeight: 600, cursor: "text" }}
                        onDoubleClick={(e) => { e.stopPropagation(); setRenamingGroupId(g.id); setRenameValue(g.name); }}
                        title="Double-click to rename"
                      >
                        {g.name}
                      </span>
                    )}
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      {g.inviteCount} invite{g.inviteCount !== 1 ? "s" : ""} · {timeAgo(g.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Invite History ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SectionTitle>
          Invite History ({filteredInvites.length}{(filterGroupId || searchTerm) ? ` of ${invites.length}` : ""})
        </SectionTitle>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search invitees..."
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
            style={{
              padding: "5px 10px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
              outline: "none",
              width: 200,
            }}
          />
          {inviteSearch && (
            <button
              onClick={() => setInviteSearch("")}
              style={{ ...btnSmall, border: "none", background: "none", fontSize: 14, color: "#9ca3af", padding: "0 4px" }}
            >
              ✕
            </button>
          )}
          {filterGroupId && (
            <button
              onClick={() => setFilterGroupId(null)}
              style={{ ...btnSmall, background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", display: "flex", alignItems: "center", gap: 4 }}
            >
              Group: {groups.find((g) => g.id === filterGroupId)?.name || "..."}
              <span style={{ fontWeight: 700 }}>✕</span>
            </button>
          )}
        </div>
      </div>
      {filteredInvites.length === 0 ? (
        <EmptyState msg={filterGroupId ? "No invites in this group" : "No invites yet — send your first one!"} />
      ) : (
        <div style={{ ...cardStyle, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {[
                  ["Recipient", "recipientName"],
                  ["Email", "recipientEmail"],
                  ["Views", "viewCount"],
                  ["Status", "status"],
                  ["Group", "group"],
                  ["Created", "createdAt"],
                  ["", ""],
                ].map(([label, col]) => (
                  <th
                    key={label + col}
                    onClick={() => col && toggleSort(col)}
                    style={{
                      padding: "8px 10px",
                      textAlign: "left",
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 600,
                      cursor: col ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}{sortIndicator(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInvites.map((inv: any) => {
                const sc = statusColors[inv.status] || statusColors.pending;
                const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || "https://staging-ncc.nfsgrp.com";
                const url = `${baseUrl}/cam-access/${inv.token}`;
                const gName = inv.groupId ? groupMap.get(inv.groupId) : null;
                return (
                  <tr key={inv.id}>
                    <td style={tdStyle}>{inv.recipientName || "—"}</td>
                    <td style={tdStyle}>{inv.recipientEmail || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{inv.viewCount}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.fg }}>{inv.status}</span>
                    </td>
                    <td style={tdStyle}>
                      {gName ? (
                        <span
                          style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: "#eff6ff", color: "#1e40af", cursor: "pointer" }}
                          onClick={() => setFilterGroupId(inv.groupId)}
                        >
                          {gName}
                        </span>
                      ) : (
                        <span style={{ color: "#d1d5db" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>{timeAgo(inv.createdAt)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      {inv.status !== "revoked" && (
                        <>
                          <button onClick={() => handleCopy(url, inv.id)} style={{ ...btnSmall, marginRight: 4 }}>
                            {copied === inv.id ? "✓" : "Copy"}
                          </button>
                          {inv.status === "pending" && (
                            <button onClick={() => handleResend(inv.id)} style={{ ...btnSmall, background: "#f59e0b", color: "#fff", border: "none", marginRight: 4 }}>Resend</button>
                          )}
                          <button
                            onClick={() => handleRescind(inv.id, inv.recipientEmail)}
                            style={{ ...btnSmall, background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}
                            title="Rescind this invite and revoke access"
                          >
                            Rescind
                          </button>
                        </>
                      )}
                      {inv.status === "revoked" && (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>
                          {inv.revokedReason === "self_withdrawal" ? "Self-withdrawn" : "Admin rescinded"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {multiSelectModal}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SHARED COMPONENTS                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

function Loader() {
  return <div style={{ padding: 40, textAlign: "center", color: "#6b7280", fontSize: 13 }}>Loading...</div>;
}

function Err({ msg }: { msg: string }) {
  return <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{msg}</div>;
}

function EmptyState({ msg }: { msg: string }) {
  return <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>{msg}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, marginTop: 20, color: "#0f172a" }}>{children}</div>;
}

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ granted, cnda }: { granted: boolean; cnda: boolean }) {
  if (granted) return <span style={{ padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: "#dcfce7", color: "#166534" }}>Viewing</span>;
  if (cnda) return <span style={{ padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>CNDA</span>;
  return <span style={{ padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: "#dbeafe", color: "#1e40af" }}>Opened</span>;
}

function ActivityIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    VIEW: "👁️",
    CNDA_ACCEPT: "✍️",
    QUESTIONNAIRE_COMPLETE: "📝",
    CONTENT_VIEW: "📖",
    RETURN_VISIT: "🔄",
  };
  return <span style={{ fontSize: 14 }}>{icons[type] || "·"}</span>;
}

/* ── Styles ── */

const cardStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f3f4f6",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 12,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 11,
  cursor: "pointer",
};

const inputSm: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
