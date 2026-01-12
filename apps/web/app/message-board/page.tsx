"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";
import { MessageComposer } from "../components/message-composer";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface BoardThreadDto {
  id: string;
  subject?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface MessageAttachmentDto {
  id: string;
  kind: string;
  url: string;
  filename?: string | null;
}

interface BoardMessageDto {
  id: string;
  body: string;
  createdAt?: string;
  senderId?: string | null;
  senderEmail?: string | null;
  attachments?: MessageAttachmentDto[];
}

interface BoardThreadWithMessages extends BoardThreadDto {
  messages?: BoardMessageDto[];
}

export default function MessageBoardPage() {
  const [threads, setThreads] = useState<BoardThreadDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<BoardThreadWithMessages | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compose state now lives in MessageComposer; keep only thread/reply state here.

  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyLinkUrl, setReplyLinkUrl] = useState("");
  const [replyLinkLabel, setReplyLinkLabel] = useState("");
  const [replyLinks, setReplyLinks] = useState<{ url: string; label?: string }[]>([]);

  function extractClipboardImages(e: React.ClipboardEvent<HTMLTextAreaElement>): File[] {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return [];
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    return files;
  }

  async function uploadImageAndReturnLink(file: File): Promise<{ url: string; label: string }> {
    if (typeof window === "undefined") {
      throw new Error("Window is not available");
    }
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      throw new Error("Missing access token; please log in again.");
    }

    const metaRes = await fetch(`${API_BASE}/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contentType: file.type || "image/png",
        fileName: file.name || "screenshot.png",
        scope: "MESSAGE",
      }),
    });

    if (!metaRes.ok) {
      throw new Error(`Failed to prepare upload (${metaRes.status})`);
    }

    const meta: any = await metaRes.json();
    const uploadUrl: string | undefined = meta.uploadUrl;
    const publicUrl: string | undefined = meta.publicUrl || meta.fileUri;
    if (!uploadUrl || !publicUrl) {
      throw new Error("Upload metadata was incomplete");
    }

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!putRes.ok) {
      throw new Error(`Failed to upload image (${putRes.status})`);
    }

    const label = file.name && file.name.trim().length > 0 ? file.name : "Screenshot";
    return { url: publicUrl, label };
  }

  function handleReplyBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const images = extractClipboardImages(e);
    if (images.length === 0) return;

    e.preventDefault();

    void (async () => {
      try {
        for (const file of images) {
          const link = await uploadImageAndReturnLink(file);
          setReplyLinks(prev => [...prev, { url: link.url, label: link.label }]);
        }
      } catch (err) {
        console.error("Failed to upload pasted image for board reply", err);
        if (typeof window !== "undefined") {
          window.alert("Failed to upload pasted image. Please try again or attach it as a link.");
        }
      }
    })();
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    async function loadThreads() {
      try {
        setLoadingThreads(true);
        setError(null);
        const res = await fetch(`${API_BASE}/messages/board/threads`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // If the backend does not yet expose /messages/board/threads here,
        // treat 404 as "no board threads yet" instead of a hard error.
        if (res.status === 404) {
          if (!cancelled) {
            setThreads([]);
          }
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load board threads (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        setThreads(Array.isArray(json) ? json : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load board threads");
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
        const res = await fetch(`${API_BASE}/messages/board/threads/${selectedId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load board thread (${res.status})`);
        }
        const json = (await res.json()) as BoardThreadWithMessages;
        if (cancelled) return;
        setSelectedThread(json);
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

  // New thread link management is handled inside MessageComposer now.

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

  async function handleCreateThreadFromComposer(payload: {
    subject: string;
    body: string;
    links: { url: string; label?: string }[];
  }) {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    if (!payload.body.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/messages/board/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: payload.subject.trim() || null,
          body: payload.body.trim(),
          attachments:
            payload.links.length > 0
              ? payload.links.map(l => ({
                  kind: "EXTERNAL_LINK",
                  url: l.url,
                  filename: l.label || null,
                }))
              : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create board thread (${res.status})`);
      }

      const threadsRes = await fetch(`${API_BASE}/messages/board/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadsRes.ok) {
        const json: any[] = await threadsRes.json();
        setThreads(Array.isArray(json) ? json : []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create board thread");
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
      const res = await fetch(`${API_BASE}/messages/board/threads/${selectedId}/messages`, {
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
        throw new Error(`Failed to post reply (${res.status})`);
      }
      setReplyBody("");
      setReplyLinks([]);

      const threadRes = await fetch(`${API_BASE}/messages/board/threads/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadRes.ok) {
        const json = (await threadRes.json()) as BoardThreadWithMessages;
        setSelectedThread(json);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to post reply");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", gap: 12, minHeight: 400 }}>
        <div style={{ flex: "0 0 260px", borderRight: "1px solid #e5e7eb", paddingRight: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Message Board</h2>
          {error && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {error}</p>
          )}

          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <MessageComposer mode="board" onSubmitBoard={handleCreateThreadFromComposer} />
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Recent topics</div>
          {loadingThreads && !threads && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading…</p>
          )}
          {threads && threads.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>No board messages yet.</p>
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
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading topic…</p>
          )}

          {!selectedId && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              Select a topic on the left or start a new one.
            </p>
          )}

          {selectedThread && (
            <>
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
                            {m.attachments.map(att => {
                              const name = (att.filename || att.url || "").toLowerCase();
                              const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
                              if (isImage) {
                                return (
                                  <div
                                    key={att.id}
                                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
                                  >
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                    >
                                      <img
                                        src={att.url}
                                        alt={att.filename || "Screenshot"}
                                        style={{
                                          width: 80,
                                          height: 80,
                                          objectFit: "cover",
                                          borderRadius: 6,
                                          border: "1px solid #e5e7eb",
                                          backgroundColor: "#f9fafb",
                                        }}
                                      />
                                      <span style={{ color: "#2563eb", textDecoration: "underline" }}>
                                        {att.filename || att.url}
                                      </span>
                                    </a>
                                  </div>
                                );
                              }
                              return (
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
                              );
                            })}
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
                  onPaste={handleReplyBodyPaste}
                  placeholder="Reply to this topic"
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
                  <div style={{ marginTop: 2, marginBottom: 2, fontSize: 11 }}>Attachments (links)</div>
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
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={sendingReply || !replyBody.trim()}
                  style={{
                    alignSelf: "flex-end",
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "none",
                    background: sendingReply ? "#9ca3af" : "#0f766e",
                    color: "#f9fafb",
                    fontSize: 12,
                    cursor: sendingReply ? "default" : "pointer",
                  }}
                >
                  {sendingReply ? "Posting..." : "Post reply"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PageCard>
  );
}
