"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type CompanyRole = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT";

type GlobalRole = "SUPER_ADMIN" | "NONE" | string;

type UserType = "WORKER" | "CLIENT" | string;

interface MeMembership {
  companyId: string;
  role: CompanyRole;
  company: {
    id: string;
    name: string;
  };
}

interface MeResponse {
  id: string;
  email: string;
  globalRole?: GlobalRole;
  memberships: MeMembership[];
}

interface CompanyMemberRow {
  userId: string;
  role: CompanyRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    globalRole: GlobalRole;
    userType: UserType;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  };
}

interface CompanyInviteRow {
  id: string;
  email: string;
  role: CompanyRole;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export default function CompanyUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="app-card">
          <p style={{ fontSize: 14, color: "#6b7280" }}>Loading people…</p>
        </div>
      }
    >
      <CompanyUsersPageInner />
    </Suspense>
  );
}

function CompanyUsersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [actorCompanyRole, setActorCompanyRole] = useState<CompanyRole | null>(null);
  const [actorGlobalRole, setActorGlobalRole] = useState<GlobalRole | null>(null);

  const [members, setMembers] = useState<CompanyMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [invites, setInvites] = useState<CompanyInviteRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [singleEmail, setSingleEmail] = useState("");
  const [singleRole, setSingleRole] = useState<CompanyRole>("MEMBER");
  const [singleSaving, setSingleSaving] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSuccess, setSingleSuccess] = useState<string | null>(null);

  // Admin-only: directly create a user with a password (no email invite).
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<CompanyRole>("MEMBER");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Bulk CSV add (create users with passwords)
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkCsvSaving, setBulkCsvSaving] = useState(false);
  const [bulkCsvResult, setBulkCsvResult] = useState<string | null>(null);

  // Inline reset password panel (for admins)
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetRole, setResetRole] = useState<CompanyRole | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"users" | "candidates">("users");

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyTimerRef = useRef<number | null>(null);

  const onboardingUrl =
    typeof window !== "undefined" ? `${window.location.origin}/apply` : "/apply";

  async function copyOnboardingUrl() {
    try {
      const text = onboardingUrl;

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.top = "-1000px";
        el.style.left = "-1000px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }

      setCopyState("copied");
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2500);
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // Allow deep-links like /company/users?tab=candidates
  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab === "candidates") {
      setActiveTab("candidates");
    } else {
      setActiveTab("users");
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    const storedCompanyId = window.localStorage.getItem("companyId");

    if (!token) {
      setInitialError("Missing access token. Please log in again.");
      setInitialLoading(false);
      return;
    }

    async function load() {
      try {
        const meRes = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok) {
          const text = await meRes.text().catch(() => "");
          throw new Error(`Failed to load current user (${meRes.status}) ${text}`);
        }
        const meJson: MeResponse = await meRes.json();
        setMe(meJson);
        setActorGlobalRole(meJson.globalRole ?? "NONE");

        let effectiveCompanyId = storedCompanyId;
        if (!effectiveCompanyId && meJson.memberships[0]) {
          effectiveCompanyId = meJson.memberships[0].companyId;
        }
        if (!effectiveCompanyId) {
          throw new Error("No active company context found for this user.");
        }

        setCompanyId(effectiveCompanyId);

        const membership = meJson.memberships.find(m => m.companyId === effectiveCompanyId);
        if (!membership) {
          throw new Error("You do not have access to this company.");
        }
        setActorCompanyRole(membership.role);
        setCompanyName(membership.company?.name ?? effectiveCompanyId);

        // Load members and invites in parallel
        setMembersLoading(true);
        setInvitesLoading(true);
        setMembersError(null);
        setInvitesError(null);

        const [membersRes, invitesRes] = await Promise.all([
          fetch(`${API_BASE}/companies/${effectiveCompanyId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/companies/${effectiveCompanyId}/invites`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!membersRes.ok) {
          const text = await membersRes.text().catch(() => "");
          setMembersError(
            `Failed to load members (${membersRes.status}) ${text}`,
          );
        } else {
          const membersJson: CompanyMemberRow[] = await membersRes.json();
          setMembers(membersJson || []);
        }

        if (!invitesRes.ok) {
          const text = await invitesRes.text().catch(() => "");
          setInvitesError(
            `Failed to load invites (${invitesRes.status}) ${text}`,
          );
        } else {
          const invitesJson: CompanyInviteRow[] = await invitesRes.json();
          setInvites(invitesJson || []);
        }
      } catch (err: any) {
        setInitialError(err?.message ?? "Failed to load user manager.");
      } finally {
        setInitialLoading(false);
        setMembersLoading(false);
        setInvitesLoading(false);
      }
    }

    void load();
  }, []);

  const canManageMembers =
    actorCompanyRole === "OWNER" || actorCompanyRole === "ADMIN";
  const canGrantOwner = actorCompanyRole === "OWNER";
  const canViewCandidates = actorCompanyRole === "OWNER" || actorCompanyRole === "ADMIN";

  const handleChangeRole = async (
    userId: string,
    currentRole: CompanyRole,
    nextRole: CompanyRole,
  ) => {
    if (!companyId) return;
    if (nextRole === currentRole) return;
    if (!canManageMembers) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/companies/${companyId}/members/${userId}/role`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: nextRole }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(`Failed to update role (${res.status}) ${text}`);
        return;
      }
      const updated: CompanyMemberRow = await res.json();
      setMembers(prev =>
        prev.map(m =>
          m.userId === updated.userId
            ? { ...m, role: updated.role }
            : m,
        ),
      );
    } catch (err: any) {
      alert(err?.message ?? "Failed to update role.");
    }
  };

  const handleSingleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setSingleError(null);
    setSingleSuccess(null);

    if (!companyId) {
      setSingleError("Missing company context.");
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setSingleError("Missing access token. Please log in again.");
      return;
    }

    if (!singleEmail.trim()) {
      setSingleError("Email is required.");
      return;
    }

    try {
      setSingleSaving(true);
      const res = await fetch(`${API_BASE}/companies/${companyId}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: singleEmail.trim(), role: singleRole }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to create invite (${res.status}) ${text}`);
      }
      const invite: CompanyInviteRow = await res.json();
      setInvites(prev => [invite, ...prev]);
      setSingleSuccess(`Invite created for ${invite.email} (${invite.role}).`);
      setSingleEmail("");
      setSingleRole("MEMBER");
    } catch (err: any) {
      setSingleError(err?.message ?? "Failed to create invite.");
    } finally {
      setSingleSaving(false);
    }
  };

  const openResetPasswordPanel = (email: string, role: CompanyRole) => {
    setResetEmail(email);
    setResetRole(role);
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetError(null);
    setResetSuccess(null);
  };

  const closeResetPasswordPanel = () => {
    setResetEmail(null);
    setResetRole(null);
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetError(null);
    setResetSuccess(null);
  };

  const handleCreateUserWithPassword = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!companyId) {
      setCreateError("Missing company context.");
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setCreateError("Missing access token. Please log in again.");
      return;
    }

    if (!createEmail.trim()) {
      setCreateError("Email is required.");
      return;
    }

    if (!createPassword) {
      setCreateError("Password is required.");
      return;
    }

    if (createPassword.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    try {
      setCreateSaving(true);
      const res = await fetch(`${API_BASE}/admin/create-user-with-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          companyId,
          role: createRole,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to create user (${res.status}) ${text}`);
      }

      // Refresh members list so the new user appears in the table with full details.
      const membersRes = await fetch(`${API_BASE}/companies/${companyId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (membersRes.ok) {
        const membersJson: CompanyMemberRow[] = await membersRes.json();
        setMembers(membersJson || []);
      }

      setCreateSuccess(
        `User ${createEmail.trim()} created and added as ${createRole}. Share the /login link with them manually.`,
      );
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("MEMBER");
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create user.");
    } finally {
      setCreateSaving(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const handleBulkCsvCreateUsers = async (e: FormEvent) => {
    e.preventDefault();
    setBulkCsvResult(null);

    if (!companyId) {
      setBulkCsvResult("Missing company context.");
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setBulkCsvResult("Missing access token. Please log in again.");
      return;
    }

    if (!bulkFile) {
      setBulkCsvResult("Choose a CSV file first.");
      return;
    }

    let text: string;
    try {
      text = await readFileAsText(bulkFile);
    } catch (err: any) {
      setBulkCsvResult(err?.message ?? "Failed to read CSV file.");
      return;
    }

    const rows = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (!rows.length) {
      setBulkCsvResult("CSV file is empty.");
      return;
    }

    // Expect header: email,password,role (case-insensitive). Role is optional and
    // currently ignored for safety; all users are created as MEMBER by default.
    const [headerLine, ...dataLines] = rows;
    const headerParts = headerLine.split(",").map(p => p.trim().toLowerCase());
    const emailIdx = headerParts.indexOf("email");
    const pwdIdx = headerParts.indexOf("password");

    if (emailIdx === -1 || pwdIdx === -1) {
      setBulkCsvResult(
        "CSV must have at least 'email' and 'password' columns in the first row.",
      );
      return;
    }

    let successCount = 0;
    const errors: string[] = [];

    try {
      setBulkCsvSaving(true);
      for (const line of dataLines) {
        const cols = line.split(",");
        const email = (cols[emailIdx] || "").trim();
        const password = (cols[pwdIdx] || "").trim();

        if (!email) {
          errors.push("Missing email on a row; skipping.");
          continue;
        }
        if (!password || password.length < 8) {
          errors.push(`${email}: password missing or shorter than 8 characters; skipping.`);
          continue;
        }

        // For now, default all new users to MEMBER; roles can be adjusted later
        // from the Members table. This keeps bulk import simple and safe.
        const role: CompanyRole = "MEMBER";

        try {
          const res = await fetch(`${API_BASE}/admin/create-user-with-password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              email,
              password,
              companyId,
              role,
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            errors.push(
              `${email}: failed to create user (${res.status}) ${text?.slice(0, 120) ?? ""}`,
            );
            continue;
          }

          successCount += 1;
        } catch (err: any) {
          errors.push(`${email}: ${err?.message ?? "request failed"}`);
        }
      }

      // Refresh members list if we created any
      if (successCount > 0) {
        const membersRes = await fetch(`${API_BASE}/companies/${companyId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (membersRes.ok) {
          const membersJson: CompanyMemberRow[] = await membersRes.json();
          setMembers(membersJson || []);
        }
      }
    } finally {
      setBulkCsvSaving(false);
    }

    const summary: string[] = [];
    summary.push(`Created ${successCount} user${successCount === 1 ? "" : "s"}.`);
    if (errors.length) {
      summary.push(`Errors: ${errors.join(" | ")}`);
    }

    setBulkCsvResult(summary.join(" "));
  };

  const handleBulkInvite = async (e: FormEvent) => {
    e.preventDefault();
    setBulkResult(null);

    if (!companyId) {
      setBulkResult("Missing company context.");
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setBulkResult("Missing access token. Please log in again.");
      return;
    }

    const lines = bulkText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkResult("Enter at least one line with an email.");
      return;
    }

    const allowedRoles: CompanyRole[] = ["OWNER", "ADMIN", "MEMBER", "CLIENT"];

    let successCount = 0;
    const errors: string[] = [];

    try {
      setBulkSaving(true);
      for (const raw of lines) {
        const parts = raw.split(/[;,]/).map(p => p.trim()).filter(Boolean);
        const email = parts[0];
        let role: CompanyRole = "MEMBER";
        if (parts[1]) {
          const candidate = parts[1].toUpperCase();
          if (allowedRoles.includes(candidate as CompanyRole)) {
            role = candidate as CompanyRole;
          } else {
            errors.push(`${email}: invalid role '${parts[1]}'`);
            continue;
          }
        }

        if (!email) {
          errors.push(`Skipping blank line.`);
          continue;
        }

        // OWNER role only allowed if actor is OWNER
        if (role === "OWNER" && !canGrantOwner) {
          errors.push(`${email}: cannot grant OWNER role (only company OWNER can).`);
          continue;
        }

        try {
          const res = await fetch(`${API_BASE}/companies/${companyId}/invites`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email, role }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            errors.push(
              `${email}: failed (${res.status}) ${text?.slice(0, 120) ?? ""}`,
            );
            continue;
          }
          const invite: CompanyInviteRow = await res.json();
          setInvites(prev => [invite, ...prev]);
          successCount += 1;
        } catch (err: any) {
          errors.push(`${email}: ${err?.message ?? "request failed"}`);
        }
      }
    } finally {
      setBulkSaving(false);
    }

    const summaryParts: string[] = [];
    summaryParts.push(`Created ${successCount} invite${successCount === 1 ? "" : "s"}.`);
    if (errors.length) {
      summaryParts.push(`Errors: ${errors.join(" | ")}`);
    }

    setBulkResult(summaryParts.join(" "));
  };

  if (initialLoading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading company users…</p>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Company users</h1>
        <p style={{ color: "#b91c1c" }}>{initialError}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>People</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        {companyName ? (
          <>
            Managing people for <strong>{companyName}</strong>
          </>
        ) : (
          "Managing people for current company"
        )}
      </p>
      {actorCompanyRole && (
        <p style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
          Your role in this company: <strong>{actorCompanyRole}</strong>
          {actorGlobalRole && (
            <>
              {" "}· Global: <strong>{actorGlobalRole}</strong>
            </>
          )}
        </p>
      )}

      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#f9fafb",
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, color: "#4b5563" }}>
          <div style={{ fontWeight: 700, color: "#111827" }}>Onboarding URL</div>
          <div style={{ marginTop: 2, fontFamily: "monospace" }}>{onboardingUrl}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => void copyOnboardingUrl()}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Copy onboarding URL
          </button>
          {copyState === "copied" && (
            <span style={{ fontSize: 12, color: "#16a34a" }}>Copied</span>
          )}
          {copyState === "error" && (
            <span style={{ fontSize: 12, color: "#b91c1c" }}>Copy failed</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => {
            setActiveTab("users");
            router.replace("/company/users");
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: activeTab === "users" ? "1px solid #0f172a" : "1px solid #d1d5db",
            background: activeTab === "users" ? "#0f172a" : "#ffffff",
            color: activeTab === "users" ? "#f9fafb" : "#111827",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Company users
        </button>
        {canViewCandidates && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("candidates");
              router.replace("/company/users?tab=candidates");
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: activeTab === "candidates" ? "1px solid #0f172a" : "1px solid #d1d5db",
              background: activeTab === "candidates" ? "#0f172a" : "#ffffff",
              color: activeTab === "candidates" ? "#f9fafb" : "#111827",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Prospective candidates
          </button>
        )}
      </div>

      {activeTab === "candidates" && companyId ? (
        <ProspectiveCandidatesPanel companyId={companyId} companyName={companyName} />
      ) : (
        <>
          {/* Members section */}
          <section style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>Members</h2>
        {membersLoading && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading members…</p>
        )}
        {membersError && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>{membersError}</p>
        )}
        {!membersLoading && !membersError && (
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Phone</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>User type</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Global role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Company role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const nameParts = [m.user.firstName, m.user.lastName].filter(Boolean);
                  const displayName = nameParts.length
                    ? nameParts.join(" ")
                    : m.user.email;

                  return (
                    <tr key={m.userId}>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        <a
                          href={`/company/users/${m.user.id}`}
                          style={{
                            color: "#111827",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          {displayName}
                        </a>
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: 12,
                        }}
                      >
                        <a
                          href={`mailto:${m.user.email}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          {m.user.email}
                        </a>
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: 12,
                          color: "#111827",
                        }}
                      >
                        {m.user.phone ? (
                          <a
                            href={`tel:${m.user.phone.replace(/[^\\d+]/g, "")}`}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            {m.user.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {m.user.userType ?? "WORKER"}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {m.user.globalRole ?? "NONE"}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {canManageMembers ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <select
                              value={m.role}
                              onChange={e =>
                                handleChangeRole(
                                  m.userId,
                                  m.role,
                                  e.target.value as CompanyRole,
                                )
                              }
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid #d1d5db",
                                fontSize: 12,
                              }}
                            >
                              <option value="OWNER" disabled={!canGrantOwner}>
                                OWNER
                              </option>
                              <option value="ADMIN">ADMIN</option>
                              <option value="MEMBER">MEMBER</option>
                              <option value="CLIENT">CLIENT</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => openResetPasswordPanel(m.user.email, m.role)}
                              style={{
                                alignSelf: "flex-start",
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                fontSize: 11,
                                color: "#2563eb",
                                textDecoration: "underline",
                                cursor: "pointer",
                              }}
                            >
                              Set / reset password
                            </button>
                          </div>
                        ) : (
                          m.role
                        )}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "8px",
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      No members found for this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invite single user via email link */}
      {canManageMembers && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Invite a single user</h2>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
            Send an invite to a new user by email. They&apos;ll join this
            company with the selected role when they accept the invite.
          </p>
          <form
            onSubmit={handleSingleInvite}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <input
              type="email"
              required
              value={singleEmail}
              onChange={e => setSingleEmail(e.target.value)}
              placeholder="user@example.com"
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <select
              value={singleRole}
              onChange={e => setSingleRole(e.target.value as CompanyRole)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="CLIENT">CLIENT</option>
              <option value="OWNER" disabled={!canGrantOwner}>
                OWNER
              </option>
            </select>
            <button
              type="submit"
              disabled={singleSaving}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: singleSaving ? "#e5e7eb" : "#0f172a",
                color: singleSaving ? "#4b5563" : "#f9fafb",
                cursor: singleSaving ? "default" : "pointer",
              }}
            >
              {singleSaving ? "Sending…" : "Send invite"}
            </button>
          </form>
          {singleError && (
            <p style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>
              {singleError}
            </p>
          )}
          {singleSuccess && (
            <p style={{ marginTop: 4, fontSize: 12, color: "#16a34a" }}>
              {singleSuccess}
            </p>
          )}
        </section>
      )}

      {/* Direct add user with password (SUPER_ADMIN only) */}
      {canManageMembers && actorGlobalRole === "SUPER_ADMIN" && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Quick add user with password</h2>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
            Create a user directly with an email and password in this company. No invite email
            is sent; you can share the <code>/login</code> link and password with them via text
            or email.
          </p>
          <form
            onSubmit={handleCreateUserWithPassword}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <input
              type="email"
              required
              value={createEmail}
              onChange={e => setCreateEmail(e.target.value)}
              placeholder="user@example.com"
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <input
              type="text"
              required
              value={createPassword}
              onChange={e => setCreatePassword(e.target.value)}
              placeholder="Temporary password (min 8 chars)"
              style={{
                minWidth: 200,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <select
              value={createRole}
              onChange={e => setCreateRole(e.target.value as CompanyRole)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="CLIENT">CLIENT</option>
              <option value="OWNER" disabled={!canGrantOwner}>
                OWNER
              </option>
            </select>
            <button
              type="submit"
              disabled={createSaving}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: createSaving ? "#e5e7eb" : "#0f172a",
                color: createSaving ? "#4b5563" : "#f9fafb",
                cursor: createSaving ? "default" : "pointer",
              }}
            >
              {createSaving ? "Creating…" : "Create user"}
            </button>
          </form>
          {createError && (
            <p style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>{createError}</p>
          )}
          {createSuccess && (
            <p style={{ marginTop: 4, fontSize: 12, color: "#16a34a" }}>{createSuccess}</p>
          )}
        </section>
      )}

      {/* Bulk invite via text area */}
      {canManageMembers && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Bulk invite users</h2>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
            Paste one email per line, or <code>email, role</code>. Role may be
            OWNER (owners only), ADMIN, MEMBER, or CLIENT. Lines with an
            invalid role will be skipped.
          </p>
          <form onSubmit={handleBulkInvite}>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={5}
              placeholder={"user1@example.com\nuser2@example.com, ADMIN\nclient@example.com, CLIENT"}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 12,
                fontFamily: "monospace",
              }}
            />
            <div style={{ marginTop: 6, textAlign: "right" }}>
              <button
                type="submit"
                disabled={bulkSaving}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: bulkSaving ? "#e5e7eb" : "#0f172a",
                  color: bulkSaving ? "#4b5563" : "#f9fafb",
                  cursor: bulkSaving ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {bulkSaving ? "Sending invites…" : "Send bulk invites"}
              </button>
            </div>
          </form>
          {bulkResult && (
            <p style={{ marginTop: 4, fontSize: 12, color: "#4b5563" }}>
              {bulkResult}
            </p>
          )}
        </section>
      )}

      {/* Bulk CSV: create users with passwords */}
      {canManageMembers && actorGlobalRole === "SUPER_ADMIN" && (
        <section style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>Bulk add users with password (CSV)</h2>
            <a
              href="/templates/bulk-users-template.csv"
              download
              style={{ fontSize: 11, color: "#2563eb", textDecoration: "none" }}
            >
              Download CSV template
            </a>
          </div>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
            Upload a CSV file to create many users at once. The first row should be a header
            containing at least <code>email</code> and <code>password</code> columns. All
            users will be created as <strong>MEMBER</strong> in this company; you can promote
            them to ADMIN or OWNER later from the Members table.
          </p>
          <form
            onSubmit={handleBulkCsvCreateUsers}
            style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setBulkFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: 12 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="submit"
                disabled={bulkCsvSaving}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: bulkCsvSaving ? "#e5e7eb" : "#0f172a",
                  color: bulkCsvSaving ? "#4b5563" : "#f9fafb",
                  cursor: bulkCsvSaving ? "default" : "pointer",
                }}
              >
                {bulkCsvSaving ? "Processing CSV…" : "Create users from CSV"}
              </button>
            </div>
          </form>
          {bulkCsvResult && (
            <p style={{ marginTop: 4, fontSize: 12, color: "#4b5563" }}>{bulkCsvResult}</p>
          )}
        </section>
      )}

      {/* Invites list */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Invites</h2>
        {invitesLoading && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading invites…</p>
        )}
        {invitesError && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>{invitesError}</p>
        )}
        {!invitesLoading && !invitesError && (
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Sent</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(invite => {
                  const now = Date.now();
                  const exp = new Date(invite.expiresAt).getTime();
                  const isExpired = exp < now && !invite.acceptedAt;
                  const status = invite.acceptedAt
                    ? "Accepted"
                    : isExpired
                    ? "Expired"
                    : "Pending";
                  return (
                    <tr key={invite.id}>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {invite.email}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {canManageMembers ? (
                          <button
                            type="button"
                            onClick={() => openResetPasswordPanel(invite.email, invite.role)}
                            style={{
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              fontSize: 12,
                              color: "#2563eb",
                              textDecoration: "underline",
                              cursor: "pointer",
                            }}
                          >
                            {invite.role}
                          </button>
                        ) : (
                          invite.role
                        )}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: 12,
                          color:
                            status === "Accepted"
                              ? "#16a34a"
                              : status === "Expired"
                              ? "#b91c1c"
                              : "#4b5563",
                        }}
                      >
                        {status}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {invites.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "8px",
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      No invites have been created yet for this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inline reset password panel (appears when you click a role link) */}
      {canManageMembers && resetEmail && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Set / reset password</h2>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
            You are setting a password for <strong>{resetEmail}</strong> in this company.
            Share the <code>/login</code> link and this password with them directly.
          </p>
          <form
            onSubmit={async e => {
              e.preventDefault();
              setResetError(null);
              setResetSuccess(null);

              if (!companyId || !resetEmail) {
                setResetError("Missing company or user context.");
                return;
              }

              const token = window.localStorage.getItem("accessToken");
              if (!token) {
                setResetError("Missing access token. Please log in again.");
                return;
              }

              if (!resetPassword || resetPassword.length < 8) {
                setResetError("Password must be at least 8 characters.");
                return;
              }

              if (resetPassword !== resetPasswordConfirm) {
                setResetError("Passwords do not match.");
                return;
              }

              try {
                setResetSaving(true);
                const res = await fetch(`${API_BASE}/admin/create-user-with-password`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    email: resetEmail,
                    password: resetPassword,
                    companyId,
                    role: resetRole ?? "MEMBER",
                  }),
                });

                if (!res.ok) {
                  const text = await res.text().catch(() => "");
                  throw new Error(`Failed to set password (${res.status}) ${text}`);
                }

                // Refresh members so a previously invited user appears in the list
                const membersRes = await fetch(`${API_BASE}/companies/${companyId}/members`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (membersRes.ok) {
                  const membersJson: CompanyMemberRow[] = await membersRes.json();
                  setMembers(membersJson || []);
                }

                setResetSuccess("Password set successfully. Share it with the user.");
                setResetPassword("");
                setResetPasswordConfirm("");
              } catch (err: any) {
                setResetError(err?.message ?? "Failed to set password.");
              } finally {
                setResetSaving(false);
              }
            }}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              style={{
                minWidth: 200,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={resetPasswordConfirm}
              onChange={e => setResetPasswordConfirm(e.target.value)}
              style={{
                minWidth: 200,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <button
              type="submit"
              disabled={resetSaving}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: resetSaving ? "#e5e7eb" : "#0f172a",
                color: resetSaving ? "#4b5563" : "#f9fafb",
                cursor: resetSaving ? "default" : "pointer",
              }}
            >
              {resetSaving ? "Saving…" : "Set password"}
            </button>
            <button
              type="button"
              onClick={closeResetPasswordPanel}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            {resetError && (
              <span style={{ fontSize: 12, color: "#b91c1c" }}>{resetError}</span>
            )}
            {resetSuccess && (
              <span style={{ fontSize: 12, color: "#16a34a" }}>{resetSuccess}</span>
            )}
          </form>
        </section>
      )}
        </>
      )}
    </div>
  );
}

type CandidateStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | string;

interface CandidateProfile {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dob?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

interface CandidateRow {
  id: string;
  email: string;
  status: CandidateStatus;
  createdAt: string;
  profile?: CandidateProfile | null;
}

function stateToRegion(state: string | null | undefined): string {
  const s = (state || "").trim().toUpperCase();
  const northeast = ["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA"];
  const southeast = ["DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL", "KY", "TN", "MS", "AL", "LA", "AR"];
  const midwest = ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"];
  const southwest = ["TX", "OK", "NM", "AZ"];
  const west = ["CO", "WY", "MT", "ID", "UT", "NV", "CA", "OR", "WA", "AK", "HI"];

  if (!s) return "(unknown)";
  if (northeast.includes(s)) return "Northeast";
  if (southeast.includes(s)) return "Southeast";
  if (midwest.includes(s)) return "Midwest";
  if (southwest.includes(s)) return "Southwest";
  if (west.includes(s)) return "West";
  return "Other";
}

function ProspectiveCandidatesPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("SUBMITTED,UNDER_REVIEW");
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [searchEmail, setSearchEmail] = useState<string>("");

  useEffect(() => {
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const url = `${API_BASE}/onboarding/company/${companyId}/sessions` +
          (statusFilter.trim() ? `?status=${encodeURIComponent(statusFilter.trim())}` : "");

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load candidates (${res.status}) ${text}`);
        }

        const json: CandidateRow[] = await res.json();
        setRows(Array.isArray(json) ? json : []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load candidates");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [companyId, statusFilter]);

  const filtered = rows
    .filter(r => {
      if (searchEmail.trim() && !r.email.toLowerCase().includes(searchEmail.trim().toLowerCase())) {
        return false;
      }
      const st = (r.profile?.state || "").trim();
      const city = (r.profile?.city || "").trim();

      if (stateFilter.trim() && st.toLowerCase() !== stateFilter.trim().toLowerCase()) return false;
      if (cityFilter.trim() && !city.toLowerCase().includes(cityFilter.trim().toLowerCase())) return false;
      if (regionFilter && stateToRegion(st) !== regionFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <section style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Prospective candidates</h2>
      <p style={{ fontSize: 12, color: "#4b5563", marginTop: 0 }}>
        Candidates who have submitted onboarding for <strong>{companyName}</strong>. Filter by region/state/city.
      </p>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#f9fafb",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Status (comma-separated)
          <input
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            placeholder="SUBMITTED,UNDER_REVIEW"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 220 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Region
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 160 }}
          >
            <option value="">All regions</option>
            <option value="Northeast">Northeast</option>
            <option value="Southeast">Southeast</option>
            <option value="Midwest">Midwest</option>
            <option value="Southwest">Southwest</option>
            <option value="West">West</option>
            <option value="Other">Other</option>
            <option value="(unknown)">(unknown)</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          State
          <input
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            placeholder="FL"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", width: 80 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          City
          <input
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            placeholder="Miami"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 160 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Search email
          <input
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            placeholder="name@example.com"
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 220 }}
          />
        </label>

        <div style={{ marginLeft: "auto", color: "#6b7280" }}>
          Showing <strong>{filtered.length}</strong>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>Loading candidates…</p>
      ) : error ? (
        <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 10 }}>{error}</p>
      ) : (
        <div
          style={{
            marginTop: 10,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Candidate</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Region</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>City</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>State</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const nameText =
                    (r.profile?.firstName || r.profile?.lastName)
                      ? `${r.profile?.firstName ?? ""} ${r.profile?.lastName ?? ""}`.trim()
                      : "(no name yet)";

                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                        <div style={{ fontWeight: 600 }}>
                          <a
                            href={`/company/users/candidates/${r.id}`}
                            style={{ color: "#111827", textDecoration: "none" }}
                          >
                            {nameText}
                          </a>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          <a
                            href={`mailto:${r.email}`}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            {r.email}
                          </a>
                        </div>
                        {r.profile?.phone && (
                          <div style={{ fontSize: 12, color: "#111827" }}>{r.profile.phone}</div>
                        )}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                        {stateToRegion(r.profile?.state)}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                        {r.profile?.city || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                        {r.profile?.state || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                        {r.status}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
                      No candidates match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280" }}>
        Next step: well add skill/trade filters and a Solicit workflow (message/invite) once the pool UI stabilizes.
      </div>
    </section>
  );
}
