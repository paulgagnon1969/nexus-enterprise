"use client";

import { useEffect, useMemo, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ReferralSummary {
  totals: {
    totalInvited: number;
    totalConfirmedByReferee: number;
    totalRejectedByReferee: number;
    totalWithEarnings: number;
  };
  earnings: {
    totalEarnedCents: number;
    trailing30DaysEarnedCents: number;
    currency: string;
  };
  perReferee: Array<{
    refereeUserId: string | null;
    refereeEmail: string | null;
    totalEarnedCents: number;
    lastEarnedAt: string | null;
  }>;
}

interface ReferralRow {
  id: string;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  status: string;
  referralConfirmedByReferee: boolean;
  referralRejectedByReferee: boolean;
  createdAt: string;
}

interface PersonalContactRow {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
}

export default function ReferralsPage() {
  const [recruitEmail, setRecruitEmail] = useState("");
  const [recruitPhone, setRecruitPhone] = useState("");
  const [recruitMessage, setRecruitMessage] = useState(
    "I'd like to invite you to register your contractor portfolio with Nexus Contractor Connect.",
  );
  const [recruitApplyUrl, setRecruitApplyUrl] = useState<string | null>(null);
  const [recruitStatus, setRecruitStatus] = useState<string | null>(null);
  const [recruitLoading, setRecruitLoading] = useState(false);

  // Referral bank summary
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // "Your referrals" dashboard state
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // CSV import status
  const [csvImportStatus, setCsvImportStatus] = useState<string | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);

  // Personal contacts picker state
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<PersonalContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  // For advanced invite flows: toggle between paid referral vs company invite.
  const [inviteMode, setInviteMode] = useState<"paid-referral" | "company-invite">(
    "paid-referral",
  );
  const [inviteConfirmArmed, setInviteConfirmArmed] = useState(false);

  // Lightweight flags per contact: whether this person already has a referral
  // from the current user, and whether their email is already associated with
  // the current tenant (member or pending invite).
  const [contactFlagsById, setContactFlagsById] = useState<
    Record<string, { inOrg: boolean; hasReferral: boolean }>
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    async function load() {
      try {
        setRowsLoading(true);
        setRowsError(null);
        const res = await fetch(`${API_BASE}/referrals/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load referrals (${res.status})`);
        }
        const json = await res.json();
        setRows(json as ReferralRow[]);
      } catch (e: any) {
        setRowsError(e?.message ?? "Failed to load referrals.");
      } finally {
        setRowsLoading(false);
      }
    }

    async function loadSummary() {
      try {
        setSummaryLoading(true);
        setSummaryError(null);
        const res = await fetch(`${API_BASE}/referrals/me/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load referral summary (${res.status})`);
        }
        const json = await res.json();
        setSummary(json as ReferralSummary);
      } catch (e: any) {
        setSummaryError(e?.message ?? "Failed to load referral summary.");
      } finally {
        setSummaryLoading(false);
      }
    }

    void load();
    void loadSummary();
  }, []);

  const totalInvited = useMemo(
    () => rows.filter(r => r.status === "INVITED").length,
    [rows],
  );

  const buildRecruitMessage = () => {
    const base =
      recruitMessage.trim() !== ""
        ? recruitMessage.trim()
        : "I'd like to invite you to register your contractor portfolio with Nexus Contractor Connect.";
    if (recruitApplyUrl) {
      return `${base}\n\nStart here: ${recruitApplyUrl}`;
    }
    return base;
  };

  const handleCreateTrackedReferral = async () => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setRecruitStatus("Missing access token; please log in again.");
      return;
    }

    try {
      setRecruitLoading(true);
      setRecruitStatus(null);

      const payload: any = {
        prospectName: recruitEmail?.trim() || undefined,
        prospectEmail: recruitEmail?.trim() || undefined,
        prospectPhone: recruitPhone?.trim() || undefined,
      };

      const res = await fetch(`${API_BASE}/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Referral create failed (${res.status}) ${text}`);
      }

      const json: any = await res.json();
      const tokenValue: string | undefined = json?.referral?.token ?? json?.token;
      let applyPath: string | undefined = json?.applyPath;

      if (!applyPath && tokenValue) {
        applyPath = `/apply?referralToken=${encodeURIComponent(tokenValue)}`;
      }

      if (applyPath && typeof window !== "undefined") {
        const origin = window.location.origin;
        const fullUrl = `${origin}${applyPath}`;
        setRecruitApplyUrl(fullUrl);
        setRecruitStatus("Tracked referral link created.");
      } else {
        setRecruitStatus("Referral created, but no invite link was returned.");
      }
    } catch (e: any) {
      setRecruitStatus(e?.message ?? "Failed to create referral.");
    } finally {
      setRecruitLoading(false);
    }
  };

  const handleCopyRecruitLink = async () => {
    if (typeof navigator === "undefined") {
      setRecruitStatus(
        "Copy to clipboard is not supported in this environment; you can still highlight and copy the link manually.",
      );
      return;
    }
    if (!recruitApplyUrl) {
      setRecruitStatus(
        "Create a tracked referral first so we can generate a link, then use 'Copy invite link' to copy it.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(recruitApplyUrl);
      setRecruitStatus("Invite link copied.");
      setTimeout(() => setRecruitStatus(null), 3000);
    } catch {
      setRecruitStatus("Could not copy the invite link automatically; you can still highlight and copy it manually.");
    }
  };

  const handleEmailRecruit = () => {
    if (typeof window === "undefined") return;
    const body = encodeURIComponent(buildRecruitMessage());
    const subject = encodeURIComponent("Nexus Contractor Connect invitation");
    const to = recruitEmail.trim();
    const href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
    window.location.href = href;
  };

  const handleSmsRecruit = () => {
    if (typeof window === "undefined") return;
    const body = encodeURIComponent(buildRecruitMessage());
    const to = recruitPhone.trim();
    const href = `sms:${encodeURIComponent(to)}?&body=${body}`;
    window.location.href = href;
  };

  const handleOpenContacts = async () => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setContactsError("Missing access token; please log in again.");
      setContactsOpen(true);
      return;
    }

    try {
      setContactsOpen(true);
      setContactsLoading(true);
      setContactsError(null);
      setInviteConfirmArmed(false);
      setInviteMode("paid-referral");

      const res = await fetch(`${API_BASE}/personal-contacts?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load personal contacts (${res.status})`);
      }
      const json = (await res.json()) as PersonalContactRow[];
      setContacts(json);
      setSelectedContactIds([]);

      // Best-effort: load current company members + invites so we can mark
      // which contacts are already associated with this tenant. Also look at
      // existing referrals to see which contacts have already been referred.
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
          membersRes && membersRes.ok ? await membersRes.json().catch(() => []) : [];
        const invitesJson: any[] =
          invitesRes && invitesRes.ok ? await invitesRes.json().catch(() => []) : [];

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

        const normalizePhone = (value: string | null | undefined) => {
          const trimmed = (value ?? "").trim();
          if (!trimmed) return null;
          // Keep digits and leading + only.
          const digits = trimmed.replace(/[^0-9+]/g, "");
          return digits || null;
        };

        const referredEmails = new Set<string>();
        const referredPhones = new Set<string>();
        for (const r of rows) {
          const em = (r.prospectEmail ?? "").toString().trim().toLowerCase();
          if (em) referredEmails.add(em);
          const ph = normalizePhone(r.prospectPhone ?? null);
          if (ph) referredPhones.add(ph);
        }

        const flags: Record<string, { inOrg: boolean; hasReferral: boolean }> = {};
        for (const c of json) {
          const em = (c.email ?? "").toString().trim().toLowerCase();
          const ph = normalizePhone(c.phone ?? null);
          const inOrg = !!em && (memberEmails.has(em) || inviteEmails.has(em));
          const hasReferral =
            (!!em && referredEmails.has(em)) || (!!ph && referredPhones.has(ph));
          flags[c.id] = { inOrg, hasReferral };
        }
        setContactFlagsById(flags);
      } catch {
        // If company/member lookups fail (e.g. user is not an OWNER/ADMIN or no
        // company context), we simply skip the extra flags and fall back to a
        // plain contacts list.
        setContactFlagsById({});
      }
    } catch (e: any) {
      setContactsError(e?.message ?? "Failed to load personal contacts.");
    } finally {
      setContactsLoading(false);
    }
  };

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
          throw new Error(`Unable to load current company (${companyRes.status}) ${text}`);
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
          throw new Error("No eligible contacts with email to invite to this company.");
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
            throw new Error(`Company invite failed for ${email} (${res.status}) ${text}`);
          }
        }
      }

      // After creating referrals/invites from contacts, refresh the referral list.
      const listRes = await fetch(`${API_BASE}/referrals/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok) {
        const listJson = await listRes.json();
        setRows(listJson as ReferralRow[]);
      }

      setContactsOpen(false);
      setSelectedContactIds([]);
      setInviteConfirmArmed(false);
    } catch (e: any) {
      setContactsError(e?.message ?? "Failed to send invites from contacts.");
    } finally {
      setContactsLoading(false);
    }
  };

  const handleImportCsvFile = async (file: File) => {
    setCsvImportStatus(null);
    setCsvImportError(null);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!lines.length) {
        throw new Error("CSV file is empty.");
      }

      const header = lines[0].split(",").map(h => h.trim().toLowerCase());
      const idxName = header.findIndex(h => h === "name" || h === "full name" || h === "fullname");
      const idxFirst = header.findIndex(h => h === "firstname" || h === "first name");
      const idxLast = header.findIndex(h => h === "lastname" || h === "last name");
      const idxEmail = header.findIndex(h => h === "email" || h === "email address");
      const idxPhone = header.findIndex(h => h === "phone" || h === "phone number" || h === "mobile");

      if (idxEmail === -1 && idxPhone === -1) {
        throw new Error("CSV must include at least an email or phone column.");
      }

      const contacts: any[] = [];
      for (let i = 1; i < lines.length; i += 1) {
        const row = lines[i];
        if (!row) continue;
        const cols = row.split(",");
        const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : "");

        const name = idxName >= 0 ? get(idxName) : "";
        const firstName = idxFirst >= 0 ? get(idxFirst) : "";
        const lastName = idxLast >= 0 ? get(idxLast) : "";
        const email = idxEmail >= 0 ? get(idxEmail) : "";
        const phone = idxPhone >= 0 ? get(idxPhone) : "";

        if (!email && !phone) {
          continue;
        }

        contacts.push({
          displayName: name || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
        });
      }

      if (!contacts.length) {
        throw new Error("No contacts with email or phone were found in the CSV.");
      }

      if (typeof window === "undefined") return;
      const token = window.localStorage.getItem("accessToken");
      if (!token) {
        throw new Error("Missing access token; please log in again.");
      }

      const res = await fetch(`${API_BASE}/personal-contacts/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contacts }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Import failed (${res.status})`);
      }

      const json: any = await res.json().catch(() => null);
      const count = typeof json?.count === "number" ? json.count : contacts.length;
      setCsvImportStatus(`Imported or updated ${count} contact(s) into your personal contact book.`);
    } catch (e: any) {
      setCsvImportError(e?.message ?? "Failed to import contacts from CSV.");
    }
  };

  const totalInvitedFromSummary = summary?.totals.totalInvited ?? rows.length;
  const totalApplied = useMemo(
    () => rows.filter(r => r.status === "APPLIED" || r.status === "HIRED").length,
    [rows],
  );

  const totalEarnedDollars = (summary?.earnings.totalEarnedCents ?? 0) / 100;
  const trailing30EarnedDollars = (summary?.earnings.trailing30DaysEarnedCents ?? 0) / 100;

  return (
    <PageCard>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Refer a Friend</h1>

      {/* Confidential personal contact book banner */}
      <div
        style={{
          marginTop: 4,
          marginBottom: 10,
          padding: 10,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#ecfdf5",
          color: "#166534",
          fontSize: 12,
          maxWidth: 720,
        }}
      >
        <strong>Your personal contact book is confidential.</strong>
        <div style={{ marginTop: 4 }}>
          Your personal contact book is confidential and tied to your profile, not your company. Only you can see these
          contacts. Organizations see invited candidates&apos; details only after the candidate accepts the invite.
        </div>
      </div>

      {/* CSV personal contact import (optional) */}
      <section
        style={{
          marginTop: 8,
          marginBottom: 8,
          maxWidth: 720,
          borderRadius: 10,
          padding: 10,
          border: "1px dashed #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          <strong>Import contacts from CSV (optional)</strong>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
          Export your address book from your phone or desktop (as a CSV) and upload it here. We&apos;ll add those entries to
          your confidential personal contact book.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) {
              void handleImportCsvFile(file);
              // reset input so the same file can be re-selected if needed
              e.target.value = "";
            }
          }}
          style={{ fontSize: 12 }}
        />
        {csvImportStatus && (
          <p style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>{csvImportStatus}</p>
        )}
        {csvImportError && (
          <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>{csvImportError}</p>
        )}
      </section>

      {/* Promo/education card for the referral program */}
      <div
        style={{
          marginTop: 8,
          marginBottom: 16,
          maxWidth: 720,
          borderRadius: 16,
          padding: 16,
          backgroundColor: "#ffffff",
          boxShadow: "0 10px 25px rgba(15,23,42,0.12)",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🌟 Nexus Connect Referral Program 🌟</h2>
          <p style={{ marginTop: 6, fontSize: 14, color: "#6b7280" }}>
            Turn great connections into real rewards.
          </p>
        </div>

        <p style={{ fontSize: 14, color: "#111827", marginBottom: 8 }}>
          Invite talented people to join Nexus Connect and earn <strong>1% of every pay period they get paid</strong>
          — automatically.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10, marginBottom: 6 }}>
          How it works – straightforward &amp; automatic:
        </h3>
        <ol style={{ paddingLeft: 18, fontSize: 13, color: "#111827" }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Share your unique referral link</strong> with skilled subcontractors, foremen, PMs, or anyone who’d
            be a perfect fit.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Your referral accepts you</strong> as their referrer during signup (they’ll see and confirm your
            name/link — one easy step).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Once they start getting paid</strong> through Nexus Connect payroll:
            <br />→ For <strong>every pay period</strong> they receive payment, you automatically earn
            <strong> 1% of their gross pay</strong> for that period.
            <br />→ Bonuses are calculated and deposited directly to the bank account on your profile — no forms, no
            delays.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Unlimited referrals</strong> — there’s no cap. The more qualified people you bring in, the more you
            earn over time.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Open to everyone</strong> — you <strong>don’t</strong> need to be a current employee or active user
            to participate and receive bonuses.
          </li>
          <li style={{ marginBottom: 0 }}>
            <strong>12-month program window</strong> — bonuses apply to pay periods within the first
            <strong> 12 months</strong> after your referral is accepted.
          </li>
        </ol>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>
          Your personal Referral Dashboard
        </h3>
        <ul style={{ paddingLeft: 18, fontSize: 13, color: "#111827", marginTop: 0 }}>
          <li>List of all your referrals + current status</li>
          <li>Accepted, started, and paid referral details</li>
          <li>Bonus earned per person per pay period</li>
          <li>Running total per referral + your grand cumulative referral earnings</li>
        </ul>
      </div>

      <section
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          maxWidth: 720,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <label>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Recruit email (optional)</div>
            <input
              value={recruitEmail}
              onChange={e => setRecruitEmail(e.target.value)}
              placeholder="friend@example.com"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Recruit mobile (optional)</div>
            <input
              value={recruitPhone}
              onChange={e => setRecruitPhone(e.target.value)}
              placeholder="(555) 555-5555"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Personal message</div>
            <textarea
              value={recruitMessage}
              onChange={e => setRecruitMessage(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
                resize: "vertical",
              }}
            />
          </label>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleOpenContacts}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px dashed #16a34a",
              background: "#f0fdf4",
              color: "#166534",
              fontSize: 12,
              cursor: "pointer",
            }}
            title="Invite directly from your confidential contact book"
          >
            Invite from my contacts
          </button>
          <button
            type="button"
            onClick={handleCreateTrackedReferral}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: recruitLoading ? "#e5e7eb" : "#0f172a",
              color: recruitLoading ? "#4b5563" : "#f9fafb",
              fontSize: 12,
              cursor: recruitLoading ? "default" : "pointer",
            }}
            disabled={recruitLoading}
          >
            {recruitLoading ? "Creating referral…" : "Create tracked referral"}
          </button>
          <button
            type="button"
            onClick={handleCopyRecruitLink}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Copy invite link
          </button>
          <button
            type="button"
            onClick={handleEmailRecruit}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "var(--color-text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Open email draft
          </button>
          <button
            type="button"
            onClick={handleSmsRecruit}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "var(--color-text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Open text message
          </button>
        </div>

        {recruitApplyUrl && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-muted)" }}>
            Invite link:&nbsp;
            <code style={{ wordBreak: "break-all" }}>{recruitApplyUrl}</code>
          </div>
        )}

        {recruitStatus && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a" }}>{recruitStatus}</div>
        )}
      </section>

      {/* Referral bank summary */}
      <section style={{ marginTop: 6, marginBottom: 10 }}>
        {summaryLoading && (
          <p style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading referral bank…</p>
        )}
        {summaryError && !summaryLoading && (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>{summaryError}</p>
        )}
        {summary && !summaryLoading && !summaryError && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              maxWidth: 720,
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.02 }}>Total earned</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                ${totalEarnedDollars.toFixed(2)} {summary.earnings.currency}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.02 }}>Last 30 days</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                ${trailing30EarnedDollars.toFixed(2)} {summary.earnings.currency}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.02 }}>Total invited</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{totalInvitedFromSummary}</div>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Your referrals</h2>
        {rowsLoading && (
          <p style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading your referrals…</p>
        )}
        {rowsError && !rowsLoading && (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>{rowsError}</p>
        )}

        {!rowsLoading && !rowsError && (
          <>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 8 }}>
              <span style={{ marginRight: 12 }}>
                Total invited: <strong>{rows.length}</strong>
              </span>
              <span>
                Referred who applied/are hired: <strong>{totalApplied}</strong>
              </span>
            </div>

            {rows.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
                You haven&apos;t referred anyone yet. Use the form above to send your first invite.
              </p>
            ) : (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                  maxWidth: 900,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Prospect
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
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const bg = idx % 2 === 0 ? "#ffffff" : "#fcfcfd";
                      let statusLabel = r.status;
                      let statusColor = "#6b7280";
                      if (r.status === "APPLIED" || r.status === "HIRED") {
                        statusLabel = r.status === "HIRED" ? "Hired" : "Applied";
                        statusColor = "#16a34a";
                      } else if (r.referralRejectedByReferee) {
                        statusLabel = "Referee rejected";
                        statusColor = "#b91c1c";
                      } else if (r.referralConfirmedByReferee) {
                        statusLabel = "Confirmed by referee";
                        statusColor = "#2563eb";
                      } else if (r.status === "INVITED") {
                        statusLabel = "Invited";
                      }

                      const created = new Date(r.createdAt);
                      const createdLabel = created.toLocaleDateString();

                      return (
                        <tr key={r.id} style={{ background: bg }}>
                          <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                            {r.prospectName || r.prospectEmail || "(No name)"}
                          </td>
                          <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                            <div>
                              {r.prospectEmail && (
                                <a
                                  href={`mailto:${r.prospectEmail}`}
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {r.prospectEmail}
                                </a>
                              )}
                            </div>
                            {r.prospectPhone && (
                              <div style={{ fontSize: 12 }}>
                                <a
                                  href={`tel:${r.prospectPhone.replace(/[^\\d+]/g, "")}`}
                                  style={{ color: "#6b7280", textDecoration: "none" }}
                                >
                                  {r.prospectPhone}
                                </a>
                              </div>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "6px 10px",
                              borderTop: "1px solid #e5e7eb",
                              color: statusColor,
                              fontWeight: 500,
                            }}
                          >
                            {statusLabel}
                          </td>
                          <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                            {createdLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      {contactsOpen && (
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
                onClick={() => setContactsOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                }}
                aria-label="Close"
              >
                ×
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
                You don&apos;t have any personal contacts yet. You&apos;ll be able to import contacts from your phone or
                desktop address book in a future update.
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
                                <div style={{ marginTop: 2, display: "flex", gap: 4, flexWrap: "wrap" }}>
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
                                {c.phone && <div style={{ fontSize: 12 }}>{c.phone}</div>}
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
                  onClick={() => setContactsOpen(false)}
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
                  disabled={
                    contactsLoading ||
                    selectedContactIds.length === 0
                  }
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: inviteMode === "company-invite" ? "1px solid #92400e" : "1px solid #16a34a",
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
      )}
    </PageCard>
  );
}
