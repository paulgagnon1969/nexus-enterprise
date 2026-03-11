"use client";

import { useCallback, useEffect, useState } from "react";
import DOMPurify from "dompurify";

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

function InvitesTab() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [methods, setMethods] = useState<Set<string>>(new Set(["email"]));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadInvites = useCallback(() => {
    api("/cam-dashboard/invites").then(setInvites).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const toggleMethod = (m: string) => {
    const next = new Set(methods);
    next.has(m) ? next.delete(m) : next.add(m);
    setMethods(next);
  };

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
          message: message.trim() || undefined,
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

  const handleResend = async (tokenId: string) => {
    await api(`/cam-dashboard/invite/${tokenId}/resend`, { method: "POST" });
    alert("Resent!");
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
    setMessage("");
    setResult(null);
    setMethods(new Set(["email"]));
  };

  if (loading) return <Loader />;

  const statusColors: Record<string, { bg: string; fg: string }> = {
    viewing: { bg: "#dcfce7", fg: "#166534" },
    cnda_accepted: { bg: "#fef3c7", fg: "#92400e" },
    opened: { bg: "#dbeafe", fg: "#1e40af" },
    pending: { bg: "#f3f4f6", fg: "#6b7280" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionTitle>Invites ({invites.length})</SectionTitle>
        <button onClick={() => setFormOpen(!formOpen)} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#0f172a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + Send Invite
        </button>
      </div>

      {/* Send Form */}
      {formOpen && (
        <div style={{ ...cardStyle, marginBottom: 16, padding: 20 }}>
          {!result ? (
            <form onSubmit={handleSend}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@company.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Phone (for SMS)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555-123-4567" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Delivery Method</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {["email", "sms"].map((m) => (
                      <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}>
                        <input type="checkbox" checked={methods.has(m)} onChange={() => toggleMethod(m)} />
                        {m === "email" ? "📧 Email" : "📱 Text"}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Personal Message</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hey, check this out..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
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
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                Link created for <strong>{result.recipientEmail}</strong>
              </p>
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

      {/* Invite list */}
      {invites.length === 0 ? (
        <EmptyState msg="No invites yet — send your first one!" />
      ) : (
        <div style={{ ...cardStyle, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Recipient", "Email", "Views", "Status", "Created", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invites.map((inv: any) => {
                const sc = statusColors[inv.status] || statusColors.pending;
                const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || "https://staging-ncc.nfsgrp.com";
                const url = `${baseUrl}/cam-access/${inv.token}`;
                return (
                  <tr key={inv.id}>
                    <td style={tdStyle}>{inv.recipientName || "—"}</td>
                    <td style={tdStyle}>{inv.recipientEmail || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{inv.viewCount}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.fg }}>{inv.status}</span>
                    </td>
                    <td style={tdStyle}>{timeAgo(inv.createdAt)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => handleCopy(url, inv.id)} style={{ ...btnSmall, marginRight: 4 }}>
                        {copied === inv.id ? "✓" : "Copy"}
                      </button>
                      {inv.status === "pending" && (
                        <button onClick={() => handleResend(inv.id)} style={{ ...btnSmall, background: "#f59e0b", color: "#fff", border: "none" }}>Resend</button>
                      )}
                    </td>
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
