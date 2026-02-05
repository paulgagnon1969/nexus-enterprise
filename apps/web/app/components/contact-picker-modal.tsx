"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface PersonalContactRow {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
}

interface ReferralRowForFlags {
  prospectEmail: string | null;
  prospectPhone: string | null;
}

interface ContactPickerModalProps {
  open: boolean;
  onClose: () => void;
  modeInitial?: "paid-referral" | "company-invite";
  /**
   * Optional list of existing referrals for the current user, used only to
   * mark contacts as `hasReferral` for UX. If omitted, we simply do not show
   * the "Already referred" chip.
   */
  referralsForFlags?: ReferralRowForFlags[];
}

interface ContactFlags {
  inOrg: boolean;
  hasReferral: boolean;
}

const normalizePhone = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9+]/g, "");
  return digits || null;
};

export default function ContactPickerModal({
  open,
  onClose,
  modeInitial = "company-invite",
  referralsForFlags,
}: ContactPickerModalProps) {
  const [contacts, setContacts] = useState<PersonalContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [inviteMode, setInviteMode] = useState<"paid-referral" | "company-invite">(
    modeInitial,
  );
  const [inviteConfirmArmed, setInviteConfirmArmed] = useState(false);
  const [contactFlagsById, setContactFlagsById] = useState<
    Record<string, ContactFlags>
  >({});

  // When the modal is opened, load contacts + flags.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setContactsError("Missing access token; please log in again.");
      setContactsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setContactsLoading(true);
        setContactsError(null);
        setInviteConfirmArmed(false);
        setInviteMode(modeInitial);

        const res = await fetch(`${API_BASE}/personal-contacts?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load personal contacts (${res.status})`);
        }
        const json = (await res.json()) as PersonalContactRow[];
        if (cancelled) return;
        setContacts(json);
        setSelectedContactIds([]);

        // Best-effort: load current company members + invites so we can mark
        // which contacts are already associated with this tenant. Also look at
        // existing referrals (if provided) to see which contacts have already
        // been referred by the current user.
        try {
          const [membersRes, invitesRes] = await Promise.all([
            fetch(`${API_BASE}/companies/me/members`, {
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => null as any),
            fetch(`${API_BASE}/companies/me/invites`, {
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => null as any),
          ]);

          const membersJson: any[] =
            membersRes && membersRes.ok
              ? await membersRes.json().catch(() => [])
              : [];
          const invitesJson: any[] =
            invitesRes && invitesRes.ok
              ? await invitesRes.json().catch(() => [])
              : [];

          const memberEmails = new Set<string>();
          for (const m of membersJson) {
            const em = (m?.user?.email ?? "").toString().trim().toLowerCase();
            if (em) memberEmails.add(em);
          }
          const inviteEmails = new Set<string>();
          for (const inv of invitesJson) {
            const em = (inv?.email ?? "").toString().trim().toLowerCase();
            if (em) inviteEmails.add(em);
          }

          const referredEmails = new Set<string>();
          const referredPhones = new Set<string>();
          if (Array.isArray(referralsForFlags)) {
            for (const r of referralsForFlags) {
              const em = (r.prospectEmail ?? "")
                .toString()
                .trim()
                .toLowerCase();
              if (em) referredEmails.add(em);
              const ph = normalizePhone(r.prospectPhone ?? null);
              if (ph) referredPhones.add(ph);
            }
          }

          const flags: Record<string, ContactFlags> = {};
          for (const c of json) {
            const em = (c.email ?? "").toString().trim().toLowerCase();
            const ph = normalizePhone(c.phone ?? null);
            const inOrg = !!em && (memberEmails.has(em) || inviteEmails.has(em));
            const hasReferral =
              (!!em && referredEmails.has(em)) || (!!ph && referredPhones.has(ph));
            flags[c.id] = { inOrg, hasReferral };
          }
          if (!cancelled) {
            setContactFlagsById(flags);
          }
        } catch {
          if (!cancelled) {
            // If company/member lookups fail (e.g. user is not an OWNER/ADMIN or
            // no company context), we simply skip the extra flags and fall back
            // to a plain contacts list.
            setContactFlagsById({});
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setContactsError(e?.message ?? "Failed to load personal contacts.");
        }
      } finally {
        if (!cancelled) {
          setContactsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, modeInitial, referralsForFlags]);

  const toggleContactSelected = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleInviteFromContacts = async () => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setContactsError("Missing access token; please log in again.");
      return;
    }
    if (!selectedContactIds.length) {
      setContactsError("Select at least one contact to invite.");
      return;
    }

    try {
      setContactsLoading(true);
      setContactsError(null);

      if (inviteMode === "paid-referral") {
        const res = await fetch(`${API_BASE}/referrals/from-contacts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ personalContactIds: selectedContactIds }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Invite from contacts failed (${res.status}) ${text}`);
        }
      } else {
        // Company invite mode: send company invites (MEMBER role) to the
        // selected contacts' email addresses.
        const companyRes = await fetch(`${API_BASE}/companies/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!companyRes.ok) {
          const text = await companyRes.text().catch(() => "");
          throw new Error(
            `Unable to load current company (${companyRes.status}) ${text}`,
          );
        }
        const companyJson: any = await companyRes.json();
        const companyId = companyJson?.id as string | undefined;
        if (!companyId) {
          throw new Error("No active company context for company invites.");
        }

        // Map selected contact IDs back to their emails; skip those without an
        // email address or already associated with the tenant.
        const flags = contactFlagsById;
        const emailTargets = contacts
          .filter(c => selectedContactIds.includes(c.id))
          .filter(c => {
            const em = (c.email ?? "").toString().trim();
            if (!em) return false;
            const f = flags[c.id];
            // Avoid spamming duplicate invites when we already see the email in
            // the tenant membership / pending invites.
            if (f?.inOrg) return false;
            return true;
          })
          .map(c => (c.email ?? "").toString().trim());

        if (!emailTargets.length) {
          throw new Error(
            "No eligible contacts with email to invite to this company.",
          );
        }

        for (const email of emailTargets) {
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(`${API_BASE}/companies/${companyId}/invites`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email, role: "MEMBER" }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(
              `Company invite failed for ${email} (${res.status}) ${text}`,
            );
          }
        }
      }

      // After creating referrals/invites from contacts, caller pages will
      // typically reload their referral data; from the modal's perspective we
      // simply close on success.
      onClose();
      setSelectedContactIds([]);
      setInviteConfirmArmed(false);
    } catch (e: any) {
      setContactsError(e?.message ?? "Failed to send invites from contacts.");
    } finally {
      setContactsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "min(800px, 100% - 32px)",
          maxHeight: "80vh",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(15,23,42,0.35)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Invite from your contacts</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              Your personal contact book is confidential and tied to your profile, not your company. Only you can see
              these contacts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
            }}
            aria-label="Close"
          >
            
          </button>
        </div>

        {contactsLoading && (
          <p style={{ fontSize: 13, color: "#6b7280" }}>Loading your contacts…</p>
        )}
        {contactsError && !contactsLoading && (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>{contactsError}</p>
        )}

        {!contactsLoading && !contactsError && contacts.length === 0 && (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            You don't have any personal contacts yet. You can import contacts from your phone or desktop address book
            on the Personal Contacts settings page.
          </p>
        )}

        {!contactsLoading && contacts.length > 0 && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#4b5563" }}>
                <span style={{ fontWeight: 600, marginRight: 8 }}>Invite mode:</span>
                <span
                  style={{
                    display: "inline-flex",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setInviteMode("paid-referral");
                      setInviteConfirmArmed(false);
                    }}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      border: "none",
                      backgroundColor:
                        inviteMode === "paid-referral" ? "#0f172a" : "#ffffff",
                      color: inviteMode === "paid-referral" ? "#f9fafb" : "#4b5563",
                      cursor: "pointer",
                    }}
                  >
                    Paid referral
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInviteMode("company-invite");
                      setInviteConfirmArmed(false);
                    }}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      border: "none",
                      borderLeft: "1px solid #e5e7eb",
                      backgroundColor:
                        inviteMode === "company-invite" ? "#0f172a" : "#ffffff",
                      color: inviteMode === "company-invite" ? "#f9fafb" : "#4b5563",
                      cursor: "pointer",
                    }}
                  >
                    Company invite
                  </button>
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: "#dcfce7",
                    marginRight: 4,
                  }}
                />
                <span style={{ marginRight: 8 }}>Paid referral selection</span>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: "#fffbeb",
                    marginRight: 4,
                  }}
                />
                <span>Company invite selection</span>
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                flex: 1,
                minHeight: 0,
              }}
            >
              <div style={{ maxHeight: "50vh", overflow: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Contact
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c, idx) => {
                      const baseBg = idx % 2 === 0 ? "#ffffff" : "#fcfcfd";
                      const isSelected = selectedContactIds.includes(c.id);
                      let rowBg = baseBg;
                      if (inviteMode === "paid-referral" && isSelected) {
                        rowBg = "#ecfdf3"; // soft green
                      } else if (inviteMode === "company-invite" && isSelected) {
                        rowBg = "#fffbeb"; // soft amber
                      }

                      const name =
                        c.displayName ||
                        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                        c.email ||
                        c.phone ||
                        "(No name)";
                      const isUpload =
                        (c.source || "").toString().toUpperCase() === "UPLOAD";
                      const flags = contactFlagsById[c.id] || {
                        inOrg: false,
                        hasReferral: false,
                      };

                      const textColor = flags.inOrg ? "#9ca3af" : "#111827";

                      return (
                        <tr key={c.id} style={{ background: rowBg }}>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderTop: "1px solid #e5e7eb",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleContactSelected(c.id)}
                            />
                          </td>
                          <td
                            style={{
                              padding: "6px 10px",
                              borderTop: "1px solid #e5e7eb",
                              color: textColor,
                            }}
                          >
                            <div>{name}</div>
                            <div
                              style={{
                                marginTop: 2,
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {isUpload && (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    backgroundColor: "#eef2ff",
                                    color: "#4f46e5",
                                    fontSize: 10,
                                  }}
                                >
                                  Imported from CSV
                                </div>
                              )}
                              {flags.hasReferral && (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    backgroundColor: "#dcfce7",
                                    color: "#166534",
                                    fontSize: 10,
                                  }}
                                >
                                  Already referred
                                </div>
                              )}
                              {flags.inOrg && (
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    backgroundColor: "#fffbeb",
                                    color: "#92400e",
                                    fontSize: 10,
                                  }}
                                >
                                  In your organization
                                </div>
                              )}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "6px 10px",
                              borderTop: "1px solid #e5e7eb",
                              color: textColor,
                            }}
                          >
                            {c.email && <div>{c.email}</div>}
                            {c.phone && (
                              <div style={{ fontSize: 12 }}>{c.phone}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div
          style={{
            marginTop: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {selectedContactIds.length > 0
              ? `${selectedContactIds.length} contact(s) selected`
              : inviteMode === "paid-referral"
                ? "Select contacts to invite with your paid referral link."
                : "Select contacts to invite into your current company."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!inviteConfirmArmed) {
                  setInviteConfirmArmed(true);
                  return;
                }
                void handleInviteFromContacts();
              }}
              disabled={contactsLoading || selectedContactIds.length === 0}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border:
                  inviteMode === "company-invite"
                    ? "1px solid #92400e"
                    : "1px solid #16a34a",
                background:
                  selectedContactIds.length === 0
                    ? inviteMode === "company-invite"
                      ? "#fffbeb"
                      : "#dcfce7"
                    : inviteMode === "company-invite"
                      ? "#f97316"
                      : "#16a34a",
                color:
                  selectedContactIds.length === 0
                    ? "#4b5563"
                    : "#f9fafb",
                fontSize: 12,
                cursor:
                  contactsLoading || selectedContactIds.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {contactsLoading
                ? inviteMode === "company-invite"
                  ? "Sending invites…"
                  : "Inviting…"
                : !inviteConfirmArmed
                  ? inviteMode === "company-invite"
                    ? "Send company invites"
                    : "Send paid referrals"
                  : "Confirm selections and send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
