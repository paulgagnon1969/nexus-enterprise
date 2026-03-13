"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("accessToken")
    : null;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers as Record<string, string>) },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Contact {
  id: string;
  displayName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  phone: string | null;
  source: string;
}

interface Invitee {
  id: string;
  email: string | null;
  name: string | null;
  viewCount: number;
  status: string;
  createdAt: string;
  groupId: string | null;
}

interface CannedMessage {
  id: string;
  title: string;
  body: string;
  isDefault: boolean;
}

interface PipUser {
  email: string;
  name: string | null;
  documentTypes: string[];
  campaigns: { id: string; name: string }[];
  viewCount: number;
}

const DEFAULT_CAM_BLURB = `Hi {name},

I'd like to personally invite you to review the Nexus Competitive Advantage Modules (CAM) Library — a curated collection of the technologies and operational systems that set Nexus apart in restoration and construction.

This isn't a sales pitch. It's a transparent look at the tools and processes we've built to deliver faster, more accurate, and more accountable project outcomes.

The process is straightforward:
1. Accept a brief confidentiality agreement (CNDA+)
2. Complete a quick 30-second assessment
3. Access the full CAM Library with interactive discussion

I look forward to your feedback.

— Paul Gagnon, Nexus`;

const DEFAULT_CAMPAIGN_BLURB = `Hi {name},

I'd like to invite you to review a confidential document through the Nexus Secure Portal.

The process is straightforward:
1. Accept a brief confidentiality agreement
2. Complete a quick assessment
3. Access the secure documents

I look forward to your feedback.

— Paul Gagnon, Nexus`;

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  viewing: { bg: "#dcfce7", fg: "#166534" },
  cnda_accepted: { bg: "#fef3c7", fg: "#92400e" },
  opened: { bg: "#dbeafe", fg: "#1e40af" },
  pending: { bg: "#f3f4f6", fg: "#6b7280" },
};

/* ═══════════════════════════════════════════════════════════════════════ */
/*  MODAL                                                                 */
/* ═══════════════════════════════════════════════════════════════════════ */

