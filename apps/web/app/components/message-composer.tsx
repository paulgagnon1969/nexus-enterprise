"use client";

import React, { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
type MessageComposerMode = "board" | "ntt";

type LinkItem = { url: string; label?: string };

type NttSubjectType =
  | "APPLICATION_QUESTION"
  | "APPLICATION_FAILURE"
  | "UI_IMPROVEMENT"
  | "OTHER";

interface MessageComposerProps {
  mode: MessageComposerMode;
  onSubmitBoard?: (payload: {
    subject: string;
    body: string;
    links: LinkItem[];
  }) => Promise<void>;
  onSubmitNtt?: (payload: {
    subjectType: NttSubjectType;
    summary: string;
    description: string;
    tags: string[];
    links: LinkItem[];
  }) => Promise<void>;
}

export function MessageComposer({ mode, onSubmitBoard, onSubmitNtt }: MessageComposerProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [subjectType, setSubjectType] = useState<NttSubjectType>("APPLICATION_QUESTION");
  const [tagInput, setTagInput] = useState("");

  async function uploadImageAndReturnLink(file: File): Promise<LinkItem> {
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
        scope: mode === "ntt" ? "NTT" : "MESSAGE",
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

  function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinks(prev => [...prev, { url, label: linkLabel.trim() || undefined }]);
    setLinkUrl("");
    setLinkLabel("");
  }

  function removeLink(url: string) {
    setLinks(prev => prev.filter(l => l.url !== url));
  }

  function handleBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const images: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) images.push(file);
      }
    }
    if (images.length === 0) return;

    e.preventDefault();

    void (async () => {
      try {
        for (const file of images) {
          const link = await uploadImageAndReturnLink(file);
          setLinks(prev => [...prev, link]);
        }
      } catch (err) {
        console.error("Failed to upload pasted image in MessageComposer", err);
        if (typeof window !== "undefined") {
          window.alert("Failed to upload pasted image. Please try again or attach it as a link.");
        }
      }
    })();
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!body.trim()) return;

    try {
      setSubmitting(true);
      if (mode === "board" && onSubmitBoard) {
        await onSubmitBoard({
          subject: subject.trim(),
          body: body.trim(),
          links,
        });
      } else if (mode === "ntt" && onSubmitNtt) {
        const tags = tagInput
          .split(",")
          .map(t => t.trim())
          .filter(Boolean);
        await onSubmitNtt({
          subjectType,
          summary: subject.trim(),
          description: body.trim(),
          tags,
          links,
        });
      }

      // Reset after successful submit
      setSubject("");
      setBody("");
      setLinks([]);
      setLinkUrl("");
      setLinkLabel("");
      if (mode === "ntt") {
        setTagInput("");
        setSubjectType("APPLICATION_QUESTION");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const subjectPlaceholder =
    mode === "board" ? "Topic (optional)" : "Short summary of your question or issue";
  const bodyPlaceholder =
    mode === "board" ? "Post a message to the board" : "Describe what happened or what you\nare asking about";
  const submitLabel =
    mode === "board" ? (submitting ? "Posting..." : "Post") : submitting ? "Sending..." : "Send";

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {mode === "ntt" && (
        <div>
          <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
            Ticket type
          </label>
          <select
            value={subjectType}
            onChange={e => setSubjectType(e.target.value as NttSubjectType)}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
          >
            <option value="APPLICATION_QUESTION">Application question</option>
            <option value="APPLICATION_FAILURE">Application failure</option>
            <option value="UI_IMPROVEMENT">UI improvement</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      )}

      <input
        type="text"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder={subjectPlaceholder}
        style={{
          padding: "6px 8px",
          fontSize: 12,
          borderRadius: 6,
          border: "1px solid #d1d5db",
        }}
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onPaste={handleBodyPaste}
        placeholder={bodyPlaceholder}
        rows={3}
        style={{
          padding: "6px 8px",
          fontSize: 12,
          borderRadius: 6,
          border: "1px solid #d1d5db",
          resize: "vertical",
        }}
      />

      {mode === "ntt" && (
        <div>
          <div style={{ marginTop: 4, marginBottom: 2, fontSize: 11 }}>Tags (optional)</div>
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="accounts, bug, ui"
            style={{
              width: "100%",
              padding: "4px 6px",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
          />
        </div>
      )}

      <div>
        <div style={{ marginTop: 4, marginBottom: 2, fontSize: 11 }}>Attachments (links)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {links.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {links.map(l => (
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
                    onClick={() => removeLink(l.url)}
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
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
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
              value={linkLabel}
              onChange={e => setLinkLabel(e.target.value)}
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
              onClick={addLink}
              disabled={!linkUrl.trim()}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "none",
                backgroundColor: linkUrl.trim() ? "#6366f1" : "#e5e7eb",
                color: "#f9fafb",
                fontSize: 11,
                cursor: linkUrl.trim() ? "pointer" : "default",
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !body.trim()}
        style={{
          alignSelf: "flex-end",
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          background: submitting ? "#9ca3af" : "#0f766e",
          color: "#f9fafb",
          fontSize: 12,
          cursor: submitting ? "default" : "pointer",
        }}
      >
        {submitLabel}
      </button>
    </form>
  );
}
