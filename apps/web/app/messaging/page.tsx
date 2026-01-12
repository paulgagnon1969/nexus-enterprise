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

interface ThreadParticipantDto {
  id: string;
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
  isExternal?: boolean;
  headerRole?: "TO" | "CC" | "BCC";
}

interface ThreadDto {
  id: string;
  subject?: string | null;
  createdAt?: string;
  updatedAt?: string;
  participants?: ThreadParticipantDto[];
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
  subject?: string | null;
  attachments?: MessageAttachmentDto[];
}

interface ThreadWithMessages extends ThreadDto {
  messages?: MessageDto[];
}

interface DraftRecipient {
  email: string;
  name?: string | null;
  field: "to" | "cc" | "bcc";
}

export default function MessagingPage() {
  const [threads, setThreads] = useState<ThreadDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadWithMessages | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state: email-style folders + composer visibility
  const [selectedFolder, setSelectedFolder] = useState<
    "inbox" | "drafts" | "sent" | "trash" | "company"
  >("inbox");
  const [showComposer, setShowComposer] = useState(false);

  function summarizeParticipants(thread: ThreadDto): string {
    if (!thread.participants || thread.participants.length === 0) return "—";
    const labels = thread.participants
      .map(p => (p.displayName || p.email || p.userId || p.id || "").trim())
      .filter(Boolean);
    if (labels.length === 0) return "—";
    if (labels.length === 1) return labels[0];
    return `${labels[0]} + ${labels.length - 1} more`;
  }

  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  const [members, setMembers] = useState<CompanyMemberDto[] | null>(null);
  const [groups, setGroups] = useState<RecipientGroupDto[] | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // External email recipients, split by header line (To / CC / BCC)
  const [toExternalEmailInput, setToExternalEmailInput] = useState("");
  const [toExternalEmails, setToExternalEmails] = useState<string[]>([]);
  const [ccExternalEmailInput, setCcExternalEmailInput] = useState("");
  const [ccExternalEmails, setCcExternalEmails] = useState<string[]>([]);
  const [bccExternalEmailInput, setBccExternalEmailInput] = useState("");
  const [bccExternalEmails, setBccExternalEmails] = useState<string[]>([]);

  // Draft recipients coming from other pages (e.g., Prospective candidates list)
  const [draftRecipients, setDraftRecipients] = useState<DraftRecipient[] | null>(null);
  const [journalSubjectUserIds, setJournalSubjectUserIds] = useState<string[] | null>(null);

  const [newGroupName, setNewGroupName] = useState("");

  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Thread list controls
  const [threadSearch, setThreadSearch] = useState("");
  const [threadSortKey, setThreadSortKey] = useState<
    "updatedDesc" | "updatedAsc" | "subjectAsc" | "subjectDesc"
  >("updatedDesc");

  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newMessageLinks, setNewMessageLinks] = useState<{ url: string; label?: string }[]>([]);

  const [replyLinkUrl, setReplyLinkUrl] = useState("");
  const [replyLinkLabel, setReplyLinkLabel] = useState("");
  const [replyLinks, setReplyLinks] = useState<{ url: string; label?: string }[]>([]);

  const [showNewMessageAttachments, setShowNewMessageAttachments] = useState(false);
  const [newMessageFiles, setNewMessageFiles] = useState<File[]>([]);
  const [showReplyAttachments, setShowReplyAttachments] = useState(false);
  const [showProjectFilePicker, setShowProjectFilePicker] = useState<
    "new" | "reply" | null
  >(null);
  const [expandedAlertMessageIds, setExpandedAlertMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
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

        const journalIdsRaw: unknown = parsed.journalSubjectUserIds;
        const journalIds = Array.isArray(journalIdsRaw)
          ? Array.from(
              new Set(
                journalIdsRaw
                  .map(v => (typeof v === "string" ? v.trim() : ""))
                  .filter(Boolean),
              ),
            )
          : [];
        const submittedFrom: string | null =
          typeof parsed.submittedFrom === "string" && parsed.submittedFrom.trim()
            ? parsed.submittedFrom.trim()
            : null;
        const submittedTo: string | null =
          typeof parsed.submittedTo === "string" && parsed.submittedTo.trim()
            ? parsed.submittedTo.trim()
            : null;
        if (!emails.length) {
          window.localStorage.removeItem("messagingDraftFromCandidates");
          return;
        }

        if (journalIds.length) {
          setJournalSubjectUserIds(journalIds);
        }

        const initialRecipients: DraftRecipient[] = emails.map(email => ({
          email,
          name: email,
          field: "bcc",
        }));
        setDraftRecipients(initialRecipients);
        syncExternalHeadersFromDraft(initialRecipients);

        window.localStorage.removeItem("messagingDraftFromCandidates");

        // Best-effort: automatically codify this cohort as a recipient group for reuse
        try {
          const nameBase = "Hiring class";
          const ts = new Date().toISOString().slice(0, 10);
          let rangeLabel = ts;

          if (submittedFrom && submittedTo) {
            rangeLabel = `${submittedFrom} → ${submittedTo}`;
          } else if (submittedFrom) {
            rangeLabel = `from ${submittedFrom}`;
          } else if (submittedTo) {
            rangeLabel = `through ${submittedTo}`;
          }

          const groupName = `${nameBase} ${rangeLabel} (${emails.length})`;

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

        // If the backend does not yet expose /messages/threads in this environment,
        // treat 404 as "no threads yet" instead of a hard error.
        if (res.status === 404) {
          if (!cancelled) {
            setThreads([]);
          }
          return;
        }

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

    // First, hydrate any draft recipient cohort (e.g. from Prospective candidates list).
    void hydrateFromDraftAndMaybeCreateGroup();
    // Then load existing threads and recipient favorites.
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
    const v = toExternalEmailInput.trim();
    if (!v) return;
    setToExternalEmails(prev => (prev.includes(v) ? prev : [...prev, v]));
    setToExternalEmailInput("");
  }
 
  function removeExternalEmailChip(email: string) {
    setToExternalEmails(prev => prev.filter(e => e !== email));
    setDraftRecipients(prev => (prev ? prev.filter(r => r.email !== email) : prev));
  }

  function syncExternalHeadersFromDraft(recipients: DraftRecipient[]) {
    const to = recipients.filter(r => r.field === "to").map(r => r.email);
    const cc = recipients.filter(r => r.field === "cc").map(r => r.email);
    const bcc = recipients.filter(r => r.field === "bcc").map(r => r.email);
    setToExternalEmails(to);
    setCcExternalEmails(cc);
    setBccExternalEmails(bcc);
  }

  async function handleSaveFavoriteGroup(ev: React.FormEvent) {
    ev.preventDefault();
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    const name = newGroupName.trim();
    if (!name) return;

    const allExternal = Array.from(
      new Set([...toExternalEmails, ...ccExternalEmails, ...bccExternalEmails]),
    );

    if (selectedUserIds.length === 0 && allExternal.length === 0) {
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
            ...allExternal.map(email => ({ email })),
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

  function handleNewBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const images = extractClipboardImages(e);
    if (images.length === 0) return;

    e.preventDefault();

    void (async () => {
      try {
        for (const file of images) {
          const link = await uploadImageAndReturnLink(file);
          setNewMessageLinks(prev => [...prev, { url: link.url, label: link.label }]);
        }
      } catch (err) {
        // Best-effort: surface a simple alert; we don't want to break typing.
        console.error("Failed to upload pasted image", err);
        if (typeof window !== "undefined") {
          window.alert("Failed to upload pasted image. Please try again or attach it as a link.");
        }
      }
    })();
  }

  function handleNewMessageFilesChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: File[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files.item(i);
      if (f) next.push(f);
    }
    setNewMessageFiles(prev => [...prev, ...next]);
  }

  function removeNewMessageFile(name: string) {
    setNewMessageFiles(prev => prev.filter(f => f.name !== name));
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
        console.error("Failed to upload pasted image for reply", err);
        if (typeof window !== "undefined") {
          window.alert("Failed to upload pasted image. Please try again or attach it as a link.");
        }
      }
    })();
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
      const allExternal = Array.from(
        new Set([...toExternalEmails, ...ccExternalEmails, ...bccExternalEmails]),
      );

      // For now, attach uploaded files as EXTERNAL_LINK stubs if the backend
      // supports converting these into real files. We keep the actual File
      // objects in state so we can later wire this into a real upload flow.
      const fileAttachments = newMessageFiles.map(f => ({
        kind: "EXTERNAL_LINK",
        url: `file-name://${encodeURIComponent(f.name)}`,
        filename: f.name,
      }));

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
          // Prefer explicit header buckets so the API can assign proper
          // To/CC/BCC header roles.
          toExternalEmails,
          ccExternalEmails,
          bccExternalEmails,
          // Keep legacy externalEmails for backwards compatibility if needed.
          externalEmails: allExternal,
          groupIds: selectedGroupIds,
          // Pass through any subject userIds that should receive journal entries
          journalSubjectUserIds: journalSubjectUserIds && journalSubjectUserIds.length
            ? journalSubjectUserIds
            : undefined,
          attachments:
            newMessageLinks.length > 0 || newMessageFiles.length > 0
              ? [
                  ...newMessageLinks.map(l => ({
                    kind: "EXTERNAL_LINK",
                    url: l.url,
                    filename: l.label || null,
                  })),
                  ...fileAttachments,
                ]
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
      setToExternalEmails([]);
      setCcExternalEmails([]);
      setBccExternalEmails([]);
      setNewMessageLinks([]);
      setNewMessageFiles([]);
      setShowComposer(false);

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

  function threadMatchesSearch(t: ThreadDto, term: string): boolean {
    const q = term.trim().toLowerCase();
    if (!q) return true;

    let haystack = "";
    haystack += ` ${t.subject ?? ""}`;

    if (t.participants && t.participants.length > 0) {
      for (const p of t.participants) {
        haystack += " ";
        if (p.displayName) haystack += p.displayName;
        if (p.email) haystack += ` ${p.email}`;
        if (p.userId) haystack += ` ${p.userId}`;
      }
    }

    // Best-effort: if the API ever includes messages on the thread payload,
    // include their subject/body/attachments in the search surface.
    const anyThread: any = t as any;
    if (Array.isArray(anyThread.messages)) {
      for (const m of anyThread.messages as any[]) {
        if (m.subject) haystack += ` ${m.subject}`;
        if (m.body) haystack += ` ${m.body}`;
        if (Array.isArray(m.attachments)) {
          for (const att of m.attachments) {
            if (att.filename) haystack += ` ${att.filename}`;
            if (att.url) haystack += ` ${att.url}`;
          }
        }
      }
    }

    return haystack.toLowerCase().includes(q);
  }

  function sortThreads(list: ThreadDto[]): ThreadDto[] {
    return [...list].sort((a, b) => {
      if (threadSortKey === "subjectAsc" || threadSortKey === "subjectDesc") {
        const aSub = (a.subject || "").toLowerCase();
        const bSub = (b.subject || "").toLowerCase();
        if (aSub === bSub) return 0;
        const cmp = aSub < bSub ? -1 : 1;
        return threadSortKey === "subjectAsc" ? cmp : -cmp;
      }

      const aDate = a.updatedAt || a.createdAt || "";
      const bDate = b.updatedAt || b.createdAt || "";
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff =
        new Date(bDate).getTime() - new Date(aDate).getTime();
      return threadSortKey === "updatedDesc" ? diff : -diff;
    });
  }

  const filteredThreads = threads
    ? threads.filter(t => threadMatchesSearch(t, threadSearch))
    : null;

  const sortedThreads = filteredThreads ? sortThreads(filteredThreads) : null;

  const sortedMessages =
    selectedThread?.messages && selectedThread.messages.length > 0
      ? [...selectedThread.messages].sort((a, b) => {
          const aDate = a.createdAt || "";
          const bDate = b.createdAt || "";
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        })
      : [];

  return (
    <PageCard>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: "80vh",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Messages</h2>
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 999,
                border: "1px solid #22c55e",
                backgroundColor: "#dcfce7",
                color: "#166534",
              }}
            >
              v-next
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowComposer(v => !v)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#2563eb",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {showComposer ? "Close composer" : "Compose Message"}
          </button>
        </div>
        {error && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {error}</p>
        )}
        <div style={{ display: "flex", gap: 12, flex: 1 }}>
          {/* Left: folders/navigation */}
          <div
            style={{
              flex: "0 0 220px",
              borderRight: "1px solid #e5e7eb",
              paddingRight: 12,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <nav style={{ marginTop: 4, marginBottom: 12 }}>
              {[
                { id: "inbox", label: "Inbox" },
                { id: "drafts", label: "Drafts" },
                { id: "sent", label: "Sent" },
                { id: "trash", label: "Trash" },
                { id: "company", label: "Company Messages" },
              ].map(folder => {
                const active = selectedFolder === (folder.id as any);
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setSelectedFolder(folder.id as any)}
                    style={{
                      display: "flex",
                      width: "100%",
                      padding: "6px 8px",
                      marginBottom: 2,
                      borderRadius: 6,
                      border: "none",
                      textAlign: "left",
                      backgroundColor: active ? "#e5f2ff" : "transparent",
                      color: active ? "#111827" : "#374151",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {folder.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Middle: thread list (Outlook-style) */}
          <div
            style={{
              flex: "0 0 320px",
              borderRight: "1px solid #e5e7eb",
              paddingRight: 12,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <input
                  type="text"
                  value={threadSearch}
                  onChange={e => setThreadSearch(e.target.value)}
                  placeholder="Search subject, recipients, or message text"
                  style={{
                    flex: 1,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    padding: "4px 6px",
                    fontSize: 12,
                  }}
                />
                <select
                  value={threadSortKey}
                  onChange={e =>
                    setThreadSortKey(e.target.value as typeof threadSortKey)
                  }
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    padding: "4px 6px",
                    fontSize: 12,
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="updatedDesc">Last updated (newest first)</option>
                  <option value="updatedAsc">Last updated (oldest first)</option>
                  <option value="subjectAsc">Subject A–Z</option>
                  <option value="subjectDesc">Subject Z–A</option>
                </select>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Threads
              </div>
              {loadingThreads && !threads && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>Loading…</p>
              )}
              {threads && threads.length === 0 && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>No conversations yet.</p>
              )}
              {sortedThreads && sortedThreads.length > 0 && (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    fontSize: 12,
                    overflowY: "auto",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    maxHeight: "100%",
                  }}
                >
                  {sortedThreads.map(t => {
                    const updated = t.updatedAt ? new Date(t.updatedAt) : null;
                    const anyThread: any = t as any;
                    const previewBodyRaw: string | undefined =
                      (Array.isArray(anyThread.messages) && anyThread.messages.length > 0
                        ? anyThread.messages[0]?.body
                        : undefined) || anyThread.latestBody || anyThread.previewBody;
                    const previewBody = (previewBodyRaw || "")
                      .replace(/\s+/g, " ")
                      .trim();
                    const previewBodyShort = previewBody.length > 120
                      ? `${previewBody.slice(0, 117)}...`
                      : previewBody;

                    const hasAttachments = (() => {
                      if (Array.isArray(anyThread.messages)) {
                        for (const m of anyThread.messages as any[]) {
                          if (Array.isArray(m.attachments) && m.attachments.length > 0) {
                            return true;
                          }
                        }
                      }
                      if (typeof anyThread.hasAttachments === "boolean") {
                        return anyThread.hasAttachments;
                      }
                      return false;
                    })();

                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(t.id)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "6px 8px",
                            borderRadius: 0,
                            border: "none",
                            borderBottom: "1px solid #e5e7eb",
                            backgroundColor:
                              selectedId === t.id ? "#eff6ff" : "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#4b5563" }}>
                                {summarizeParticipants(t)}
                              </div>
                              <div
                                style={{
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                Subject: {t.subject || "(no subject)"}
                              </div>
                              {previewBodyShort && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#4b5563",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  Message: {previewBodyShort}
                                </div>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                                gap: 2,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {updated && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#9ca3af",
                                  }}
                                >
                                  {updated.toLocaleString()}
                                </div>
                              )}
                              {hasAttachments && (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    fontSize: 11,
                                    color: "#6b7280",
                                    gap: 4,
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      display: "inline-block",
                                      width: 10,
                                      height: 10,
                                      borderRadius: 2,
                                      border: "1px solid #9ca3af",
                                      borderTop: "2px solid #9ca3af",
                                      transform: "rotate(-45deg)",
                                    }}
                                  />
                                  <span>Attachments</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Right: conversation detail */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {selectedId && loadingThread && !selectedThread && (
              <p style={{ fontSize: 12, color: "#6b7280" }}>Loading conversation…</p>
            )}

            {!selectedId && (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                Select a conversation in the middle column or start a new one.
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
                  {selectedThread.participants && selectedThread.participants.length > 0 && (
                    <div style={{ fontSize: 11, color: "#4b5563" }}>
                      {(() => {
                        const parts = selectedThread.participants as ThreadParticipantDto[];
                        const internal = parts.filter(p => !p.isExternal && (p.userId || p.displayName || p.email));
                        const toExternal = parts.filter(
                          p => p.isExternal && (p.headerRole === "TO" || !p.headerRole),
                        );
                        const ccExternal = parts.filter(
                          p => p.isExternal && p.headerRole === "CC",
                        );
                        const bccExternal = parts.filter(
                          p => p.isExternal && p.headerRole === "BCC",
                        );

                        const labelFor = (p: ThreadParticipantDto) => {
                          if (p.displayName && p.displayName.trim()) return p.displayName.trim();
                          if (p.email && p.email.trim()) return p.email.trim();
                          return p.userId || p.id;
                        };

                        const segments: string[] = [];

                        if (internal.length > 0) {
                          segments.push(
                            `Team: ${internal
                              .map(labelFor)
                              .join(", ")}`,
                          );
                        }
                        if (toExternal.length > 0) {
                          segments.push(
                            `To: ${toExternal
                              .map(labelFor)
                              .join(", ")}`,
                          );
                        }
                        if (ccExternal.length > 0) {
                          segments.push(
                            `CC: ${ccExternal
                              .map(labelFor)
                              .join(", ")}`,
                          );
                        }
                        if (bccExternal.length > 0) {
                          segments.push(
                            `BCC: ${bccExternal
                              .map(labelFor)
                              .join(", ")}`,
                          );
                        }

                        return segments.join("  ·  ");
                      })()}
                    </div>
                  )}
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
                  {sortedMessages.length > 0 ? (
                    sortedMessages.map(m => {
                      const ts = m.createdAt ? new Date(m.createdAt) : null;
                      const isExternalEmail = !m.senderId && !!m.senderEmail;
                      const isGoogleSecurityAlert =
                        isExternalEmail &&
                        (!!m.senderEmail?.toLowerCase().includes("no-reply@accounts.google.com") ||
                          /security alert/i.test(m.subject || "") ||
                          /2-step verification/i.test(m.subject || ""));

                      const isExpandedAlert =
                        isGoogleSecurityAlert && expandedAlertMessageIds.has(m.id);

                      if (isGoogleSecurityAlert && !isExpandedAlert) {
                        return (
                          <div
                            key={m.id}
                            style={{
                              marginBottom: 4,
                              padding: "4px 6px",
                              borderRadius: 6,
                              backgroundColor: "#f3f4f6",
                              fontSize: 11,
                              color: "#6b7280",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 14,
                                  height: 14,
                                  borderRadius: 999,
                                  backgroundColor: "#e5e7eb",
                                  fontSize: 9,
                                  fontWeight: 600,
                                }}
                              >
                                !
                              </span>
                              <span>Google security alert (hidden)</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedAlertMessageIds(prev => {
                                    const next = new Set(prev);
                                    next.add(m.id);
                                    return next;
                                  });
                                }}
                                style={{
                                  marginLeft: 8,
                                  padding: "1px 6px",
                                  borderRadius: 999,
                                  border: "1px solid #d1d5db",
                                  backgroundColor: "#ffffff",
                                  fontSize: 10,
                                  cursor: "pointer",
                                }}
                              >
                                Show details
                              </button>
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div key={m.id} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{ts ? ts.toLocaleString() : ""}</span>
                            {isExternalEmail && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "1px 6px",
                                  borderRadius: 999,
                                  backgroundColor: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fbbf24",
                                  fontSize: 10,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    backgroundColor: "#facc15",
                                    marginRight: 4,
                                  }}
                                />
                                External email
                              </span>
                            )}
                          </div>
                          {isExternalEmail && (
                            <div style={{ fontSize: 11, color: "#b45309" }}>
                              From external: {m.senderEmail}
                            </div>
                          )}
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
                              color: "9ca3af",
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
      </div>

      {showComposer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            backgroundColor: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 900,
              maxHeight: "90vh",
              backgroundColor: "#ffffff",
              borderRadius: 12,
              boxShadow:
                "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>New message</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Choose recipients, optionally save as a group, then compose and send.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  border: "none",
                  borderRadius: 999,
                  width: 26,
                  height: 26,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#f3f4f6",
                  cursor: "pointer",
                  fontSize: 14,
                }}
                aria-label="Close compose"
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                overflow: "hidden",
                height: "100%",
              }}
            >
              <div
                style={{
                  flex: 0.5,
                  minWidth: 260,
                  maxWidth: 360,
                  borderRight: "1px solid #e5e7eb",
                  paddingRight: 12,
                  overflowY: "auto",
                }}
              >
                {/* Draft cohort mapping */}
                {draftRecipients && draftRecipients.length > 0 && (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#f9fafb",
                      fontSize: 11,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          Map candidate emails to To / CC / BCC
                        </div>
                        <div style={{ color: "#6b7280" }}>
                          Adjust how this cohort appears in the message headers before
                          sending.
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftRecipients(prev => {
                              if (!prev) return prev;
                              const next: DraftRecipient[] = prev.map(r => ({
                                ...r,
                                field: "to" as DraftRecipient["field"],
                              }));
                              syncExternalHeadersFromDraft(next);
                              return next;
                            })
                          }
                          style={{
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            backgroundColor: "#e0f2fe",
                            cursor: "pointer",
                          }}
                        >
                          All To
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftRecipients(prev => {
                              if (!prev) return prev;
                              const next: DraftRecipient[] = prev.map(r => ({
                                ...r,
                                field: "cc" as DraftRecipient["field"],
                              }));
                              syncExternalHeadersFromDraft(next);
                              return next;
                            })
                          }
                          style={{
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            backgroundColor: "#fef9c3",
                            cursor: "pointer",
                          }}
                        >
                          All CC
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftRecipients(prev => {
                              if (!prev) return prev;
                              const next: DraftRecipient[] = prev.map(r => ({
                                ...r,
                                field: "bcc" as DraftRecipient["field"],
                              }));
                              syncExternalHeadersFromDraft(next);
                              return next;
                            })
                          }
                          style={{
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            backgroundColor: "#dcfce7",
                            cursor: "pointer",
                          }}
                        >
                          All BCC
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, maxHeight: 140, overflowY: "auto" }}>
                      {draftRecipients.map(rec => (
                        <div
                          key={rec.email}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "2px 0",
                            borderTop: "1px solid #e5e7eb",
                          }}
                        >
                          <div style={{ fontSize: 11 }}>
                            <span style={{ fontWeight: 500 }}>{rec.email}</span>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftRecipients(prev => {
                                  if (!prev) return prev;
                                  const next: DraftRecipient[] = prev.map(r =>
                                    r.email === rec.email
                                      ? { ...r, field: "to" as DraftRecipient["field"] }
                                      : r,
                                  );
                                  syncExternalHeadersFromDraft(next);
                                  return next;
                                })
                              }
                              style={{
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                backgroundColor:
                                  rec.field === "to" ? "#dbeafe" : "#ffffff",
                                cursor: "pointer",
                              }}
                            >
                              To
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftRecipients(prev => {
                                  if (!prev) return prev;
                                  const next: DraftRecipient[] = prev.map(r =>
                                    r.email === rec.email
                                      ? { ...r, field: "cc" as DraftRecipient["field"] }
                                      : r,
                                  );
                                  syncExternalHeadersFromDraft(next);
                                  return next;
                                })
                              }
                              style={{
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                backgroundColor:
                                  rec.field === "cc" ? "#fef3c7" : "#ffffff",
                                cursor: "pointer",
                              }}
                            >
                              CC
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftRecipients(prev => {
                                  if (!prev) return prev;
                                  const next: DraftRecipient[] = prev.map(r =>
                                    r.email === rec.email
                                      ? { ...r, field: "bcc" as DraftRecipient["field"] }
                                      : r,
                                  );
                                  syncExternalHeadersFromDraft(next);
                                  return next;
                                })
                              }
                              style={{
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                backgroundColor:
                                  rec.field === "bcc" ? "#dcfce7" : "#ffffff",
                                cursor: "pointer",
                              }}
                            >
                              BCC
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minWidth: 0,
                  overflowY: "auto",
                }}
              >
                <form
                  onSubmit={handleCreateThread}
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {/* Group Distribution List (favorites) */}
                  {groups && groups.length > 0 && (
                    <div style={{ marginBottom: 4, fontSize: 11 }}>
                      <div
                        style={{
                          marginBottom: 2,
                          color: "#4b5563",
                          fontWeight: 600,
                        }}
                      >
                        Group Distribution List
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGroupDropdown(v => !v)}
                        style={{
                          alignSelf: "flex-start",
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid #d1d5db",
                          backgroundColor: "#ffffff",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span>
                          {selectedGroupIds.length > 0
                            ? `${selectedGroupIds.length} group${
                                selectedGroupIds.length > 1 ? "s" : ""
                              } selected`
                            : "Select groups"}
                        </span>
                        <span style={{ fontSize: 9 }}>{showGroupDropdown ? "▲" : "▼"}</span>
                      </button>
                      {showGroupDropdown && (
                        <div
                          style={{
                            marginTop: 4,
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#ffffff",
                            padding: 6,
                            maxHeight: 180,
                            overflowY: "auto",
                            boxShadow:
                              "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
                          }}
                        >
                          {groups.map(g => {
                            const active = selectedGroupIds.includes(g.id);
                            return (
                              <label
                                key={g.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "2px 4px",
                                  cursor: "pointer",
                                  fontSize: 11,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => toggleSelectedGroup(g.id)}
                                  style={{ cursor: "pointer" }}
                                />
                                <span>{g.name}</span>
                              </label>
                            );
                          })}
                          {groups.length === 0 && (
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>
                              No groups yet. Use "Save as favorite" below to create one.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TO: internal team + groups + external */}
                  <div style={{ fontSize: 11, color: "#4b5563" }}>To:</div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    {members && members.length > 0 && (
                      <div>
                        <div style={{ marginBottom: 2 }}>Team selection</div>
                        <button
                          type="button"
                          onClick={() => setShowTeamDropdown(v => !v)}
                          style={{
                            alignSelf: "flex-start",
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #d1d5db",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            {selectedUserIds.length > 0
                              ? `${selectedUserIds.length} team member${
                                  selectedUserIds.length > 1 ? "s" : ""
                                } selected`
                              : "Select team members"}
                          </span>
                          <span style={{ fontSize: 9 }}>
                            {showTeamDropdown ? "▲" : "▼"}
                          </span>
                        </button>
                        {showTeamDropdown && (
                          <div
                            style={{
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                              backgroundColor: "#ffffff",
                              padding: 6,
                              maxHeight: 200,
                              overflowY: "auto",
                              boxShadow:
                                "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
                            }}
                          >
                            {members.map(m => {
                              const label =
                                (m.user.firstName || m.user.lastName)
                                  ? `${m.user.firstName || ""} ${
                                      m.user.lastName || ""
                                    }`.trim()
                                  : m.user.email;
                              const active = selectedUserIds.includes(m.userId);
                              return (
                                <label
                                  key={m.userId}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "2px 4px",
                                    cursor: "pointer",
                                    fontSize: 11,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleSelectedUser(m.userId)}
                                    style={{ cursor: "pointer" }}
                                  />
                                  <span>{label}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div style={{ marginTop: 4, marginBottom: 2 }}>
                        External emails (To)
                      </div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
                      >
                        {toExternalEmails.map(email => (
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
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={toExternalEmailInput}
                          onChange={e =>
                            setToExternalEmailInput(e.target.value)
                          }
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
                  </div>

                  {/* CC: external only for now */}
                  <div
                    style={{ fontSize: 11, color: "#4b5563", marginTop: 6 }}
                  >
                    CC:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <div>
                      <div style={{ marginBottom: 2 }}>
                        External emails (CC)
                      </div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
                      >
                        {ccExternalEmails.map(email => (
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
                              onClick={() =>
                                setCcExternalEmails(prev =>
                                  prev.filter(eaddr => eaddr !== email),
                                )
                              }
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={ccExternalEmailInput}
                          onChange={e =>
                            setCcExternalEmailInput(e.target.value)
                          }
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              const v = ccExternalEmailInput.trim();
                              if (v) {
                                setCcExternalEmails(prev =>
                                  prev.includes(v) ? prev : [...prev, v],
                                );
                                setCcExternalEmailInput("");
                              }
                            }
                          }}
                          placeholder="Add CC email and press Enter"
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
                  </div>

                  {/* BCC: external only; candidate cohorts land here by default */}
                  <div
                    style={{ fontSize: 11, color: "#4b5563", marginTop: 6 }}
                  >
                    BCC:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <div>
                      <div style={{ marginBottom: 2 }}>
                        External emails (BCC)
                      </div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
                      >
                        {bccExternalEmails.map(email => (
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
                              onClick={() =>
                                setBccExternalEmails(prev =>
                                  prev.filter(eaddr => eaddr !== email),
                                )
                              }
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={bccExternalEmailInput}
                          onChange={e =>
                            setBccExternalEmailInput(e.target.value)
                          }
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              const v = bccExternalEmailInput.trim();
                              if (v) {
                                setBccExternalEmails(prev =>
                                  prev.includes(v) ? prev : [...prev, v],
                                );
                                setBccExternalEmailInput("");
                              }
                            }
                          }}
                          placeholder="Add BCC email and press Enter"
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
                        {showNewMessageAttachments
                          ? "Hide attachments"
                          : "Add attachments"}
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
                          <div
                            style={{ fontSize: 11, fontWeight: 600 }}
                          >
                            Attachments
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              fontSize: 11,
                            }}
                          >
                            <div style={{ fontSize: 11, color: "#6b7280" }}>
                              1. Upload from your device
                            </div>
                            <input
                              type="file"
                              multiple
                              onChange={e =>
                                handleNewMessageFilesChange(e.target.files)
                              }
                              style={{
                                fontSize: 11,
                              }}
                            />
                            {newMessageFiles.length > 0 && (
                              <div
                                style={{
                                  marginTop: 4,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 4,
                                }}
                              >
                                {newMessageFiles.map(f => (
                                  <span
                                    key={f.name}
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
                                    <span>{f.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeNewMessageFile(f.name)}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ marginTop: 4 }}>
                            <div
                              style={{
                                marginBottom: 4,
                                fontSize: 11,
                              }}
                            >
                              2. Select from Project files
                            </div>
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
                                color: selectedThreadProjectId
                                  ? "#111827"
                                  : "#9ca3af",
                                fontSize: 11,
                                cursor: selectedThreadProjectId
                                  ? "pointer"
                                  : "default",
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

                            <div
                              style={{
                                marginTop: 4,
                                marginBottom: 2,
                                fontSize: 11,
                              }}
                            >
                              Or attach an external link
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              {newMessageLinks.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                  }}
                                >
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
                                        onClick={() =>
                                          removeNewMessageLink(l.url)
                                        }
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          cursor: "pointer",
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div
                                style={{ display: "flex", gap: 4 }}
                              >
                                <input
                                  type="url"
                                  value={newLinkUrl}
                                  onChange={e =>
                                    setNewLinkUrl(e.target.value)
                                  }
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
                                  onChange={e =>
                                    setNewLinkLabel(e.target.value)
                                  }
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
                                    backgroundColor: newLinkUrl.trim()
                                      ? "#6366f1"
                                      : "#e5e7eb",
                                    color: "#f9fafb",
                                    fontSize: 11,
                                    cursor: newLinkUrl.trim()
                                      ? "pointer"
                                      : "default",
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
                      <div
                        style={{
                          marginTop: 6,
                          marginBottom: 2,
                        }}
                      >
                        Save Group Distribution
                      </div>
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
                          onClick={ev =>
                            void handleSaveFavoriteGroup(ev as any)
                          }
                          disabled={
                            !newGroupName.trim() ||
                            (selectedUserIds.length === 0 &&
                              toExternalEmails.length === 0 &&
                              ccExternalEmails.length === 0 &&
                              bccExternalEmails.length === 0)
                          }
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "none",
                            backgroundColor:
                              !newGroupName.trim() ||
                              (selectedUserIds.length === 0 &&
                                toExternalEmails.length === 0 &&
                                ccExternalEmails.length === 0 &&
                                bccExternalEmails.length === 0)
                                ? "#e5e7eb"
                                : "#0ea5e9",
                            cursor:
                              !newGroupName.trim() ||
                              (selectedUserIds.length === 0 &&
                                toExternalEmails.length === 0 &&
                                ccExternalEmails.length === 0 &&
                                bccExternalEmails.length === 0)
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
                    onPaste={handleNewBodyPaste}
                    placeholder="Start a new conversation"
                    rows={4}
                    style={{
                      padding: "6px 8px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      resize: "vertical",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowComposer(false)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        color: "#374151",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating || !newBody.trim()}
                      style={{
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
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageCard>
  );
}
