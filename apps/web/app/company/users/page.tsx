"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatPhone } from "../../lib/phone";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

type CompanyRole = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT";

type GlobalRole = "SUPER_ADMIN" | "NONE" | string;

type UserType = "INTERNAL" | "CLIENT" | "APPLICANT" | string;

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
  // Company users (members) filtering + selection.
  // Default user-type filter is INTERNAL so company users are prefiltered to internal staff.
  const [memberTypeFilter, setMemberTypeFilter] = useState<
    "INTERNAL" | "CLIENT" | "APPLICANT" | "ALL"
  >("INTERNAL");
  const [memberRoleFilter, setMemberRoleFilter] = useState<CompanyRole | "ALL">("ALL");
  const [memberSearchEmail, setMemberSearchEmail] = useState("");
  const [memberSelectedIds, setMemberSelectedIds] = useState<string[]>([]);
  const [memberBulkMenuOpen, setMemberBulkMenuOpen] = useState(false);
  const [memberOpenMenuUserId, setMemberOpenMenuUserId] = useState<string | null>(null);
  const [memberSortKey, setMemberSortKey] = useState<
    "NAME_ASC" | "NAME_DESC" | "EMAIL_ASC" | "EMAIL_DESC" | "ROLE_ASC" | "ROLE_DESC" | "JOINED_ASC" | "JOINED_DESC"
  >("NAME_ASC");

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

  const filteredMembers = useMemo(() => {
    const base = members.filter(m => {
      // User type filter:
      // - INTERNAL   → only INTERNAL users
      // - CLIENT     → only CLIENT users
      // - APPLICANT  → only APPLICANT users
      // - ALL        → no userType filter
      if (memberTypeFilter === "INTERNAL" && m.user.userType !== "INTERNAL") {
        return false;
      }
      if (memberTypeFilter === "CLIENT" && m.user.userType !== "CLIENT") {
        return false;
      }
      if (memberTypeFilter === "APPLICANT" && m.user.userType !== "APPLICANT") {
        return false;
      }

      if (memberRoleFilter !== "ALL" && m.role !== memberRoleFilter) {
        return false;
      }

      if (
        memberSearchEmail.trim() &&
        !m.user.email.toLowerCase().includes(memberSearchEmail.trim().toLowerCase())
      ) {
        return false;
      }

      return true;
    });

    // Apply sorting
    return base.sort((a, b) => {
      if (memberSortKey === "NAME_ASC" || memberSortKey === "NAME_DESC") {
        const aName = `${a.user.firstName || ""} ${a.user.lastName || ""}`.trim().toLowerCase() ||
          a.user.email.toLowerCase();
        const bName = `${b.user.firstName || ""} ${b.user.lastName || ""}`.trim().toLowerCase() ||
          b.user.email.toLowerCase();
        if (aName === bName) return 0;
        const cmp = aName < bName ? -1 : 1;
        return memberSortKey === "NAME_ASC" ? cmp : -cmp;
      }

      if (memberSortKey === "EMAIL_ASC" || memberSortKey === "EMAIL_DESC") {
        const aEmail = a.user.email.toLowerCase();
        const bEmail = b.user.email.toLowerCase();
        if (aEmail === bEmail) return 0;
        const cmp = aEmail < bEmail ? -1 : 1;
        return memberSortKey === "EMAIL_ASC" ? cmp : -cmp;
      }

      if (memberSortKey === "ROLE_ASC" || memberSortKey === "ROLE_DESC") {
        if (a.role === b.role) return 0;
        const cmp = a.role < b.role ? -1 : 1;
        return memberSortKey === "ROLE_ASC" ? cmp : -cmp;
      }

      if (memberSortKey === "JOINED_ASC" || memberSortKey === "JOINED_DESC") {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        const diff = aTime - bTime;
        return memberSortKey === "JOINED_ASC" ? diff : -diff;
      }

      return 0;
    });
  }, [members, memberTypeFilter, memberRoleFilter, memberSearchEmail, memberSortKey]);

  const memberSelectedCount = memberSelectedIds.filter(id =>
    filteredMembers.some(m => m.userId === id),
  ).length;
  const memberAllFilteredSelected =
    filteredMembers.length > 0 && memberSelectedCount === filteredMembers.length;

  function handleMemberToggleSelectAllFiltered() {
    if (memberAllFilteredSelected) {
      setMemberSelectedIds(prev => prev.filter(id => !filteredMembers.some(m => m.userId === id)));
    } else {
      const filteredIds = filteredMembers.map(m => m.userId);
      setMemberSelectedIds(prev => {
        const set = new Set(prev);
        filteredIds.forEach(id => set.add(id));
        return Array.from(set);
      });
    }
  }

  function handleMemberClearSelection() {
    setMemberSelectedIds([]);
  }

  async function handleBulkChangeMemberRole(targetRole: CompanyRole) {
    if (!companyId) return;
    if (!canManageMembers) return;
    if (targetRole === "OWNER" && !canGrantOwner) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token. Please log in again.");
      return;
    }

    const selected = filteredMembers.filter(m => memberSelectedIds.includes(m.userId));
    if (!selected.length) {
      alert("Select at least one company user.");
      return;
    }

    if (
      !window.confirm(
        `Change company role to ${targetRole} for ${selected.length} user${
          selected.length > 1 ? "s" : ""
        }?`,
      )
    ) {
      return;
    }

    try {
      await Promise.all(
        selected.map(async m => {
          if (m.role === targetRole) return;
          const res = await fetch(
            `${API_BASE}/companies/${companyId}/members/${m.userId}/role`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ role: targetRole }),
            },
          );
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(
              `Failed to update role for ${m.user.email} (${m.userId}):`,
              res.status,
              text,
            );
          }
        }),
      );

      setMembers(prev =>
        prev.map(m =>
          memberSelectedIds.includes(m.userId)
            ? {
                ...m,
                role: targetRole,
              }
            : m,
        ),
      );
    } catch (err: any) {
      alert(err?.message ?? "Failed to update roles in bulk.");
    }
  }

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

  const handleChangeUserType = async (
    userId: string,
    currentUserType: UserType,
    nextUserType: UserType,
  ) => {
    if (nextUserType === currentUserType) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/${userId}/user-type`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userType: nextUserType }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(`Failed to update user type (${res.status}) ${text}`);
        return;
      }
      setMembers(prev =>
        prev.map(m =>
          m.userId === userId
            ? {
                ...m,
                user: { ...m.user, userType: nextUserType },
              }
            : m,
        ),
      );
    } catch (err: any) {
      alert(err?.message ?? "Failed to update user type.");
    }
  };

  const handleChangeGlobalRole = async (
    userId: string,
    currentGlobalRole: GlobalRole,
    nextGlobalRole: GlobalRole,
  ) => {
    if (nextGlobalRole === currentGlobalRole) return;
    if (actorGlobalRole !== "SUPER_ADMIN") {
      alert("Only SUPER_ADMIN can change global roles.");
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/${userId}/global-role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ globalRole: nextGlobalRole }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(`Failed to update global role (${res.status}) ${text}`);
        return;
      }
      setMembers(prev =>
        prev.map(m =>
          m.userId === userId
            ? {
                ...m,
                user: { ...m.user, globalRole: nextGlobalRole },
              }
            : m,
        ),
      );
    } catch (err: any) {
      alert(err?.message ?? "Failed to update global role.");
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
          <section
            style={{ marginTop: 16 }}
            onClick={() => {
              // Close any open per-member actions menu when clicking outside.
              if (memberOpenMenuUserId) {
                setMemberOpenMenuUserId(null);
              }
            }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>Members</h2>
            <p style={{ fontSize: 12, color: "#4b5563", marginTop: 0 }}>
              Company users are prefiltered to <strong>Internal</strong> (non-client) users. Use the
              filters below to change what you see or to bulk-update roles.
            </p>
            <div
              style={{
                marginTop: 8,
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
                User type
                <select
                  value={memberTypeFilter}
                  onChange={e => setMemberTypeFilter(e.target.value as any)}
                  style={{
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    minWidth: 160,
                  }}
> 
                  <option value="INTERNAL">Internal only</option>
                  <option value="CLIENT">Client only</option>
                  <option value="APPLICANT">Applicant only</option>
                  <option value="ALL">All users</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                Company role
                <select
                  value={memberRoleFilter}
                  onChange={e => setMemberRoleFilter(e.target.value as any)}
                  style={{
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    minWidth: 160,
                  }}
                >
                  <option value="ALL">All roles</option>
                  <option value="OWNER">OWNER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="CLIENT">CLIENT</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                Search email
                <input
                  value={memberSearchEmail}
                  onChange={e => setMemberSearchEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    minWidth: 220,
                  }}
                />
              </label>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  alignItems: "flex-end",
                }}
              >
                <div style={{ color: "#6b7280" }}>
                  Showing <strong>{filteredMembers.length}</strong> · Selected{' '}
                  <strong>{memberSelectedCount}</strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleMemberToggleSelectAllFiltered}
                    disabled={filteredMembers.length === 0}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor:
                        filteredMembers.length === 0 ? "#f9fafb" : "#ffffff",
                      color: "#111827",
                      fontSize: 11,
                      cursor: filteredMembers.length === 0 ? "default" : "pointer",
                    }}
                  >
                    {memberAllFilteredSelected
                      ? "Deselect all (filtered)"
                      : "Select all (filtered)"}
                  </button>
                  <button
                    type="button"
                    onClick={handleMemberClearSelection}
                    disabled={memberSelectedCount === 0}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      backgroundColor:
                        memberSelectedCount === 0 ? "#f9fafb" : "#ffffff",
                      color: memberSelectedCount === 0 ? "#9ca3af" : "#111827",
                      fontSize: 11,
                      cursor: memberSelectedCount === 0 ? "default" : "pointer",
                    }}
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            </div>

            {membersLoading && (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Loading members…</p>
            )}
            {membersError && (
              <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>{membersError}</p>
            )}
            {!membersLoading && !membersError && (
              <div
                style={{
                  marginTop: 10,
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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setMemberSortKey(prev =>
                          prev === "NAME_ASC" ? "NAME_DESC" : "NAME_ASC",
                        )
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: "inherit",
                        cursor: "pointer",
                        color: "#111827",
                      }}
                    >
                      <span>Name</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {memberSortKey === "NAME_ASC"
                          ? "↑"
                          : memberSortKey === "NAME_DESC"
                          ? "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setMemberSortKey(prev =>
                          prev === "EMAIL_ASC" ? "EMAIL_DESC" : "EMAIL_ASC",
                        )
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: "inherit",
                        cursor: "pointer",
                        color: "#111827",
                      }}
                    >
                      <span>Email</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {memberSortKey === "EMAIL_ASC"
                          ? "↑"
                          : memberSortKey === "EMAIL_DESC"
                          ? "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Phone</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>User type</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Global role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setMemberSortKey(prev =>
                          prev === "ROLE_ASC" ? "ROLE_DESC" : "ROLE_ASC",
                        )
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: "inherit",
                        cursor: "pointer",
                        color: "#111827",
                      }}
                    >
                      <span>Company role</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {memberSortKey === "ROLE_ASC"
                          ? "↑"
                          : memberSortKey === "ROLE_DESC"
                          ? "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setMemberSortKey(prev =>
                          prev === "JOINED_ASC" ? "JOINED_DESC" : "JOINED_ASC",
                        )
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: "inherit",
                        cursor: "pointer",
                        color: "#111827",
                      }}
                    >
                      <span>Joined</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {memberSortKey === "JOINED_ASC"
                          ? "↑"
                          : memberSortKey === "JOINED_DESC"
                          ? "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>
                    <span style={{ visibility: "hidden" }}>Actions</span>
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "6px 8px",
                      position: "relative",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <button
                        type="button"
                        aria-label="Bulk actions for selected company users"
                        onClick={() => setMemberBulkMenuOpen(open => !open)}
                        style={{
                          padding: "0 8px 2px 8px",
                          borderRadius: 9999,
                          border: "1px solid #2563eb",
                          backgroundColor: "#ffffff",
                          color: "#2563eb",
                          fontSize: 16,
                          lineHeight: "16px",
                          cursor:
                            filteredMembers.length === 0 ? "default" : "pointer",
                        }}
                        disabled={filteredMembers.length === 0}
                      >
                        ...
                      </button>
                      <input
                        type="checkbox"
                        aria-label="Select all company users in current filter"
                        checked={
                          memberAllFilteredSelected && filteredMembers.length > 0
                        }
                        disabled={filteredMembers.length === 0}
                        onChange={handleMemberToggleSelectAllFiltered}
                      />
                    </div>
                    {memberBulkMenuOpen && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "100%",
                          marginTop: 4,
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                          backgroundColor: "#ffffff",
                          boxShadow:
                            "0 4px 6px -1px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.1)",
                          minWidth: 220,
                          zIndex: 15,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            setMemberBulkMenuOpen(false);
                            await handleBulkChangeMemberRole("ADMIN");
                          }}
                          disabled={memberSelectedCount === 0}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            padding: "6px 10px",
                            border: "none",
                            background:
                              memberSelectedCount === 0 ? "#f9fafb" : "#ffffff",
                            color:
                              memberSelectedCount === 0 ? "#9ca3af" : "#111827",
                            cursor:
                              memberSelectedCount === 0 ? "default" : "pointer",
                            fontSize: 12,
                            textAlign: "left",
                          }}
                        >
                          <span>Set role to ADMIN</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setMemberBulkMenuOpen(false);
                            await handleBulkChangeMemberRole("MEMBER");
                          }}
                          disabled={memberSelectedCount === 0}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            padding: "6px 10px",
                            borderTop: "1px solid #e5e7eb",
                            borderBottom: "1px solid #e5e7eb",
                            borderLeft: "none",
                            borderRight: "none",
                            background:
                              memberSelectedCount === 0 ? "#f9fafb" : "#ffffff",
                            color:
                              memberSelectedCount === 0 ? "#9ca3af" : "#111827",
                            cursor:
                              memberSelectedCount === 0 ? "default" : "pointer",
                            fontSize: 12,
                            textAlign: "left",
                          }}
                        >
                          <span>Set role to MEMBER</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setMemberBulkMenuOpen(false);
                            await handleBulkChangeMemberRole("CLIENT");
                          }}
                          disabled={memberSelectedCount === 0}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            width: "100%",
                            padding: "6px 10px",
                            border: "none",
                            background:
                              memberSelectedCount === 0 ? "#f9fafb" : "#ffffff",
                            color:
                              memberSelectedCount === 0 ? "#9ca3af" : "#111827",
                            cursor:
                              memberSelectedCount === 0 ? "default" : "pointer",
                            fontSize: 12,
                            textAlign: "left",
                          }}
                        >
                          <span>Set role to CLIENT</span>
                        </button>
                        {canGrantOwner && (
                          <button
                            type="button"
                            onClick={async () => {
                              setMemberBulkMenuOpen(false);
                              await handleBulkChangeMemberRole("OWNER");
                            }}
                            disabled={memberSelectedCount === 0}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              width: "100%",
                              padding: "6px 10px",
                              borderTop: "1px solid #e5e7eb",
                              borderLeft: "none",
                              borderRight: "none",
                              background:
                                memberSelectedCount === 0 ? "#f9fafb" : "#ffffff",
                              color:
                                memberSelectedCount === 0 ? "#9ca3af" : "#111827",
                              cursor:
                                memberSelectedCount === 0 ? "default" : "pointer",
                              fontSize: 12,
                              textAlign: "left",
                            }}
                          >
                            <span>Set role to OWNER</span>
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(m => {
                  const nameParts = [m.user.firstName, m.user.lastName].filter(Boolean);
                  const displayName = nameParts.length
                    ? nameParts.join(" ")
                    : m.user.email;
                  const isSelected = memberSelectedIds.includes(m.userId);

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
                        {(() => {
                          const formatted = formatPhone(m.user.phone, undefined);
                          if (!formatted) return "—";
                          return (
                            <a
                              href={formatted.href}
                              style={{ color: "#2563eb", textDecoration: "none" }}
                            >
                              {formatted.display}
                            </a>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {canManageMembers ? (
                          <select
                            value={m.user.userType}
                            onChange={e =>
                              handleChangeUserType(
                                m.user.id,
                                m.user.userType,
                                e.target.value as UserType,
                              )
                            }
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          >
                            <option value="INTERNAL">INTERNAL</option>
                            <option value="CLIENT">CLIENT</option>
                            <option value="APPLICANT">APPLICANT</option>
                          </select>
                        ) : (
                          m.user.userType ?? "INTERNAL"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {actorGlobalRole === "SUPER_ADMIN" ? (
                          <select
                            value={m.user.globalRole ?? "NONE"}
                            onChange={e =>
                              handleChangeGlobalRole(
                                m.user.id,
                                m.user.globalRole ?? "NONE",
                                e.target.value as GlobalRole,
                              )
                            }
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          >
                            <option value="NONE">NONE</option>
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                            <option value="SUPPORT">SUPPORT</option>
                          </select>
                        ) : (
                          m.user.globalRole ?? "NONE"
                        )}
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
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                          position: "relative",
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Actions for this company user"
                          onClick={e => {
                            e.stopPropagation();
                            setMemberOpenMenuUserId(prev =>
                              prev === m.userId ? null : m.userId,
                            );
                          }}
                          style={{
                            padding: "0 8px 2px 8px",
                            borderRadius: 9999,
                            border: "1px solid #d1d5db",
                            backgroundColor: "#ffffff",
                            color: "#111827",
                            fontSize: 14,
                            lineHeight: "14px",
                            cursor: "pointer",
                          }}
                        >
                          ...
                        </button>
                        {memberOpenMenuUserId === m.userId && (
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "100%",
                              marginTop: 4,
                              borderRadius: 6,
                              border: "1px solid #e5e7eb",
                              backgroundColor: "#ffffff",
                              boxShadow:
                                "0 4px 6px -1px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.1)",
                              minWidth: 200,
                              zIndex: 20,
                              overflow: "hidden",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMemberOpenMenuUserId(null);
                                window.location.href = `/company/users/${m.user.id}`;
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                width: "100%",
                                padding: "6px 10px",
                                border: "none",
                                background: "#ffffff",
                                color: "#111827",
                                cursor: "pointer",
                                fontSize: 12,
                                textAlign: "left",
                              }}
                            >
                              <span>View profile</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMemberOpenMenuUserId(null);
                                const to = encodeURIComponent(m.user.email);
                                window.location.href = `/messaging?to=${to}`;
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                width: "100%",
                                padding: "6px 10px",
                                borderTop: "1px solid #e5e7eb",
                                borderBottom: "1px solid #e5e7eb",
                                borderLeft: "none",
                                borderRight: "none",
                                background: "#ffffff",
                                color: "#111827",
                                cursor: "pointer",
                                fontSize: 12,
                                textAlign: "left",
                              }}
                            >
                              <span>Message</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMemberOpenMenuUserId(null);
                                window.location.href = `/company/users/${m.user.id}#journal`;
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                width: "100%",
                                padding: "6px 10px",
                                border: "none",
                                background: "#ffffff",
                                color: "#111827",
                                cursor: "pointer",
                                fontSize: 12,
                                textAlign: "left",
                              }}
                            >
                              <span>Journal</span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "4px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label="Select this company user"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setMemberSelectedIds(prev =>
                                prev.includes(m.userId) ? prev : [...prev, m.userId],
                              );
                            } else {
                              setMemberSelectedIds(prev =>
                                prev.filter(id => id !== m.userId),
                              );
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "8px",
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      No members match the current filters.
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

interface CandidatesBroadcastRecipient {
  email: string;
  userId?: string | null;
}

function CandidatesBroadcastModal({
  recipients,
  onClose,
}: {
  recipients: CandidatesBroadcastRecipient[];
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [links, setLinks] = useState<{ url: string; label?: string }[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const uniqueEmails = Array.from(
    new Set(
      recipients
        .map(r => (r.email || "").trim())
        .filter((v): v is string => !!v && typeof v === "string"),
    ),
  );

  const journalSubjectUserIds = Array.from(
    new Set(
      recipients
        .map(r => r.userId)
        .filter((v): v is string => !!v && typeof v === "string"),
    ),
  );

  function handleAddLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinks(prev => [...prev, { url, label: linkLabel.trim() || undefined }]);
    setLinkUrl("");
    setLinkLabel("");
  }

  function handleRemoveLink(url: string) {
    setLinks(prev => prev.filter(l => l.url !== url));
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!body.trim()) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }
    if (!uniqueEmails.length) {
      setError("No valid recipient email addresses.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const attachments =
        links.length > 0
          ? links.map(l => ({
              kind: "EXTERNAL_LINK",
              url: l.url,
              filename: l.label || null,
            }))
          : undefined;

      const res = await fetch(`${API_BASE}/messages/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: subject.trim() || null,
          body: body.trim(),
          participantUserIds: [],
          toExternalEmails: [],
          ccExternalEmails: [],
          bccExternalEmails: uniqueEmails,
          externalEmails: uniqueEmails,
          groupIds: [],
          journalSubjectUserIds: journalSubjectUserIds.length
            ? journalSubjectUserIds
            : undefined,
          attachments,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to send message (${res.status}) ${text}`);
      }

      setSuccessMessage("Message sent to selected candidates.");
      setSubject("");
      setBody("");
      setLinks([]);
      setLinkUrl("");
      setLinkLabel("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send message.");
    } finally {
      setSubmitting(false);
    }
  }

  const previewEmails = uniqueEmails.slice(0, 3);
  const extraCount = uniqueEmails.length - previewEmails.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Send update to selected candidates</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Sending to <strong>{uniqueEmails.length}</strong> candidate
          {uniqueEmails.length === 1 ? "" : "s"}.
          {previewEmails.length > 0 && (
            <>
              {" "}Example recipients: {previewEmails.join(", ")}
              {extraCount > 0 && `, +${extraCount} more`}
            </>
          )}
        </p>

        {error && (
          <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>Error: {error}</p>
        )}
        {successMessage && (
          <p style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>{successMessage}</p>
        )}

        {!successMessage && (
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
          >
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject (optional)"
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
              placeholder="Write a note or update to send to these candidates"
              rows={4}
              style={{
                padding: "6px 8px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #d1d5db",
                resize: "vertical",
              }}
            />

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
                          onClick={() => handleRemoveLink(l.url)}
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
                    onClick={handleAddLink}
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  fontSize: 11,
                  cursor: submitting ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !body.trim() || uniqueEmails.length === 0}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "none",
                  backgroundColor:
                    submitting || !body.trim() || uniqueEmails.length === 0
                      ? "#9ca3af"
                      : "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor:
                    submitting || !body.trim() || uniqueEmails.length === 0
                      ? "default"
                      : "pointer",
                }}
              >
                {submitting ? "Sending…" : "Send message"}
              </button>
            </div>
          </form>
        )}

        {successMessage && (
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
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
  | "TEST"
  | string;

interface CandidateDetailStatusDef {
  id: string;
  code: string;
  label: string;
  color?: string | null;
}

interface CandidateProfile {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dob?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

interface CandidateChecklist {
  profileComplete?: boolean;
  photoUploaded?: boolean;
  govIdUploaded?: boolean;
  skillsComplete?: boolean;
  [key: string]: any;
}

interface CandidateRow {
  id: string;
  email: string;
  status: CandidateStatus;
  createdAt: string;
  profile?: CandidateProfile | null;
  checklist?: CandidateChecklist | null;
  detailStatusCode?: string | null;
  userId?: string | null; // underlying User.id when available (for journaling)
}

interface FortifiedCandidateRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  createdAt?: string | null;
  referrerEmail?: string | null;
}

function computeProfilePercentFromChecklist(checklist: CandidateChecklist | null | undefined): number | null {
  if (!checklist) return null;
  const keys: (keyof CandidateChecklist)[] = [
    "profileComplete",
    "photoUploaded",
    "govIdUploaded",
    "skillsComplete",
  ];
  const completed = keys.filter(k => !!checklist[k]).length;
  // Start at a baseline of 10% once we have a checklist for this candidate,
  // then increase based on how many key steps are complete.
  const raw = Math.round((completed / keys.length) * 100);
  if (!Number.isFinite(raw)) return null;
  return Math.max(10, raw);
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

  // Nex-Net shared pool for Nexus Fortified Structures.
  const [fortifiedRows, setFortifiedRows] = useState<FortifiedCandidateRow[] | null>(null);
  const [fortifiedLoading, setFortifiedLoading] = useState(false);
  const [fortifiedError, setFortifiedError] = useState<string | null>(null);

  // Pipeline status filter (OnboardingStatus)
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  // Optional admin-defined candidate detail status codes
  const [detailStatusOptions, setDetailStatusOptions] = useState<CandidateDetailStatusDef[]>([]);
  const [detailStatusFilter, setDetailStatusFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [searchEmail, setSearchEmail] = useState<string>("");
  const [submittedFrom, setSubmittedFrom] = useState<string>("");
  const [submittedTo, setSubmittedTo] = useState<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<
    | "NAME_ASC"
    | "NAME_DESC"
    | "REGION_ASC"
    | "REGION_DESC"
    | "CITY_ASC"
    | "CITY_DESC"
    | "STATE_ASC"
    | "STATE_DESC"
    | "STATUS_ASC"
    | "STATUS_DESC"
    | "PROFILE_ASC"
    | "PROFILE_DESC"
    | "SUBMITTED_ASC"
    | "SUBMITTED_DESC"
  >("SUBMITTED_DESC");
  const [showBulkJournalPanel, setShowBulkJournalPanel] = useState(false);
  const [bulkJournalText, setBulkJournalText] = useState("");
  const [bulkJournalSaving, setBulkJournalSaving] = useState(false);
  const [showBulkMessageModal, setShowBulkMessageModal] = useState(false);
  const [bulkMessageRecipients, setBulkMessageRecipients] = useState<
    { email: string; userId?: string | null }[] | null
  >(null);

  const isFortifiedCompany = companyName
    .toLowerCase()
    .startsWith("nexus fortified structures");

  // Load candidate status definitions (global + company) once when tab is candidates
  useEffect(() => {
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    async function loadStatusDefs() {
      try {
        const res = await fetch(
          `${API_BASE}/onboarding/company/${companyId}/status-definitions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!Array.isArray(json)) return;
        setDetailStatusOptions(
          json.map((d: any) => ({
            id: d.id,
            code: d.code,
            label: d.label,
            color: d.color ?? null,
          })),
        );
      } catch {
        // non-fatal
      }
    }

    void loadStatusDefs();
  }, [companyId]);

  useEffect(() => {
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    // For Nexus Fortified, also load the shared Nex-Net pool that has been
    // explicitly made visible to this tenant.
    if (isFortifiedCompany) {
      let cancelled = false;
      (async () => {
        try {
          setFortifiedLoading(true);
          setFortifiedError(null);
          const res = await fetch(`${API_BASE}/referrals/fortified/candidates`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // In environments where the Nex-Net API is not yet deployed, treat
          // 404 as "no shared Nex-Net candidates" instead of surfacing a
          // noisy error banner to end-users.
          if (res.status === 404) {
            if (!cancelled) {
              setFortifiedRows([]);
            }
            return;
          }

          if (!res.ok) {
            throw new Error(
              `Failed to load shared Nex-Net candidates (${res.status})`,
            );
          }

          const json: any[] = await res.json();
          if (cancelled) return;
          const mapped: FortifiedCandidateRow[] = (json || []).map((c: any) => {
            const latestReferral = (c.referralsAsReferee || [])[0];
            return {
              id: c.id,
              firstName: c.firstName ?? null,
              lastName: c.lastName ?? null,
              email: c.email ?? c.user?.email ?? null,
              phone: c.phone ?? null,
              source: c.source ?? null,
              status: c.status ?? null,
              createdAt: c.createdAt ?? null,
              referrerEmail: latestReferral?.referrer?.email ?? null,
            };
          });
          setFortifiedRows(mapped);
        } catch (e: any) {
          if (!cancelled) {
            setFortifiedError(e?.message ?? "Failed to load shared Nex-Net candidates.");
          }
        } finally {
          if (!cancelled) {
            setFortifiedLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        let statusesParam = "";
        // For ALL / ALL_WITH_TEST we fetch all statuses and filter TEST locally.
        if (statusFilter !== "ALL" && statusFilter !== "ALL_WITH_TEST") {
          statusesParam = statusFilter;
        }

        const params = new URLSearchParams();
        if (statusesParam) {
          params.set("status", statusesParam);
        }
        if (detailStatusFilter.trim()) {
          params.set("detailStatusCode", detailStatusFilter.trim());
        }

        const basePath =
          isFortifiedCompany
            ? `${API_BASE}/onboarding/company/${companyId}/prospects`
            : `${API_BASE}/onboarding/company/${companyId}/sessions`;

        const url = basePath + (params.toString() ? `?${params.toString()}` : "");

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
  }, [companyId, statusFilter, detailStatusFilter]);

  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const st = (r.profile?.state || "").trim();
      if (!st) continue;
      if (regionFilter && stateToRegion(st) !== regionFilter) continue;
      set.add(st);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, regionFilter]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const st = (r.profile?.state || "").trim();
      const city = (r.profile?.city || "").trim();
      if (!city) continue;
      if (regionFilter && stateToRegion(st) !== regionFilter) continue;
      if (stateFilter.trim() && st.toLowerCase() !== stateFilter.trim().toLowerCase()) continue;
      set.add(city);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, regionFilter, stateFilter]);

  const filtered = rows
    .filter(r => {
      if (
        searchEmail.trim() &&
        !r.email.toLowerCase().includes(searchEmail.trim().toLowerCase())
      ) {
        return false;
      }

      // Hide TEST sessions only when Status filter is "ALL"; other modes either
      // include TEST explicitly or narrow to a specific status.
      const hideTest = statusFilter === "ALL";
      if (hideTest && r.status === "TEST") return false;
      const st = (r.profile?.state || "").trim();
      const city = (r.profile?.city || "").trim();

      if (stateFilter.trim() && st.toLowerCase() !== stateFilter.trim().toLowerCase()) return false;
      if (cityFilter.trim() && !city.toLowerCase().includes(cityFilter.trim().toLowerCase()))
        return false;
      if (regionFilter && stateToRegion(st) !== regionFilter) return false;

      // Submitted date range filter
      if (submittedFrom.trim() || submittedTo.trim()) {
        const createdTime = new Date(r.createdAt).getTime();
        if (!Number.isFinite(createdTime)) return false;
        if (submittedFrom.trim()) {
          const fromTime = new Date(`${submittedFrom.trim()}T00:00:00`).getTime();
          if (Number.isFinite(fromTime) && createdTime < fromTime) return false;
        }
        if (submittedTo.trim()) {
          const toTime = new Date(`${submittedTo.trim()}T23:59:59`).getTime();
          if (Number.isFinite(toTime) && createdTime > toTime) return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      if (sortMode === "SUBMITTED_ASC" || sortMode === "SUBMITTED_DESC") {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        const diff = aTime - bTime;
        return sortMode === "SUBMITTED_ASC" ? diff : -diff;
      }

      if (sortMode === "PROFILE_ASC" || sortMode === "PROFILE_DESC") {
        const aPct = computeProfilePercentFromChecklist(a.checklist) ?? -1;
        const bPct = computeProfilePercentFromChecklist(b.checklist) ?? -1;
        if (aPct === bPct) return 0;
        const diff = aPct - bPct;
        return sortMode === "PROFILE_ASC" ? diff : -diff;
      }

      if (sortMode === "REGION_ASC" || sortMode === "REGION_DESC") {
        const aRegion = stateToRegion(a.profile?.state).toLowerCase();
        const bRegion = stateToRegion(b.profile?.state).toLowerCase();
        if (aRegion === bRegion) return 0;
        const cmp = aRegion < bRegion ? -1 : 1;
        return sortMode === "REGION_ASC" ? cmp : -cmp;
      }

      if (sortMode === "CITY_ASC" || sortMode === "CITY_DESC") {
        const aCity = (a.profile?.city || "").trim().toLowerCase();
        const bCity = (b.profile?.city || "").trim().toLowerCase();
        if (aCity === bCity) return 0;
        const cmp = aCity < bCity ? -1 : 1;
        return sortMode === "CITY_ASC" ? cmp : -cmp;
      }

      if (sortMode === "STATE_ASC" || sortMode === "STATE_DESC") {
        const aState = (a.profile?.state || "").trim().toLowerCase();
        const bState = (b.profile?.state || "").trim().toLowerCase();
        if (aState === bState) return 0;
        const cmp = aState < bState ? -1 : 1;
        return sortMode === "STATE_ASC" ? cmp : -cmp;
      }

      if (sortMode === "STATUS_ASC" || sortMode === "STATUS_DESC") {
        const aStatus = (a.status || "").toLowerCase();
        const bStatus = (b.status || "").toLowerCase();
        if (aStatus === bStatus) return 0;
        const cmp = aStatus < bStatus ? -1 : 1;
        return sortMode === "STATUS_ASC" ? cmp : -cmp;
      }

      // Default: sort by candidate name (last, first, then email).
      const aLast = (a.profile?.lastName || "").trim().toLowerCase();
      const bLast = (b.profile?.lastName || "").trim().toLowerCase();
      const aFirst = (a.profile?.firstName || "").trim().toLowerCase();
      const bFirst = (b.profile?.firstName || "").trim().toLowerCase();

      let cmpName = 0;
      if (aLast || bLast) {
        if (aLast !== bLast) {
          cmpName = aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
        }
      }
      if (cmpName === 0 && (aFirst || bFirst)) {
        if (aFirst !== bFirst) {
          cmpName = aFirst < bFirst ? -1 : aFirst > bFirst ? 1 : 0;
        }
      }
      if (cmpName === 0) {
        cmpName = a.email.toLowerCase().localeCompare(b.email.toLowerCase());
      }
      return sortMode === "NAME_ASC" ? cmpName : -cmpName;
    });

  const selectedCount = selectedIds.filter(id => filtered.some(r => r.id === id)).length;
  const allFilteredSelected = filtered.length > 0 && selectedCount === filtered.length;

  function handleToggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds(prev => prev.filter(id => !filtered.some(r => r.id === id)));
    } else {
      const filteredIds = filtered.map(r => r.id);
      setSelectedIds(prev => {
        const set = new Set(prev);
        filteredIds.forEach(id => set.add(id));
        return Array.from(set);
      });
    }
  }

  function handleClearSelection() {
    setSelectedIds([]);
  }

  async function handleBulkMarkTest() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token. Please log in again.");
      return;
    }
    const selected = filtered.filter(r => selectedIds.includes(r.id));
    if (!selected.length) {
      alert("Select at least one candidate.");
      return;
    }
    if (!window.confirm(`Mark ${selected.length} candidate${selected.length > 1 ? "s" : ""} as TEST?`)) {
      return;
    }
    try {
      await Promise.all(
        selected.map(async r => {
          const res = await fetch(`${API_BASE}/onboarding/sessions/${r.id}/mark-test`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`Failed to mark session ${r.id} as TEST:`, res.status, text);
          }
        }),
      );
      setRows(prev =>
        prev.map(row =>
          selectedIds.includes(row.id)
            ? { ...row, status: "TEST" as CandidateStatus }
            : row,
        ),
      );
    } catch (e: any) {
      alert(e?.message ?? "Failed to mark candidates as TEST");
    }
  }

  async function handleBulkJournalEntry(note: string) {
    if (typeof window === "undefined") return;
    const trimmed = note.trim();
    if (!trimmed) return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token. Please log in again.");
      return;
    }
    const selected = filtered.filter(r => selectedIds.includes(r.id) && r.userId);
    if (!selected.length) {
      alert("No selected candidates have an associated user profile yet.");
      return;
    }
    try {
      setBulkJournalSaving(true);
      await Promise.all(
        selected.map(async r => {
          const res = await fetch(`${API_BASE}/messages/journal/user/${r.userId}/entries`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ body: trimmed }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`Failed to add journal entry for user ${r.userId}:`, res.status, text);
          }
        }),
      );
      alert("Journal entry added for selected candidates.");
      setBulkJournalText("");
      setShowBulkJournalPanel(false);
    } catch (e: any) {
      alert(e?.message ?? "Failed to add journal entries");
    } finally {
      setBulkJournalSaving(false);
    }
  }

  function handleBulkMessageToSelected() {
    const selectedRows = filtered.filter(r => selectedIds.includes(r.id));
    if (!selectedRows.length) {
      alert("Select at least one candidate.");
      return;
    }

    const recipients = selectedRows
      .map(r => ({ email: r.email.trim(), userId: r.userId ?? null }))
      .filter(r => !!r.email);

    const uniqueByEmail = new Map<string, { email: string; userId: string | null }>();
    for (const r of recipients) {
      const existing = uniqueByEmail.get(r.email);
      if (!existing) {
        uniqueByEmail.set(r.email, { email: r.email, userId: r.userId ?? null });
      } else if (!existing.userId && r.userId) {
        uniqueByEmail.set(r.email, { email: r.email, userId: r.userId });
      }
    }

    const finalRecipients = Array.from(uniqueByEmail.values());
    if (!finalRecipients.length) {
      alert("No valid email addresses found for selected candidates.");
      return;
    }

    setBulkMessageRecipients(finalRecipients);
    setShowBulkMessageModal(true);
  }

  return (
    <section style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Prospective candidates</h2>
      <p style={{ fontSize: 12, color: "#4b5563", marginTop: 0 }}>
        Candidates who have submitted onboarding for <strong>{companyName}</strong>. Filter by region/state/city.
      </p>

      {isFortifiedCompany && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <h3 style={{ fontSize: 14, marginTop: 0, marginBottom: 4 }}>
            Nex-Net pool candidates shared with Nexus Fortified
          </h3>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 6 }}>
            Prospective candidates from the central Nexus System recruiting pool that are explicitly visible to
            Nexus Fortified Structures.
          </p>
          {fortifiedLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading shared Nex-Net candidates…</p>
          )}
          {fortifiedError && !fortifiedLoading && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{fortifiedError}</p>
          )}
          {!fortifiedLoading && !fortifiedError && (!fortifiedRows || fortifiedRows.length === 0) && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>No shared Nex-Net candidates yet.</p>
          )}
          {!fortifiedLoading && !fortifiedError && fortifiedRows && fortifiedRows.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 4 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Candidate</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Phone</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Referrer</th>
                  </tr>
                </thead>
                <tbody>
                  {fortifiedRows.map(row => {
                    const name = (row.firstName || row.lastName)
                      ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim()
                      : "—";
                    return (
                      <tr key={row.id}>
                        <td style={{ padding: "4px 6px", borderTop: "1px solid #e5e7eb" }}>{name}</td>
                        <td style={{ padding: "4px 6px", borderTop: "1px solid #e5e7eb" }}>
                          {row.email ? (
                            <a
                              href={`mailto:${row.email}`}
                              style={{ color: "#2563eb", textDecoration: "none" }}
                            >
                              {row.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "4px 6px", borderTop: "1px solid #e5e7eb" }}>
                          {row.phone ? (
                            <a
                              href={`tel:${row.phone.replace(/[^\\d+]/g, "")}`}
                              style={{ color: "#6b7280", textDecoration: "none" }}
                            >
                              {row.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "4px 6px", borderTop: "1px solid #e5e7eb" }}>
                          {row.source || "—"}
                        </td>
                        <td style={{ padding: "4px 6px", borderTop: "1px solid #e5e7eb" }}>
                          {row.status || "—"}
                        </td>
                        <td style={{ padding: "4px 6px", borderTop: "1px solid #e5e7eb" }}>
                          {row.referrerEmail ? (
                            <a
                              href={`mailto:${row.referrerEmail}`}
                              style={{ color: "#2563eb", textDecoration: "none" }}
                            >
                              {row.referrerEmail}
                            </a>
                          ) : (
                            "—"
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
      )}

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
          Status
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 200 }}
          >
            <option value="ALL">All (non-TEST)</option>
            <option value="ALL_WITH_TEST">All (including TEST)</option>
            <option value="TEST">TEST only</option>
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Candidate status
          <select
            value={detailStatusFilter}
            onChange={e => setDetailStatusFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 200 }}
          >
            <option value="">All states</option>
            {detailStatusOptions.map(s => (
              <option key={s.id} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
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
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 100 }}
          >
            <option value="">All states</option>
            {stateOptions.map(st => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          City
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", minWidth: 160 }}
          >
            <option value="">All cities</option>
            {cityOptions.map(city => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Submitted from
          <input
            type="date"
            value={submittedFrom}
            onChange={e => setSubmittedFrom(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          Submitted to
          <input
            type="date"
            value={submittedTo}
            onChange={e => setSubmittedTo(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db" }}
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

        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <div style={{ color: "#6b7280" }}>
            Showing <strong>{filtered.length}</strong> · Selected <strong>{selectedCount}</strong>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleToggleSelectAllFiltered}
              disabled={filtered.length === 0}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                backgroundColor: filtered.length === 0 ? "#f9fafb" : "#ffffff",
                color: "#111827",
                fontSize: 11,
                cursor: filtered.length === 0 ? "default" : "pointer",
              }}
            >
              {allFilteredSelected ? "Deselect all (filtered)" : "Select all (filtered)"}
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              disabled={selectedCount === 0}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                backgroundColor: selectedCount === 0 ? "#f9fafb" : "#ffffff",
                color: selectedCount === 0 ? "#9ca3af" : "#111827",
                fontSize: 11,
                cursor: selectedCount === 0 ? "default" : "pointer",
              }}
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={handleBulkMessageToSelected}
              disabled={selectedCount === 0}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                backgroundColor: selectedCount === 0 ? "#e5e7eb" : "#0f172a",
                color: selectedCount === 0 ? "#4b5563" : "#f9fafb",
                fontSize: 11,
                cursor: selectedCount === 0 ? "default" : "pointer",
              }}
            >
              Send note / update to selected
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
          Loading prospective candidates…
        </p>
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
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "NAME_ASC" ? "NAME_DESC" : "NAME_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>Candidate</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "NAME_ASC"
                        ? "↑"
                        : sortMode === "NAME_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "REGION_ASC" ? "REGION_DESC" : "REGION_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>Region</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "REGION_ASC"
                        ? "↑"
                        : sortMode === "REGION_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "CITY_ASC" ? "CITY_DESC" : "CITY_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>City</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "CITY_ASC"
                        ? "↑"
                        : sortMode === "CITY_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "STATE_ASC" ? "STATE_DESC" : "STATE_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>State</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "STATE_ASC"
                        ? "↑"
                        : sortMode === "STATE_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "STATUS_ASC" ? "STATUS_DESC" : "STATUS_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>Status</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "STATUS_ASC"
                        ? "↑"
                        : sortMode === "STATUS_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "PROFILE_ASC" ? "PROFILE_DESC" : "PROFILE_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>Profile %</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "PROFILE_ASC"
                        ? "↑"
                        : sortMode === "PROFILE_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(prev =>
                        prev === "SUBMITTED_ASC" ? "SUBMITTED_DESC" : "SUBMITTED_ASC",
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      fontSize: "inherit",
                      cursor: "pointer",
                      color: "#111827",
                    }}
                  >
                    <span>Submitted</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "SUBMITTED_ASC"
                        ? "↑"
                        : sortMode === "SUBMITTED_DESC"
                        ? "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: "6px 8px",
                    position: "relative",
                    whiteSpace: "nowrap",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Bulk actions for selected candidates"
                    onClick={() => setBulkMenuOpen(open => !open)}
                    style={{
                      padding: "0 8px 2px 8px",
                      borderRadius: 9999,
                      border: "1px solid #2563eb",
                      backgroundColor: "#ffffff",
                      color: "#2563eb",
                      fontSize: 16,
                      lineHeight: "16px",
                      cursor: filtered.length === 0 ? "default" : "pointer",
                    }}
                    disabled={filtered.length === 0}
                  >
                    ...
                  </button>
                  {bulkMenuOpen && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        marginTop: 4,
                        borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#ffffff",
                        boxShadow:
                          "0 4px 6px -1px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.1)",
                        minWidth: 200,
                        zIndex: 15,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setBulkMenuOpen(false);
                          handleBulkMessageToSelected();
                        }}
                        disabled={selectedCount === 0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          padding: "6px 10px",
                          border: "none",
                          background: selectedCount === 0 ? "#f9fafb" : "#ffffff",
                          color: selectedCount === 0 ? "#9ca3af" : "#111827",
                          cursor: selectedCount === 0 ? "default" : "pointer",
                          fontSize: 12,
                          textAlign: "left",
                        }}
                      >
                        <span>Message (send email)</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setBulkMenuOpen(false);
                          await handleBulkMarkTest();
                        }}
                        disabled={selectedCount === 0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          padding: "6px 10px",
                          borderTop: "1px solid #e5e7eb",
                          borderBottom: "1px solid #e5e7eb",
                          borderLeft: "none",
                          borderRight: "none",
                          background: selectedCount === 0 ? "#f9fafb" : "#ffffff",
                          color: selectedCount === 0 ? "#9ca3af" : "#111827",
                          cursor: selectedCount === 0 ? "default" : "pointer",
                          fontSize: 12,
                          textAlign: "left",
                        }}
                      >
                        <span>Mark as TEST</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkMenuOpen(false);
                          setShowBulkJournalPanel(true);
                        }}
                        disabled={selectedCount === 0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          padding: "6px 10px",
                          border: "none",
                          background: selectedCount === 0 ? "#f9fafb" : "#ffffff",
                          color: selectedCount === 0 ? "#9ca3af" : "#111827",
                          cursor: selectedCount === 0 ? "default" : "pointer",
                          fontSize: 12,
                          textAlign: "left",
                        }}
                      >
                        <span>Journal entry</span>
                      </button>
                    </div>
                  )}
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: "6px 8px",
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label="Select all candidates in current filter"
                    checked={allFilteredSelected && filtered.length > 0}
                    disabled={filtered.length === 0}
                    onChange={handleToggleSelectAllFiltered}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const nameText =
                  (r.profile?.firstName || r.profile?.lastName)
                    ? `${r.profile?.firstName ?? ""} ${r.profile?.lastName ?? ""}`.trim()
                    : "(no name yet)";
                const isSelected = selectedIds.includes(r.id);

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
                      <div>{r.status}</div>
                      {r.detailStatusCode && (
                        <div
                          style={{
                            marginTop: 2,
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "1px 6px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            fontSize: 11,
                            color: "#374151",
                            backgroundColor: "#f3f4f6",
                          }}
                        >
                          {/* Show human label when available */}
                          {detailStatusOptions.find(d => d.code === r.detailStatusCode)?.label ??
                            r.detailStatusCode}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                        fontSize: 12,
                      }}
                    >
                      {(() => {
                        const pct = computeProfilePercentFromChecklist(r.checklist ?? null);
                        if (pct == null) return <span style={{ color: "#6b7280" }}>—</span>;
                        const clamped = Math.min(100, Math.max(0, pct));
                        return (
                          <div
                            style={{
                              flex: "0 0 100px",
                              maxWidth: 140,
                            }}
                          >
                            <div
                              style={{
                                position: "relative",
                                width: "100%",
                                height: 14,
                                borderRadius: 999,
                                backgroundColor: "#e5e7eb",
                                overflow: "hidden",
                                boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.04)",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: `${clamped}%`,
                                  backgroundColor: "#1d4ed8",
                                  transition: "width 120ms ease-out",
                                }}
                              />
                              <div
                                style={{
                                  position: "relative",
                                  zIndex: 1,
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#f9fafb",
                                  textShadow: "0 1px 1px rgba(15,23,42,0.45)",
                                }}
                              >
                                {clamped}%
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                        fontSize: 12,
                        textAlign: "right",
                        width: 1,
                        whiteSpace: "nowrap",
                        position: "relative",
                      }}
                    >
                      <button
                        type="button"
                        aria-label="More actions for candidate"
                        style={{
                          padding: "0 8px 2px 8px",
                          borderRadius: 9999,
                          border: "1px solid #2563eb",
                          backgroundColor: "#ffffff",
                          color: "#2563eb",
                          fontSize: 16,
                          lineHeight: "16px",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          setOpenMenuId(current => (current === r.id ? null : r.id))
                        }
                      >
                        ...
                      </button>
                      {openMenuId === r.id && (
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "100%",
                            marginTop: 4,
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            backgroundColor: "#ffffff",
                            boxShadow:
                              "0 4px 6px -1px rgba(15,23,42,0.1), 0 2px 4px -2px rgba(15,23,42,0.1)",
                            minWidth: 180,
                            zIndex: 10,
                            overflow: "hidden",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              if (typeof window !== "undefined") {
                                window.location.href = "/messaging";
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              width: "100%",
                              padding: "6px 10px",
                              border: "none",
                              background: "#ffffff",
                              cursor: "pointer",
                              fontSize: 12,
                              textAlign: "left",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{ display: "inline-flex", alignItems: "center" }}
                            >
                              <svg
                                width={14}
                                height={14}
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <rect
                                  x="3"
                                  y="5"
                                  width="18"
                                  height="14"
                                  rx="2"
                                  ry="2"
                                  fill="#ffffff"
                                  stroke="#2563eb"
                                  strokeWidth={1.5}
                                />
                                <polyline
                                  points="4,7 12,13 20,7"
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth={1.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                            <span>Message</span>
                          </button>

                          {/* Change candidate state (detailStatusCode) */}
                          {detailStatusOptions.length > 0 && (
                            <div
                              style={{
                                borderTop: "1px solid #e5e7eb",
                                marginTop: 2,
                              }}
                            >
                              {detailStatusOptions.map(def => (
                                <button
                                  key={def.id}
                                  type="button"
                                  onClick={async () => {
                                    setOpenMenuId(null);
                                    if (typeof window === "undefined") return;
                                    const token = window.localStorage.getItem("accessToken");
                                    if (!token) {
                                      alert("Missing access token. Please log in again.");
                                      return;
                                    }
                                    try {
                                      const res = await fetch(
                                        `${API_BASE}/onboarding/sessions/${r.id}/detail-status`,
                                        {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                          },
                                          body: JSON.stringify({ detailStatusCode: def.code }),
                                        },
                                      );
                                      if (!res.ok) {
                                        const text = await res.text().catch(() => "");
                                        throw new Error(
                                          `Failed to update candidate state (${res.status}) ${text}`,
                                        );
                                      }
                                      setRows(prev =>
                                        prev.map(row =>
                                          row.id === r.id
                                            ? { ...row, detailStatusCode: def.code }
                                            : row,
                                        ),
                                      );
                                    } catch (e: any) {
                                      alert(e?.message ?? "Failed to update candidate state");
                                    }
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    width: "100%",
                                    padding: "6px 10px",
                                    border: "none",
                                    background: "#ffffff",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    textAlign: "left",
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{ display: "inline-flex", alignItems: "center" }}
                                  >
                                    <svg
                                      width={14}
                                      height={14}
                                      viewBox="0 0 24 24"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M5 5h14v3H5zM5 10h10v3H5zM5 15h6v3H5z"
                                        fill="#4b5563"
                                      />
                                    </svg>
                                  </span>
                                  <span>{def.label}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Journal entry shortcut */}
                          <div
                            style={{
                              borderTop: "1px solid #e5e7eb",
                              marginTop: 2,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                // Deep-link to candidate detail HR journal section
                                if (typeof window !== "undefined") {
                                  window.location.href = `/company/users/candidates/${r.id}#journal`;
                                }
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                width: "100%",
                                padding: "6px 10px",
                                border: "none",
                                background: "#ffffff",
                                cursor: "pointer",
                                fontSize: 12,
                                textAlign: "left",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{ display: "inline-flex", alignItems: "center" }}
                              >
                                <svg
                                  width={14}
                                  height={14}
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <rect
                                    x="4"
                                    y="3"
                                    width="16"
                                    height="18"
                                    rx="2"
                                    ry="2"
                                    fill="#ffffff"
                                    stroke="#4b5563"
                                    strokeWidth={1.5}
                                  />
                                  <line
                                    x1="7"
                                    y1="8"
                                    x2="17"
                                    y2="8"
                                    stroke="#4b5563"
                                    strokeWidth={1.4}
                                    strokeLinecap="round"
                                  />
                                  <line
                                    x1="7"
                                    y1="12"
                                    x2="17"
                                    y2="12"
                                    stroke="#4b5563"
                                    strokeWidth={1.4}
                                    strokeLinecap="round"
                                  />
                                  <line
                                    x1="7"
                                    y1="16"
                                    x2="13"
                                    y2="16"
                                    stroke="#4b5563"
                                    strokeWidth={1.4}
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </span>
                              <span>Journal entry</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              setOpenMenuId(null);
                              if (typeof window === "undefined") return;
                              const token = window.localStorage.getItem("accessToken");
                              if (!token) {
                                alert("Missing access token. Please log in again.");
                                return;
                              }
                              const ok = window.confirm(
                                "Mark this candidate/session as TEST? They will be hidden from normal Prospective Candidates views unless TEST is included.",
                              );
      if (!ok) return;
      try {
        const res = await fetch(
          `${API_BASE}/onboarding/sessions/${r.id}/mark-test`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            // Explicit empty body so Nest's JSON body parser is satisfied.
            body: JSON.stringify({}),
          },
        );
                                if (!res.ok) {
                                  const text = await res.text().catch(() => "");
                                  throw new Error(
                                    `Failed to mark candidate as TEST (${res.status}) ${text}`,
                                  );
                                }
                                setRows(prev =>
                                  prev.map(row =>
                                    row.id === r.id ? { ...row, status: "TEST" as CandidateStatus } : row,
                                  ),
                                );
                              } catch (e: any) {
                                alert(e?.message ?? "Failed to mark candidate as TEST");
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              width: "100%",
                              padding: "6px 10px",
                              border: "none",
                              background: "#ffffff",
                              cursor: "pointer",
                              fontSize: 12,
                              textAlign: "left",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{ display: "inline-flex", alignItems: "center" }}
                            >
                              <svg
                                width={14}
                                height={14}
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M4 4h16L14 12v6l-4 2v-8L4 4z"
                                  fill="#f97316"
                                  stroke="#c2410c"
                                  strokeWidth={1.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                            <span>Mark as TEST</span>
                          </button>
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "center",
                        width: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedIds(prev =>
                            prev.includes(r.id)
                              ? prev.filter(id => id !== r.id)
                              : [...prev, r.id],
                          );
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
                    No candidates match your filters.
                  </td>
                </tr>
              )}
            </tbody>
        </table>
      </div>
    )}

      {showBulkJournalPanel && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            fontSize: 12,
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
            <div>
              <strong>Journal / note for selected candidates</strong>
              <div style={{ color: "#6b7280" }}>
                This text will be saved to each selected candidate's journal.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (bulkJournalSaving) return;
                setShowBulkJournalPanel(false);
              }}
              style={{
                border: "none",
                borderRadius: 999,
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f3f4f6",
                cursor: "pointer",
                fontSize: 13,
              }}
              aria-label="Close journal panel"
            >
              ×
            </button>
          </div>
          <textarea
            value={bulkJournalText}
            onChange={e => setBulkJournalText(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 12,
              resize: "vertical",
            }}
            placeholder="Type a journal note that will be added to each selected candidate's profile"
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                if (bulkJournalSaving) return;
                setShowBulkJournalPanel(false);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 11,
                cursor: bulkJournalSaving ? "default" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={bulkJournalSaving || !bulkJournalText.trim()}
              onClick={() => void handleBulkJournalEntry(bulkJournalText)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                backgroundColor:
                  bulkJournalSaving || !bulkJournalText.trim() ? "#e5e7eb" : "#0f172a",
                color: bulkJournalSaving || !bulkJournalText.trim() ? "#4b5563" : "#f9fafb",
                fontSize: 11,
                cursor:
                  bulkJournalSaving || !bulkJournalText.trim() ? "default" : "pointer",
              }}
            >
              {bulkJournalSaving ? "Saving…" : "Save journal note"}
            </button>
          </div>
        </div>
      )}

      {showBulkMessageModal && bulkMessageRecipients && (
        <CandidatesBroadcastModal
          recipients={bulkMessageRecipients}
          onClose={() => {
            setShowBulkMessageModal(false);
            setBulkMessageRecipients(null);
          }}
        />
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280" }}>
        Next step: well add skill/trade filters and a Solicit workflow (message/invite) once the pool UI stabilizes.
      </div>
    </section>
  );
}
