"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";
import ProjectFilePicker, { ProjectFileSummary } from "./project-file-picker";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CompanyMemberDto {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  };
}

interface RecipientGroupDto {
  id: string;
  name: string;
}

interface ThreadDto {
  id: string;
  subject?: string | null;
  createdAt?: string;
  updatedAt?: string;
  participants?: {
    id: string;
    userId?: string | null;
    email?: string | null;
    displayName?: string | null;
    isExternal?: boolean;
  }[];
}

interface MessageAttachmentDto {
  id: string;
  kind: string;
  url: string;
  filename?: string | null;
}

interface MessageDto {
  id: string;
  body: string;
  createdAt?: string;
  senderId?: string | null;
  senderEmail?: string | null;
  attachments?: MessageAttachmentDto[];
}

interface ThreadWithMessages extends ThreadDto {
  messages?: MessageDto[];
}

export default function MessagingPage() {
  const [threads, setThreads] = useState<ThreadDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadWithMessages | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const [members, setMembers] = useState<CompanyMemberDto[] | null>(null);
  const [groups, setGroups] = useState<RecipientGroupDto[] | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [externalEmailInput, setExternalEmailInput] = useState("");
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState("");

  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newMessageLinks, setNewMessageLinks] = useState<{ url: string; label?: string }[]>([]);

  const [replyLinkUrl, setReplyLinkUrl] = useState("");
  const [replyLinkLabel, setReplyLinkLabel] = useState("");
  const [replyLinks, setReplyLinks] = useState<{ url: string; label?: string }[]>([]);

  const [showNewMessageAttachments, setShowNewMessageAttachments] = useState(false);
  const [showReplyAttachments, setShowReplyAttachments] = useState(false);
  const [showProjectFilePicker, setShowProjectFilePicker] = useState<
    "new" | "reply" | null
  >(null);
  const [selectedThreadProjectId, setSelectedThreadProjectId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    // Optional draft recipients coming from other pages (e.g. candidates list)
    async function hydrateFromDraftAndMaybeCreateGroup() {
      try {
        const draft = window.localStorage.getItem("messagingDraftFromCandidates");
        if (!draft) return;
        const parsed = JSON.parse(draft);
        const emailsRaw: unknown = parsed.externalEmails;
        const emails = Array.isArray(emailsRaw)
          ? emailsRaw
              .map(v => (typeof v === "string" ? v.trim() : ""))
              .filter(Boolean)
          : [];
        if (!emails.length) {
          window.localStorage.removeItem("messagingDraftFromCandidates");
          return;
        }

        // Pre-populate external emails in the composer
        setExternalEmails(prev => {
          const set = new Set<string>(prev);
          for (const email of emails) set.add(email);
          return Array.from(set);
        });

        window.localStorage.removeItem("messagingDraftFromCandidates");

        // Best-effort: automatically codify this cohort as a recipient group for reuse
        try {
          const nameBase = "Prospective candidates cohort";
          const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
          const groupName = `${nameBase} – ${ts} (${emails.length})`;

          const res = await fetch(`${API_BASE}/messages/recipient-groups`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: groupName,
              members: emails.map(email => ({ email })),
            }),
          });

          if (!res.ok || cancelled) return;
          const created: any = await res.json();
          const createdId = String(created.id || "");
          const createdName = String(created.name || groupName);

          setGroups(prev => {
            const base = Array.isArray(prev) ? prev : [];
            if (base.some(g => g.id === createdId)) return base;
            return [...base, { id: createdId, name: createdName }];
          });
        } catch {
          // If group creation fails, we still have the externalEmails prefilled.
        }
      } catch {
        // ignore malformed draft payloads
      }
    }

    async function loadThreads() {
      try {
        setLoadingThreads(true);
        setError(null);
        const res = await fetch(`${API_BASE}/messages/threads`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load threads (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        setThreads(Array.isArray(json) ? json : []);

        // Best-effort load of company members for recipient picker
        const meRes = await fetch(`${API_BASE}/companies/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meJson: any = await meRes.json();
          const mems: CompanyMemberDto[] = Array.isArray(meJson.memberships)
            ? meJson.memberships
            : [];
          setMembers(mems);
        }

        // Best-effort load of recipient groups (favorites)
        const groupsRes = await fetch(`${API_BASE}/messages/recipient-groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (groupsRes.ok) {
          const groupJson: any[] = await groupsRes.json();
          setGroups(
            Array.isArray(groupJson)
              ? groupJson.map(g => ({ id: g.id as string, name: String(g.name || "") }))
              : [],
          );
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load threads");
      } finally {
        if (!cancelled) setLoadingThreads(false);
      }
    }

    void loadThreads();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedThread(null);
      return;
    }
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

  async function loadThread() {
      try {
        setLoadingThread(true);
        const res = await fetch(`${API_BASE}/messages/threads/${selectedId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load thread (${res.status})`);
        }
        const json = (await res.json()) as ThreadWithMessages;
        if (cancelled) return;
        setSelectedThread(json);
        // Remember project context for this thread so we can select project files.
        setSelectedThreadProjectId((json as any).projectId ?? null);
      } catch {
        if (!cancelled) setSelectedThread(null);
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    }

    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function toggleSelectedUser(userId: string) {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId],
    );
  }

  function toggleSelectedGroup(groupId: string) {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId],
    );
  }

  function addExternalEmailChip() {
    const v = externalEmailInput.trim();
    if (!v) return;
    setExternalEmails(prev => (prev.includes(v) ? prev : [...prev, v]));
    setExternalEmailInput("");
  }

  function removeExternalEmailChip(email: string) {
    setExternalEmails(prev => prev.filter(e => e !== email));
  }

  async function handleSaveFavoriteGroup(ev: React.FormEvent) {
    ev.preventDefault();
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    const name = newGroupName.trim();
    if (!name) return;
    if (selectedUserIds.length === 0 && externalEmails.length === 0) {
      setError("Select at least one recipient before saving a favorite group.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/messages/recipient-groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          members: [
            ...selectedUserIds.map(userId => ({ userId })),
            ...externalEmails.map(email => ({ email })),
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save favorite group (${res.status})`);
      }
      const json: any = await res.json();
      setGroups(prev => {
        const base = Array.isArray(prev) ? prev : [];
        const newEntry = { id: String(json.id), name: String(json.name || name) };
        // Avoid duplicates by id
        if (base.some(g => g.id === newEntry.id)) return base;
        return [...base, newEntry];
      });
      setNewGroupName("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save favorite group");
    }
  }

  function addNewMessageLink() {
    const url = newLinkUrl.trim();
    if (!url) return;
    setNewMessageLinks(prev => [...prev, { url, label: newLinkLabel.trim() || undefined }]);
    setNewLinkUrl("");
    setNewLinkLabel("");
  }

  function removeNewMessageLink(url: string) {
    setNewMessageLinks(prev => prev.filter(l => l.url !== url));
  }

  function addReplyLink() {
    const url = replyLinkUrl.trim();
    if (!url) return;
    setReplyLinks(prev => [...prev, { url, label: replyLinkLabel.trim() || undefined }]);
    setReplyLinkUrl("");
    setReplyLinkLabel("");
  }

  function removeReplyLink(url: string) {
    setReplyLinks(prev => prev.filter(l => l.url !== url));
  }

  async function handleCreateThread(ev: React.FormEvent) {
    ev.preventDefault();
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    if (!newBody.trim()) return;

    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/messages/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: newSubject.trim() || null,
          body: newBody.trim(),
          participantUserIds: selectedUserIds,
          externalEmails,
          groupIds: selectedGroupIds,
          attachments:
            newMessageLinks.length > 0
              ? newMessageLinks.map(l => ({
                  kind: "EXTERNAL_LINK",
                  url: l.url,
                  filename: l.label || null,
                }))
              : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create thread (${res.status})`);
      }
      setNewSubject("");
      setNewBody("");
      setSelectedUserIds([]);
      setSelectedGroupIds([]);
      setExternalEmails([]);
      setNewMessageLinks([]);

      const threadsRes = await fetch(`${API_BASE}/messages/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadsRes.ok) {
        const json: any[] = await threadsRes.json();
        setThreads(Array.isArray(json) ? json : []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create thread");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendReply(ev: React.FormEvent) {
    ev.preventDefault();
    if (!selectedId || !replyBody.trim()) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setSendingReply(true);
      const res = await fetch(`${API_BASE}/messages/threads/${selectedId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body: replyBody.trim(),
          attachments:
            replyLinks.length > 0
              ? replyLinks.map(l => ({
                  kind: "EXTERNAL_LINK",
                  url: l.url,
                  filename: l.label || null,
                }))
              : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to send message (${res.status})`);
      }
      setReplyBody("");
      setReplyLinks([]);

      const threadRes = await fetch(`${API_BASE}/messages/threads/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadRes.ok) {
        const json = (await threadRes.json()) as ThreadWithMessages;
        setSelectedThread(json);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to send message");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", gap: 12, minHeight: 400 }}>
        <div style={{ flex: "0 0 260px", borderRight: "1px solid #e5e7eb", paddingRight: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Messaging</h2>
          {error && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {error}</p>
          )}

          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <form onSubmit={handleCreateThread} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: "#4b5563" }}>To:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                {members && members.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 2 }}>Team</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {members.map(m => {
                        const label =
                          (m.user.firstName || m.user.lastName)
                            ? `${m.user.firstName || ""} ${m.user.lastName || ""}`.trim()
                            : m.user.email;
                        const active = selectedUserIds.includes(m.userId);
                        return (
                          <button
                            key={m.userId}
                            type="button"
                            onClick={() => toggleSelectedUser(m.userId)}
                            style={{
                              padding: "2px 6px",
                              borderRadius: 999,
                              border: "1px solid #d1d5db",
                              backgroundColor: active ? "#dbeafe" : "#f9fafb",
                              cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {groups && groups.length > 0 && (
                  <div>
                    <div style={{ marginTop: 4, marginBottom: 2 }}>Favorites</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {groups.map(g => {
                        const active = selectedGroupIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleSelectedGroup(g.id)}
                            style={{
                              padding: "2px 6px",
                              borderRadius: 999,
                              border: "1px solid #d1d5db",
                              backgroundColor: active ? "#dcfce7" : "#f9fafb",
                              cursor: "pointer",
                            }}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ marginTop: 4, marginBottom: 2 }}>External emails</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {externalEmails.map(email => (
                      <span
                        key={email}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: "1px solid #d1d5db",
                          backgroundColor: "#f3f4f6",
                        }}
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => removeExternalEmailChip(email)}
                          style={{ border: "none", background: "transparent", cursor: "pointer" }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="email"
                      value={externalEmailInput}
                      onChange={e => setExternalEmailInput(e.target.value)}
                      onBlur={addExternalEmailChip}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addExternalEmailChip();
                        }
                      }}
                      placeholder="Add email and press Enter"
                      style={{
                        minWidth: 120,
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 11,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowNewMessageAttachments(v => !v)}
                    style={{
                      marginTop: 6,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {showNewMessageAttachments ? "Hide attachments" : "Add attachments"}
                  </button>

                  {showNewMessageAttachments && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600 }}>Attachments</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                        <button
                          type="button"
                          disabled
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            color: "#9ca3af",
                            cursor: "default",
                          }}
                          title="Select from Project files (coming soon)"
                        >
                          1. Select file from Project files (coming soon)
                        </button>
                        <button
                          type="button"
                          disabled
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            color: "#9ca3af",
                            cursor: "default",
                          }}
                          title="Upload from your device (coming soon)"
                        >
                          2. Upload from your device (coming soon)
                        </button>
                        <button
                          type="button"
                          disabled
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            color: "#9ca3af",
                            cursor: "default",
                          }}
                          title="Create a new file in Project files (stub – future session)"
                        >
                          3. Create a new file in Project files (stub)
                        </button>
                      </div>

                      <div style={{ marginTop: 4 }}>
                        <div style={{ marginBottom: 4, fontSize: 11 }}>Select from Project files</div>
                        <button
                          type="button"
                          disabled={!selectedThreadProjectId}
                          onClick={() => setShowProjectFilePicker("new")}
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            backgroundColor: selectedThreadProjectId
                              ? "#ffffff"
                              : "#f3f4f6",
                            color: selectedThreadProjectId ? "#111827" : "#9ca3af",
                            fontSize: 11,
                            cursor: selectedThreadProjectId ? "pointer" : "default",
                            marginBottom: 6,
                          }}
                          title={
                            selectedThreadProjectId
                              ? "Attach an existing file from this project"
                              : "Open a thread linked to a project to select files"
                          }
                        >
                          Choose file from project Files
                        </button>

                        <div style={{ marginTop: 4, marginBottom: 2, fontSize: 11 }}>
                          Or attach an external link
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {newMessageLinks.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {newMessageLinks.map(l => (
                                <span
                                  key={l.url}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    border: "1px solid #d1d5db",
                                    backgroundColor: "#eef2ff",
                                  }}
                                >
                                  <span>{l.label || l.url}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeNewMessageLink(l.url)}
                                    style={{ border: "none", background: "transparent", cursor: "pointer" }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              type="url"
                              value={newLinkUrl}
                              onChange={e => setNewLinkUrl(e.target.value)}
                              placeholder="https://example.com/file.pdf"
                              style={{
                                flex: 2,
                                border: "1px solid #d1d5db",
                                borderRadius: 6,
                                padding: "4px 6px",
                                fontSize: 11,
                              }}
                            />
                            <input
                              type="text"
                              value={newLinkLabel}
                              onChange={e => setNewLinkLabel(e.target.value)}
                              placeholder="Optional label"
                              style={{
                                flex: 1,
                                border: "1px solid #d1d5db",
                                borderRadius: 6,
                                padding: "4px 6px",
                                fontSize: 11,
                              }}
                            />
                            <button
                              type="button"
                              onClick={addNewMessageLink}
                              disabled={!newLinkUrl.trim()}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "none",
                                backgroundColor: newLinkUrl.trim() ? "#6366f1" : "#e5e7eb",
                                color: "#f9fafb",
                                fontSize: 11,
                                cursor: newLinkUrl.trim() ? "pointer" : "default",
                              }}
                            >
                              Add link
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ marginTop: 6, marginBottom: 2 }}>Save as favorite</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="Group name"
                      style={{
                        flex: 1,
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        padding: "4px 6px",
                        fontSize: 11,
                      }}
                    />
                    <button
                      type="button"
                      onClick={ev => void handleSaveFavoriteGroup(ev as any)}
                      disabled={
                        !newGroupName.trim() ||
                        (selectedUserIds.length === 0 && externalEmails.length === 0)
                      }
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "none",
                        backgroundColor:
                          !newGroupName.trim() ||
                          (selectedUserIds.length === 0 && externalEmails.length === 0)
                            ? "#e5e7eb"
                            : "#0ea5e9",
                        color: "#f9fafb",
                        fontSize: 11,
                        cursor:
                          !newGroupName.trim() ||
                          (selectedUserIds.length === 0 && externalEmails.length === 0)
                            ? "default"
                            : "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>

              <input
                type="text"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="Subject (optional)"
                style={{
                  padding: "6px 8px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
              />
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Start a new conversation"
                rows={3}
                style={{
                  padding: "6px 8px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                }}
              />
              <button
                type="submit"
                disabled={creating || !newBody.trim()}
                style={{
                  alignSelf: "flex-end",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "none",
                  background: creating ? "#9ca3af" : "#16a34a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: creating ? "default" : "pointer",
                }}
              >
                {creating ? "Sending..." : "Send"}
              </button>
            </form>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Recent threads</div>
          {loadingThreads && !threads && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading…</p>
          )}
          {threads && threads.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>No conversations yet.</p>
          )}
          {threads && threads.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
              {threads.map(t => {
                const updated = t.updatedAt ? new Date(t.updatedAt) : null;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "none",
                        backgroundColor: selectedId === t.id ? "#e5f2ff" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {t.subject || "(no subject)"}
                      </div>
                      {updated && (
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {updated.toLocaleString()}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {selectedId && loadingThread && !selectedThread && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading conversation…</p>
          )}

          {!selectedId && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Select a conversation on the left or start a new one.
            </p>
          )}

        {selectedThread && (
          <>
            {showProjectFilePicker && selectedThreadProjectId && (
              <div
                style={{
                  position: "absolute",
                  top: 60,
                  right: 16,
                  zIndex: 30,
                }}
              >
                <ProjectFilePicker
                  projectId={selectedThreadProjectId}
                  mode={showProjectFilePicker}
                  onClose={() => setShowProjectFilePicker(null)}
                  onSelect={(file: ProjectFileSummary) => {
                    // For now, just attach as external link to keep backend unchanged.
                    const asLink = {
                      url: file.storageUrl,
                      label: file.fileName,
                    };
                    if (showProjectFilePicker === "new") {
                      setNewMessageLinks(prev => [...prev, asLink]);
                    } else {
                      setReplyLinks(prev => [...prev, asLink]);
                    }
                    setShowProjectFilePicker(null);
                  }}
                />
              </div>
            )}

            <header style={{ marginBottom: 8 }}>
                <h3 style={{ marginTop: 0, marginBottom: 2, fontSize: 15 }}>
                  {selectedThread.subject || "(no subject)"}
                </h3>
              </header>

              <div
                style={{
                  flex: 1,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 8,
                  overflowY: "auto",
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                {selectedThread.messages && selectedThread.messages.length > 0 ? (
                  selectedThread.messages.map(m => {
                    const ts = m.createdAt ? new Date(m.createdAt) : null;
                    return (
                      <div key={m.id} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {ts ? ts.toLocaleString() : ""}
                        </div>
                        <div>{m.body}</div>
                        {m.attachments && m.attachments.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 11 }}>
                            {m.attachments.map(att => (
                              <div key={att.id}>
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "#2563eb", textDecoration: "underline" }}
                                >
                                  {att.filename || att.url}
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p style={{ fontSize: 12, color: "#6b7280" }}>No messages yet.</p>
                )}
              </div>

              <form onSubmit={handleSendReply} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder="Type a reply"
                  rows={3}
                  style={{
                    padding: "6px 8px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    resize: "vertical",
                  }}
                />
                <div>
                  <button
                    type="button"
                    onClick={() => setShowReplyAttachments(v => !v)}
                    style={{
                      marginTop: 2,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {showReplyAttachments ? "Hide attachments" : "Add attachments"}
                  </button>

                  {showReplyAttachments && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600 }}>Attachments</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                        <button
                          type="button"
                          disabled
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            color: "#9ca3af",
                            cursor: "default",
                          }}
                          title="Select from Project files (coming soon)"
                        >
                          1. Select file from Project files (coming soon)
                        </button>
                        <button
                          type="button"
                          disabled
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            color: "#9ca3af",
                            cursor: "default",
                          }}
                          title="Upload from your device (coming soon)"
                        >
                          2. Upload from your device (coming soon)
                        </button>
                        <button
                          type="button"
                          disabled
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#f9fafb",
                            color: "#9ca3af",
                            cursor: "default",
                          }}
                          title="Create a new file in Project files (stub – future session)"
                        >
                          3. Create a new file in Project files (stub)
                        </button>
                      </div>

                      <div style={{ marginTop: 4 }}>
                        <div style={{ marginBottom: 4, fontSize: 11 }}>Select from Project files</div>
                        <button
                          type="button"
                          disabled={!selectedThreadProjectId}
                          onClick={() => setShowProjectFilePicker("reply")}
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            backgroundColor: selectedThreadProjectId
                              ? "#ffffff"
                              : "#f3f4f6",
                            color: selectedThreadProjectId ? "#111827" : "#9ca3af",
                            fontSize: 11,
                            cursor: selectedThreadProjectId ? "pointer" : "default",
                            marginBottom: 6,
                          }}
                          title={
                            selectedThreadProjectId
                              ? "Attach an existing file from this project"
                              : "Open a thread linked to a project to select files"
                          }
                        >
                          Choose file from project Files
                        </button>

                        <div style={{ marginTop: 4, marginBottom: 2, fontSize: 11 }}>
                          Or attach an external link
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {replyLinks.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {replyLinks.map(l => (
                                <span
                                  key={l.url}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    border: "1px solid #d1d5db",
                                    backgroundColor: "#eef2ff",
                                  }}
                                >
                                  <span>{l.label || l.url}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeReplyLink(l.url)}
                                    style={{ border: "none", background: "transparent", cursor: "pointer" }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              type="url"
                              value={replyLinkUrl}
                              onChange={e => setReplyLinkUrl(e.target.value)}
                              placeholder="https://example.com/file.pdf"
                              style={{
                                flex: 2,
                                border: "1px solid #d1d5db",
                                borderRadius: 6,
                                padding: "4px 6px",
                                fontSize: 11,
                              }}
                            />
                            <input
                              type="text"
                              value={replyLinkLabel}
                              onChange={e => setReplyLinkLabel(e.target.value)}
                              placeholder="Optional label"
                              style={{
                                flex: 1,
                                border: "1px solid #d1d5db",
                                borderRadius: 6,
                                padding: "4px 6px",
                                fontSize: 11,
                              }}
                            />
                            <button
                              type="button"
                              onClick={addReplyLink}
                              disabled={!replyLinkUrl.trim()}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "none",
                                backgroundColor: replyLinkUrl.trim() ? "#6366f1" : "#e5e7eb",
                                color: "#f9fafb",
                                fontSize: 11,
                                cursor: replyLinkUrl.trim() ? "pointer" : "default",
                              }}
                            >
                              Add link
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={sendingReply || !replyBody.trim()}
                  style={{
                    alignSelf: "flex-end",
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "none",
                    background: sendingReply ? "#9ca3af" : "#16a34a",
                    color: "#f9fafb",
                    fontSize: 12,
                    cursor: sendingReply ? "default" : "pointer",
                  }}
                >
                  {sendingReply ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PageCard>
  );
}