export default function MultiSelectInviteModal({
  onClose,
  onComplete,
  mode = "cam-library",
  campaignId,
  campaignName,
}: {
  onClose: () => void;
  onComplete: () => void;
  mode?: "cam-library" | "campaign";
  campaignId?: string;
  campaignName?: string;
}) {
  const isCampaign = mode === "campaign" && !!campaignId;
  const defaultBlurb = isCampaign ? DEFAULT_CAMPAIGN_BLURB : DEFAULT_CAM_BLURB;

  // API path prefixes based on mode
  const pickerBase = isCampaign
    ? `/campaigns/${campaignId}/invite-picker`
    : "/cam-dashboard/invite-picker";
  const sendEndpoint = isCampaign
    ? `/campaigns/${campaignId}/invite/group`
    : "/cam-dashboard/invite/group";

  // ── Contacts (left column) ──────────────────────────────────────────
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactCursor, setContactCursor] = useState<string | null>(null);
  const [contactHasMore, setContactHasMore] = useState(true);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [excludedCount, setExcludedCount] = useState(0);
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludedContacts, setExcludedContacts] = useState<Contact[]>([]);
  const [excludedLoading, setExcludedLoading] = useState(false);

  // ── PIP Users ────────────────────────────────────────────────────────
  const [pipUsers, setPipUsers] = useState<PipUser[]>([]);
  const [pipExpanded, setPipExpanded] = useState(false);
  const [pipChecked, setPipChecked] = useState<Set<string>>(new Set());
  const [selectedPipEmails, setSelectedPipEmails] = useState<Set<string>>(new Set());

  // ── Invitees (right column) ─────────────────────────────────────────
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());

  // ── Multi-select (checkboxes on left) ───────────────────────────────
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // ── Message ─────────────────────────────────────────────────────────
  const [cannedMessages, setCannedMessages] = useState<CannedMessage[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState(defaultBlurb);

  // ── Delivery & group ────────────────────────────────────────────────
  const [deliveryMethods, setDeliveryMethods] = useState<Set<string>>(
    new Set(["email", "sms"]),
  );
  const [groupName, setGroupName] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  });

  // ── Sending state ───────────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  // ── Manual contact entry ────────────────────────────────────────────
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const leftListRef = useRef<HTMLDivElement>(null);

  // ── Load contacts (progressive scroll) ──────────────────────────────
  const loadContacts = useCallback(
    async (cursor?: string, search?: string, reset = false) => {
      if (contactLoading) return;
      setContactLoading(true);
      try {
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        if (search?.trim()) params.set("search", search.trim());
        const data = await api<{
          contacts: Contact[];
          nextCursor: string | null;
          hasMore: boolean;
          excludedCount: number;
        }>(`${pickerBase}?${params}`);

        setContacts((prev) =>
          reset ? data.contacts : [...prev, ...data.contacts],
        );
        setContactCursor(data.nextCursor);
        setContactHasMore(data.hasMore);
        setExcludedCount(data.excludedCount);
      } catch {
        /* swallow */
      } finally {
        setContactLoading(false);
      }
    },
    [contactLoading, pickerBase],
  );

  // ── Load invitees ───────────────────────────────────────────────────
  const loadInvitees = useCallback(async () => {
    try {
      const data = await api<Invitee[]>(`${pickerBase}/invitees`);
      setInvitees(data);
    } catch {
      /* swallow */
    }
  }, [pickerBase]);

  // ── Load canned messages ────────────────────────────────────────────
  const loadCannedMessages = useCallback(async () => {
    try {
      const data = await api<CannedMessage[]>("/cam-dashboard/canned-messages");
      setCannedMessages(data);
      const def = data.find((m) => m.isDefault);
      if (def) {
        setActiveMessageId(def.id);
        setMessageBody(def.body);
      }
    } catch {
      /* swallow */
    }
  }, []);

  // ── Load PIP users ──────────────────────────────────────────────────
  const loadPipUsers = useCallback(async () => {
    try {
      const data = await api<PipUser[]>("/campaigns/pip-users");
      setPipUsers(data);
    } catch {
      /* swallow */
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadContacts(undefined, undefined, true);
    loadInvitees();
    loadCannedMessages();
    loadPipUsers();
  }, []);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      loadContacts(undefined, contactSearch, true);
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  // ── Infinite scroll handler ─────────────────────────────────────────
  const handleLeftScroll = useCallback(() => {
    const el = leftListRef.current;
    if (!el || contactLoading || !contactHasMore || !contactCursor) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadContacts(contactCursor, contactSearch);
    }
  }, [contactLoading, contactHasMore, contactCursor, contactSearch]);

  // ── Exclude contacts ────────────────────────────────────────────────
  const handleExclude = useCallback(async () => {
    if (checked.size === 0) return;
    const ids = Array.from(checked);
    try {
      await api("/cam-dashboard/invite-picker/exclude", {
        method: "POST",
        body: JSON.stringify({ contactIds: ids, exclude: true }),
      });
      setContacts((prev) => prev.filter((c) => !checked.has(c.id)));
      setChecked(new Set());
      setExcludedCount((prev) => prev + ids.length);
    } catch {
      alert("Failed to exclude contacts");
    }
  }, [checked]);

  // ── Include contacts back ───────────────────────────────────────────
  const handleInclude = useCallback(
    async (contactIds: string[]) => {
      try {
        await api("/cam-dashboard/invite-picker/exclude", {
          method: "POST",
          body: JSON.stringify({ contactIds, exclude: false }),
        });
        setExcludedContacts((prev) =>
          prev.filter((c) => !contactIds.includes(c.id)),
        );
        setExcludedCount((prev) => Math.max(0, prev - contactIds.length));
        // Reload main contacts list to include them
        loadContacts(undefined, contactSearch, true);
      } catch {
        alert("Failed to include contacts");
      }
    },
    [contactSearch],
  );

  // ── Load excluded contacts ──────────────────────────────────────────
  const handleShowExcluded = useCallback(async () => {
    if (showExcluded) {
      setShowExcluded(false);
      return;
    }
    setExcludedLoading(true);
    try {
      const data = await api<{ contacts: Contact[] }>(
        "/cam-dashboard/invite-picker/excluded",
      );
      setExcludedContacts(data.contacts);
      setShowExcluded(true);
    } catch {
      /* swallow */
    } finally {
      setExcludedLoading(false);
    }
  }, [showExcluded]);

  // ── Select / deselect (double-click) ────────────────────────────────
  const addToSelected = useCallback(
    (contact: Contact) => {
      if (selected.has(contact.id)) return;
      setSelected((prev) => {
        const next = new Map(prev);
        next.set(contact.id, contact);
        return next;
      });
    },
    [selected],
  );

  // ── Add contact manually ─────────────────────────────────────────────
  const handleAddContact = useCallback(async () => {
    if (!addEmail.trim()) return;
    setAddSaving(true);
    try {
      const data = await api<{
        contacts: { id: string; displayName: string | null; email: string | null; phone: string | null }[];
      }>("/personal-contacts/import", {
        method: "POST",
        body: JSON.stringify({
          contacts: [
            {
              displayName: addName.trim() || null,
              firstName: addName.trim().split(" ")[0] || null,
              lastName: addName.trim().split(" ").slice(1).join(" ") || null,
              email: addEmail.trim(),
              phone: addPhone.trim() || null,
              source: "UPLOAD",
            },
          ],
        }),
      });
      if (data.contacts.length > 0) {
        const created = data.contacts[0];
        const newContact: Contact = {
          id: created.id,
          displayName: created.displayName,
          email: created.email,
          phone: created.phone,
          source: "UPLOAD",
        };
        setContacts((prev) => [newContact, ...prev]);
        addToSelected(newContact);
      }
      setAddName("");
      setAddEmail("");
      setAddPhone("");
      setAddFormOpen(false);
    } catch {
      alert("Failed to create contact");
    } finally {
      setAddSaving(false);
    }
  }, [addName, addEmail, addPhone, addToSelected]);

  const removeFromSelected = useCallback((contactId: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(contactId);
      return next;
    });
  }, []);

  // ── Toggle checkbox ─────────────────────────────────────────────────
  const toggleCheck = useCallback((contactId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(contactId) ? next.delete(contactId) : next.add(contactId);
      return next;
    });
  }, []);

  // ── Select canned message ───────────────────────────────────────────
  const selectCannedMessage = useCallback(
    (id: string) => {
      const msg = cannedMessages.find((m) => m.id === id);
      if (msg) {
        setActiveMessageId(msg.id);
        setMessageBody(msg.body);
      }
    },
    [cannedMessages],
  );

  // ── Canned message CRUD ─────────────────────────────────────────────
  const [msgSaving, setMsgSaving] = useState(false);
  const [saveTitlePrompt, setSaveTitlePrompt] = useState(false);
  const [newMsgTitle, setNewMsgTitle] = useState("");

  const handleSaveAsNew = useCallback(async () => {
    if (!newMsgTitle.trim()) return;
    setMsgSaving(true);
    try {
      const created = await api<CannedMessage>("/cam-dashboard/canned-messages", {
        method: "POST",
        body: JSON.stringify({ title: newMsgTitle.trim(), body: messageBody }),
      });
      setCannedMessages((prev) => [...prev, created]);
      setActiveMessageId(created.id);
      setSaveTitlePrompt(false);
      setNewMsgTitle("");
    } catch {
      alert("Failed to save message");
    } finally {
      setMsgSaving(false);
    }
  }, [newMsgTitle, messageBody]);

  const handleUpdateMessage = useCallback(async () => {
    if (!activeMessageId) return;
    setMsgSaving(true);
    try {
      const updated = await api<CannedMessage>(
        `/cam-dashboard/canned-messages/${activeMessageId}`,
        { method: "PATCH", body: JSON.stringify({ body: messageBody }) },
      );
      setCannedMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
    } catch {
      alert("Failed to update message");
    } finally {
      setMsgSaving(false);
    }
  }, [activeMessageId, messageBody]);

  const handleDeleteMessage = useCallback(async () => {
    if (!activeMessageId) return;
    if (!confirm("Delete this message template?")) return;
    try {
      await api(`/cam-dashboard/canned-messages/${activeMessageId}`, {
        method: "DELETE",
      });
      setCannedMessages((prev) => prev.filter((m) => m.id !== activeMessageId));
      setActiveMessageId(null);
      setMessageBody(defaultBlurb);
    } catch {
      alert("Failed to delete message");
    }
  }, [activeMessageId]);

  const handleSetDefault = useCallback(async () => {
    if (!activeMessageId) return;
    try {
      await api(`/cam-dashboard/canned-messages/${activeMessageId}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      setCannedMessages((prev) =>
        prev.map((m) => ({ ...m, isDefault: m.id === activeMessageId })),
      );
    } catch {
      alert("Failed to set default");
    }
  }, [activeMessageId]);

  // ── Filter left list to exclude already-invited and selected ────────
  const invitedEmails = new Set(
    invitees.map((i) => i.email?.toLowerCase()).filter(Boolean),
  );
  const selectedIds = new Set(selected.keys());

  const filteredContacts = contacts.filter(
    (c) =>
      !selectedIds.has(c.id) &&
      c.email &&
      !invitedEmails.has(c.email.toLowerCase()),
  );

  // ── PIP user selection helpers ───────────────────────────────────────
  const togglePipCheck = useCallback((email: string) => {
    setPipChecked((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }, []);

  const addPipToSelected = useCallback(() => {
    const newEmails = new Set(selectedPipEmails);
    pipChecked.forEach((email) => newEmails.add(email));
    setSelectedPipEmails(newEmails);
    setPipChecked(new Set());
  }, [pipChecked, selectedPipEmails]);

  const removePipFromSelected = useCallback((email: string) => {
    setSelectedPipEmails((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  }, []);

  // ── Send invites ────────────────────────────────────────────────────
  const totalNewCount = selected.size + selectedPipEmails.size;

  const handleSendInvites = useCallback(async () => {
    if (totalNewCount === 0 || deliveryMethods.size === 0) return;
    setSending(true);
    try {
      const data = await api(sendEndpoint, {
        method: "POST",
        body: JSON.stringify({
          contactIds: Array.from(selected.keys()),
          pipUserEmails: Array.from(selectedPipEmails),
          message: messageBody,
          groupName: groupName.trim() || undefined,
          deliveryMethods: Array.from(deliveryMethods),
        }),
      });
      setResult(data);
    } catch {
      alert("Failed to send invites");
    } finally {
      setSending(false);
    }
  }, [totalNewCount, selected, selectedPipEmails, messageBody, groupName, deliveryMethods, sendEndpoint]);

  // ── Toggle delivery method ──────────────────────────────────────────
  const toggleDelivery = useCallback((method: string) => {
    setDeliveryMethods((prev) => {
      const next = new Set(prev);
      next.has(method) ? next.delete(method) : next.add(method);
      return next;
    });
  }, []);

  // ── Result screen ───────────────────────────────────────────────────
  if (result) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, maxWidth: 540 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>
            {result.failed === 0 ? "✅" : "⚠️"} Invites Sent
          </h2>
          <div style={{ fontSize: 14, marginBottom: 16 }}>
            <strong>{result.sent}</strong> of {result.total} invites sent
            successfully.
            {result.failed > 0 && (
              <span style={{ color: "#dc2626" }}>
                {" "}
                {result.failed} failed.
              </span>
            )}
          </div>
          <div
            style={{
              padding: 12,
              background: "#f0fdf4",
              borderRadius: 6,
              border: "1px solid #bbf7d0",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Group: <strong>{result.group.name}</strong>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                onComplete();
                onClose();
              }}
              style={btnPrimary}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              📨 {isCampaign ? `Invite — ${campaignName || "Campaign"}` : "Multi-Select Invite"}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              Select contacts, customize your message, and send {isCampaign ? "campaign" : "CAM Library"} invites.
            </p>
          </div>
          <button onClick={onClose} style={btnClose}>
            ✕
          </button>
        </div>

        {/* ── Message area ───────────────────────────────────────── */}
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            background: "#f9fafb",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              Message Template:
            </span>
            <select
              value={activeMessageId || ""}
              onChange={(e) => {
                if (e.target.value) selectCannedMessage(e.target.value);
                else {
                  setActiveMessageId(null);
                  setMessageBody(defaultBlurb);
                }
              }}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
                flex: 1,
                maxWidth: 300,
              }}
            >
              <option value="">Default</option>
              {cannedMessages.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                  {m.isDefault ? " ★" : ""}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>
              Use <code style={{ background: "#e5e7eb", padding: "1px 3px", borderRadius: 2 }}>{"{name}"}</code> for
              personalization
            </span>
          </div>
          {/* Canned message action buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {activeMessageId && (
              <>
                <button
                  onClick={handleUpdateMessage}
                  disabled={msgSaving}
                  style={{ ...btnMsgAction, background: "#2563eb", color: "#fff", border: "none" }}
                >
                  {msgSaving ? "..." : "Update"}
                </button>
                <button
                  onClick={handleSetDefault}
                  disabled={cannedMessages.find((m) => m.id === activeMessageId)?.isDefault}
                  style={{ ...btnMsgAction, background: "#f59e0b", color: "#fff", border: "none", opacity: cannedMessages.find((m) => m.id === activeMessageId)?.isDefault ? 0.5 : 1 }}
                >
                  Set Default
                </button>
                <button
                  onClick={handleDeleteMessage}
                  style={{ ...btnMsgAction, background: "#dc2626", color: "#fff", border: "none" }}
                >
                  Delete
                </button>
                <div style={{ width: 1, height: 16, background: "#d1d5db" }} />
              </>
            )}
            {!saveTitlePrompt ? (
              <button
                onClick={() => setSaveTitlePrompt(true)}
                style={{ ...btnMsgAction, background: "#059669", color: "#fff", border: "none" }}
              >
                + Save as New
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  autoFocus
                  value={newMsgTitle}
                  onChange={(e) => setNewMsgTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveAsNew()}
                  placeholder="Template name..."
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11, width: 160 }}
                />
                <button
                  onClick={handleSaveAsNew}
                  disabled={!newMsgTitle.trim() || msgSaving}
                  style={{ ...btnMsgAction, background: "#059669", color: "#fff", border: "none" }}
                >
                  Save
                </button>
                <button
                  onClick={() => { setSaveTitlePrompt(false); setNewMsgTitle(""); }}
                  style={btnMsgAction}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* ── Dual-column picker ─────────────────────────────────── */}
        <div
          style={{ display: "flex", gap: 16, height: "calc(75vh - 240px)" }}
        >
          {/* LEFT: Available Contacts */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}
                >
                  Available Contacts
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setAddFormOpen(!addFormOpen)}
                    style={{
                      ...btnMsgAction,
                      background: addFormOpen ? "#fef3c7" : "#0f172a",
                      color: addFormOpen ? "#92400e" : "#fff",
                      border: addFormOpen ? "1px solid #f59e0b" : "none",
                    }}
                  >
                    {addFormOpen ? "Cancel" : "+ Add Contact"}
                  </button>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {filteredContacts.length}
                    {contactHasMore ? "+" : ""}
                  </span>
                </div>
              </div>
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* PIP Portal Users — quick-select trusted users */}
            {pipUsers.length > 0 && (
              <div style={{ borderBottom: "1px solid #e5e7eb" }}>
                <button
                  onClick={() => setPipExpanded(!pipExpanded)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    border: "none",
                    background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>
                    🔑 PIP Portal Users ({pipUsers.length})
                  </span>
                  <span style={{ fontSize: 10, color: "#059669" }}>{pipExpanded ? "▾" : "▸"}</span>
                </button>
                {pipExpanded && (
                  <div style={{ maxHeight: 180, overflow: "auto" }}>
                    {/* Bulk add button */}
                    {pipChecked.size > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 12px",
                          borderBottom: "1px solid #d1fae5",
                          background: "#ecfdf5",
                          position: "sticky",
                          top: 0,
                          zIndex: 1,
                        }}
                      >
                        <button
                          onClick={addPipToSelected}
                          style={{ ...btnMsgAction, background: "#059669", color: "#fff", border: "none" }}
                        >
                          Add {pipChecked.size} PIP User{pipChecked.size !== 1 ? "s" : ""}
                        </button>
                      </div>
                    )}
                    {pipUsers
                      .filter((p) => !selectedPipEmails.has(p.email) && !invitedEmails.has(p.email))
                      .map((p) => (
                        <div
                          key={p.email}
                          onDoubleClick={() => {
                            setSelectedPipEmails((prev) => {
                              const next = new Set(prev);
                              next.add(p.email);
                              return next;
                            });
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 12px",
                            borderBottom: "1px solid #ecfdf5",
                            cursor: "pointer",
                            fontSize: 11,
                            background: pipChecked.has(p.email) ? "#d1fae5" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={pipChecked.has(p.email)}
                            onChange={() => togglePipCheck(p.email)}
                            style={{ flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.name || p.email}
                            </div>
                            <div style={{ fontSize: 10, color: "#6b7280" }}>{p.email}</div>
                          </div>
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            {p.documentTypes.includes("CAM_LIBRARY") && (
                              <span style={{ padding: "1px 4px", borderRadius: 4, fontSize: 8, fontWeight: 700, background: "#dbeafe", color: "#1e40af" }}>CAM</span>
                            )}
                            {p.campaigns.length > 0 && (
                              <span style={{ padding: "1px 4px", borderRadius: 4, fontSize: 8, fontWeight: 700, background: "#fef3c7", color: "#92400e" }}>{p.campaigns.length} camp.</span>
                            )}
                          </div>
                          <span style={{ fontSize: 9, color: "#059669", flexShrink: 0 }}>
                            {p.viewCount > 0 ? `${p.viewCount}👁` : ""}
                          </span>
                        </div>
                      ))}
                    {pipUsers.filter((p) => !selectedPipEmails.has(p.email) && !invitedEmails.has(p.email)).length === 0 && (
                      <div style={{ padding: 12, textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
                        All PIP users already selected or invited
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manual add contact form */}
            {addFormOpen && (
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #bbf7d0",
                  background: "#f0fdf4",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "#065f46", marginBottom: 6 }}>
                  New Contact (saves to NCC)
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    autoFocus
                    placeholder="Name"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11, outline: "none" }}
                  />
                  <input
                    placeholder="Email *"
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11, outline: "none" }}
                  />
                  <input
                    placeholder="Phone"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddContact()}
                    style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                  <button
                    onClick={handleAddContact}
                    disabled={!addEmail.trim() || addSaving}
                    style={{
                      ...btnMsgAction,
                      background: addEmail.trim() ? "#059669" : "#e5e7eb",
                      color: addEmail.trim() ? "#fff" : "#9ca3af",
                      border: "none",
                    }}
                  >
                    {addSaving ? "Saving..." : "Add & Select"}
                  </button>
                </div>
              </div>
            )}

            {/* Contact list */}
            <div
              ref={leftListRef}
              onScroll={handleLeftScroll}
              style={{ flex: 1, overflow: "auto" }}
            >
              {/* Select all row */}
              {filteredContacts.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={filteredContacts.length > 0 && filteredContacts.every((c) => checked.has(c.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = checked.size > 0 && !filteredContacts.every((c) => checked.has(c.id));
                    }}
                    onChange={() => {
                      const allChecked = filteredContacts.every((c) => checked.has(c.id));
                      if (allChecked) {
                        setChecked(new Set());
                      } else {
                        setChecked(new Set(filteredContacts.map((c) => c.id)));
                      }
                    }}
                    style={{ flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>
                    {checked.size > 0
                      ? `${checked.size} selected`
                      : "Select all"}
                  </span>
                </div>
              )}
              {filteredContacts.map((c) => (
                <div
                  key={c.id}
                  onDoubleClick={() => addToSelected(c)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    fontSize: 12,
                    background: checked.has(c.id) ? "#eff6ff" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(c.id)}
                    onChange={() => toggleCheck(c.id)}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c.displayName || c.email || "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#9ca3af",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 6,
                      background: "#f3f4f6",
                      color: "#9ca3af",
                      flexShrink: 0,
                    }}
                  >
                    {c.source}
                  </span>
                </div>
              ))}
              {contactLoading && (
                <div
                  style={{
                    padding: 12,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  Loading...
                </div>
              )}
              {!contactLoading && filteredContacts.length === 0 && (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  {contactSearch
                    ? "No contacts match your search"
                    : "No available contacts"}
                </div>
              )}
            </div>

            {/* Footer: Exclude / Add / Show Excluded */}
            <div
              style={{
                padding: "8px 12px",
                borderTop: "1px solid #e5e7eb",
                background: "#f9fafb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => {
                    const contactsToAdd = filteredContacts.filter((c) => checked.has(c.id));
                    contactsToAdd.forEach((c) => addToSelected(c));
                    setChecked(new Set());
                  }}
                  disabled={checked.size === 0}
                  style={{
                    ...btnSmall,
                    background: checked.size > 0 ? "#059669" : "#e5e7eb",
                    color: checked.size > 0 ? "#fff" : "#9ca3af",
                    border: "none",
                  }}
                >
                  Add Selected ({checked.size})
                </button>
                <button
                  onClick={handleExclude}
                  disabled={checked.size === 0}
                  style={{
                    ...btnSmall,
                    background: checked.size > 0 ? "#dc2626" : "#e5e7eb",
                    color: checked.size > 0 ? "#fff" : "#9ca3af",
                    border: "none",
                  }}
                >
                  Exclude ({checked.size})
                </button>
              </div>
              <button
                onClick={handleShowExcluded}
                style={{
                  ...btnSmall,
                  background: showExcluded ? "#fef3c7" : "transparent",
                  border: showExcluded
                    ? "1px solid #f59e0b"
                    : "1px solid #d1d5db",
                  color: showExcluded ? "#92400e" : "#6b7280",
                }}
              >
                {excludedLoading
                  ? "Loading..."
                  : showExcluded
                    ? "Hide Excluded"
                    : `Show Excluded (${excludedCount})`}
              </button>
            </div>

            {/* Excluded contacts panel */}
            {showExcluded && excludedContacts.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid #fbbf24",
                  background: "#fffbeb",
                  maxHeight: 200,
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#92400e",
                  }}
                >
                  Excluded Contacts ({excludedContacts.length})
                </div>
                {excludedContacts.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 12px",
                      fontSize: 11,
                      borderBottom: "1px solid #fef3c7",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {c.displayName || c.email || "—"}
                      <span style={{ color: "#9ca3af", marginLeft: 6 }}>
                        {c.email}
                      </span>
                    </div>
                    <button
                      onClick={() => handleInclude([c.id])}
                      style={{
                        ...btnSmall,
                        background: "#059669",
                        color: "#fff",
                        border: "none",
                        fontSize: 10,
                        padding: "2px 8px",
                      }}
                    >
                      Include
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Invitees */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f0fdf4",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}
                >
                  Invitees
                </span>
                <span style={{ fontSize: 11, color: "#059669" }}>
                  {totalNewCount} new + {invitees.length} existing
                </span>
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto" }}>
              {/* New selections */}
              {totalNewCount > 0 && (
                <>
                  <div
                    style={{
                      padding: "6px 12px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#059669",
                      background: "#ecfdf5",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    New ({totalNewCount})
                  </div>
                  {/* Contact selections */}
                  {Array.from(selected.values()).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        borderBottom: "1px solid #ecfdf5",
                        fontSize: 12,
                        background: "#f0fdf4",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.displayName || c.email || "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>
                          {c.email}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromSelected(c.id)}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 16,
                          cursor: "pointer",
                          color: "#dc2626",
                          padding: "0 4px",
                          flexShrink: 0,
                        }}
                        title="Remove from selection"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {/* PIP user selections */}
                  {Array.from(selectedPipEmails).map((email) => {
                    const pu = pipUsers.find((p) => p.email === email);
                    return (
                      <div
                        key={`pip-${email}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 12px",
                          borderBottom: "1px solid #ecfdf5",
                          fontSize: 12,
                          background: "#ecfdf5",
                        }}
                      >
                        <span style={{ fontSize: 10, flexShrink: 0 }}>🔑</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {pu?.name || email}
                          </div>
                          <div style={{ fontSize: 10, color: "#6b7280" }}>
                            {email}
                            <span style={{ marginLeft: 4, color: "#059669", fontWeight: 600 }}>PIP User</span>
                          </div>
                        </div>
                        <button
                          onClick={() => removePipFromSelected(email)}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: 16,
                            cursor: "pointer",
                            color: "#dc2626",
                            padding: "0 4px",
                            flexShrink: 0,
                          }}
                          title="Remove PIP user"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Divider */}
              {totalNewCount > 0 && invitees.length > 0 && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderTop: "2px solid #e5e7eb",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    background: "#f9fafb",
                  }}
                >
                  Previously Invited ({invitees.length})
                </div>
              )}

              {/* Existing invitees */}
              {invitees.map((inv) => {
                const sc =
                  STATUS_COLORS[inv.status] || STATUS_COLORS.pending;
                return (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 12px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 11,
                      color: "#6b7280",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          color: "#374151",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {inv.name || inv.email || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {inv.email}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 8,
                        fontSize: 9,
                        fontWeight: 600,
                        background: sc.bg,
                        color: sc.fg,
                        flexShrink: 0,
                      }}
                    >
                      {inv.status}
                    </span>
                    {inv.viewCount > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "#059669",
                          flexShrink: 0,
                        }}
                      >
                        {inv.viewCount}👁
                      </span>
                    )}
                  </div>
                );
              })}

              {totalNewCount === 0 && invitees.length === 0 && (
                <div
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: 12,
                  }}
                >
                  Double-click contacts on the left to add them here
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Action bar ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Group:</span>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
                width: 160,
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Deliver via:</span>
            {(["email", "sms"] as const).map((m) => (
              <label
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={deliveryMethods.has(m)}
                  onChange={() => toggleDelivery(m)}
                />
                {m === "email" ? "📧 Email" : "📱 Text"}
              </label>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={onClose} style={btnOutline}>
            Cancel
          </button>
          <button
            onClick={handleSendInvites}
            disabled={
              totalNewCount === 0 || deliveryMethods.size === 0 || sending
            }
            style={{
              ...btnPrimary,
              opacity:
                totalNewCount === 0 || deliveryMethods.size === 0 ? 0.5 : 1,
            }}
          >
            {sending
              ? "Sending..."
              : `Invite ${totalNewCount} Recipient${totalNewCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.6)",
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: "95vw",
  maxWidth: 1200,
  maxHeight: "95vh",
  padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 6,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnOutline: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 11,
  cursor: "pointer",
  fontWeight: 500,
};

const btnClose: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 22,
  cursor: "pointer",
  color: "#6b7280",
  padding: "4px 8px",
};

const btnMsgAction: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
};
