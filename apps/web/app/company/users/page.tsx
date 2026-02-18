"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatPhone } from "../../lib/phone";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";
const NEXUS_SYSTEM_COMPANY_ID = "cmjr7o4zs000101s6z1rt1ssz";

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
  isActive: boolean;
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

  // People import/export (dev tooling)
  const [exportingPeople, setExportingPeople] = useState(false);
  const [exportPeopleError, setExportPeopleError] = useState<string | null>(null);
  const [exportPeopleResult, setExportPeopleResult] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingPeople, setImportingPeople] = useState(false);
  const [importPeopleError, setImportPeopleError] = useState<string | null>(null);
  const [importPeopleResult, setImportPeopleResult] = useState<string | null>(null);

  // Fortified payroll admin import (CSV)
  const [fortifiedFile, setFortifiedFile] = useState<File | null>(null);
  const [fortifiedImporting, setFortifiedImporting] = useState(false);
  const [fortifiedImportError, setFortifiedImportError] = useState<string | null>(null);
  const [fortifiedImportResult, setFortifiedImportResult] = useState<string | null>(null);
  const [fortifiedJobId, setFortifiedJobId] = useState<string | null>(null);
  const [fortifiedJobStatus, setFortifiedJobStatus] = useState<any | null>(null);
  const [fortifiedJobError, setFortifiedJobError] = useState<string | null>(null);

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

  const [activeTab, setActiveTab] = useState<"users" | "candidates" | "importExport">("users");

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

  async function handleFortifiedImport(e: FormEvent) {
    e.preventDefault();
    setFortifiedImportError(null);
    setFortifiedImportResult(null);

    if (!fortifiedFile) {
      setFortifiedImportError("Choose a CSV file first.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setFortifiedImportError("Missing access token. Please log in again.");
      return;
    }

    try {
      setFortifiedImporting(true);

      const form = new FormData();
      form.append("file", fortifiedFile);

      const res = await fetch(`${API_BASE}/import-jobs/fortified-payroll-admin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Import failed (${res.status}) ${text}`);
      }

      const json = await res.json().catch(() => ({}));
      const nextJobId = json?.jobId ?? null;
      setFortifiedJobId(nextJobId);
      setFortifiedJobStatus(null);
      setFortifiedJobError(null);
      setFortifiedImportResult(
        `Import queued. Job ID: ${nextJobId ?? "(unknown)"}`
      );
      setFortifiedFile(null);
    } catch (err: any) {
      setFortifiedImportError(err?.message ?? "Failed to queue import.");
    } finally {
      setFortifiedImporting(false);
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!fortifiedJobId) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setFortifiedJobError("Missing access token. Please log in again.");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/import-jobs/${fortifiedJobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to fetch job status (${res.status}) ${text}`);
        }
        const json = await res.json();
        if (cancelled) return;
        setFortifiedJobStatus(json);
        const done = json?.status === "SUCCEEDED" || json?.status === "FAILED";
        if (!done) {
          timer = window.setTimeout(poll, 4000);
        }
      } catch (err: any) {
        if (cancelled) return;
        setFortifiedJobError(err?.message ?? "Failed to fetch job status.");
        timer = window.setTimeout(poll, 8000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [fortifiedJobId]);

  // Allow deep-links like /company/users?tab=candidates or tab=importExport
  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab === "candidates") {
      setActiveTab("candidates");
    } else if (tab === "importExport") {
      setActiveTab("importExport");
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

  const handleChangeMemberActive = async (
    userId: string,
    currentIsActive: boolean,
    nextIsActive: boolean,
  ) => {
    if (!companyId) return;
    if (!canManageMembers) return;
    if (currentIsActive === nextIsActive) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/companies/${companyId}/members/${userId}/active`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: nextIsActive }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        alert(`Failed to update access status (${res.status}) ${text}`);
        return;
      }
      const updated: CompanyMemberRow = await res.json();
      setMembers(prev =>
        prev.map(m => (m.userId === updated.userId ? { ...m, isActive: updated.isActive } : m)),
      );
    } catch (err: any) {
      alert(err?.message ?? "Failed to update access status.");
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
      reader.onerror = () => {
        const err = reader.error;
        // Normalize the browser's FileReader error into a friendlier message.
        reject(
          new Error(
            err?.message ||
              "Browser could not read this file. Try saving it locally (e.g. Desktop) and re-selecting it.",
          ),
        );
      };
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

  async function handleExportPeopleSnapshot() {
    if (!companyId) {
      setExportPeopleError("Missing company context.");
      return;
    }
    if (typeof window === "undefined") {
      setExportPeopleError("Export is only available in a browser context.");
      return;
    }

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setExportPeopleError("Missing access token. Please log in again.");
      return;
    }

    try {
      setExportingPeople(true);
      setExportPeopleError(null);
      setExportPeopleResult(null);

      const membersPromise = fetch(`${API_BASE}/companies/${companyId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const prospectsPromise = fetch(
        `${API_BASE}/onboarding/company/${companyId}/prospects`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const [membersRes, prospectsRes] = await Promise.all([
        membersPromise,
        prospectsPromise,
      ]);

      if (!membersRes.ok) {
        const text = await membersRes.text().catch(() => "");
        throw new Error(`Failed to load members (${membersRes.status}) ${text}`);
      }
      if (!prospectsRes.ok) {
        const text = await prospectsRes.text().catch(() => "");
        throw new Error(`Failed to load candidates (${prospectsRes.status}) ${text}`);
      }

      const exportedMembers: CompanyMemberRow[] = await membersRes.json();
      const exportedCandidates: any[] = await prospectsRes.json();

      const snapshot = {
        companyId,
        companyName: companyName || null,
        exportedAt: new Date().toISOString(),
        origin: window.location.origin,
        members: exportedMembers,
        candidates: Array.isArray(exportedCandidates) ? exportedCandidates : [],
      };

      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const safeName = (companyName || companyId)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const datePart = new Date().toISOString().slice(0, 10);

      const a = document.createElement("a");
      a.href = url;
      a.download = `nexus-people-${safeName || "company"}-${datePart}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportPeopleResult(
        `Exported ${exportedMembers.length} members and ${
          Array.isArray(exportedCandidates) ? exportedCandidates.length : 0
        } candidates to JSON.`,
      );
    } catch (err: any) {
      setExportPeopleError(err?.message ?? "Failed to export people snapshot.");
    } finally {
      setExportingPeople(false);
    }
  }

  async function handleImportPeoplePreview(e: FormEvent) {
    e.preventDefault();
    setImportPeopleError(null);
    setImportPeopleResult(null);

    if (!importFile) {
      setImportPeopleError("Choose a JSON export file first.");
      return;
    }

    try {
      setImportingPeople(true);
      const text = await readFileAsText(importFile);
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON.");
      }

      const membersArr = Array.isArray(parsed?.members) ? parsed.members : [];
      const candidatesArr = Array.isArray(parsed?.candidates)
        ? parsed.candidates
        : [];

      const summaryParts: string[] = [];
      summaryParts.push(
        `Snapshot companyId: ${parsed?.companyId || "(missing)"} · exportedAt: ${
          parsed?.exportedAt || "(unknown)"
        }`,
      );
      summaryParts.push(
        `Contains ${membersArr.length} member row${
          membersArr.length === 1 ? "" : "s"
        } and ${candidatesArr.length} candidate row${
          candidatesArr.length === 1 ? "" : "s"
        }`,
      );

      const memberEmails = membersArr
        .map((m: any) => m?.user?.email)
        .filter((v: any) => typeof v === "string")
        .slice(0, 5);
      const candidateEmails = candidatesArr
        .map((c: any) => c?.email)
        .filter((v: any) => typeof v === "string")
        .slice(0, 5);

      if (memberEmails.length) {
        summaryParts.push(
          `Example member emails: ${memberEmails.join(", ")}${
            membersArr.length > memberEmails.length
              ? `, +${membersArr.length - memberEmails.length} more`
              : ""
          }`,
        );
      }
      if (candidateEmails.length) {
        summaryParts.push(
          `Example candidate emails: ${candidateEmails.join(", ")}${
            candidatesArr.length > candidateEmails.length
              ? `, +${candidatesArr.length - candidateEmails.length} more`
              : ""
          }`,
        );
      }

      summaryParts.push(
        "Note: this view only validates the snapshot. Automated import into dev is a separate step and can be wired next.",
      );

      setImportPeopleResult(summaryParts.join(" \\n"));
    } catch (err: any) {
      setImportPeopleError(err?.message ?? "Failed to read or validate snapshot.");
      // Clear the file so the user is prompted to select it again; this avoids
      // stale or permission-blocked handles.
      setImportFile(null);
    } finally {
      setImportingPeople(false);
    }
  }

  async function handleImportPeopleRun() {
    setImportPeopleError(null);
    // Keep any existing preview summary and append to it after import.

    if (!companyId) {
      setImportPeopleError("Missing company context.");
      return;
    }

    if (!importFile) {
      setImportPeopleError("Choose a JSON export file first.");
      return;
    }

    try {
      setImportingPeople(true);
      const text = await readFileAsText(importFile);
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON.");
      }

      const candidatesArr = Array.isArray(parsed?.candidates)
        ? parsed.candidates
        : [];

      if (!candidatesArr.length) {
        setImportPeopleResult(
          "Snapshot has no candidates to import. Members are not imported in this step.",
        );
        return;
      }

      let createdCount = 0;
      let submittedCount = 0;
      const errors: string[] = [];

      for (const raw of candidatesArr) {
        const email = (raw?.email || "").trim().toLowerCase();
        if (!email) {
          errors.push("Skipping candidate without email.");
          continue;
        }

        try {
          // Create a new onboarding session for this company + email.
          const startRes = await fetch(`${API_BASE}/onboarding/start`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ companyId, email }),
          });

          if (!startRes.ok) {
            const textBody = await startRes.text().catch(() => "");
            errors.push(
              `${email}: failed to start onboarding (${startRes.status}) ${textBody?.slice(0, 120) ?? ""}`,
            );
            continue;
          }

          const startJson: any = await startRes.json();
          const tokenForSession: string | undefined = startJson?.token;
          if (!tokenForSession) {
            errors.push(`${email}: onboarding/start did not return a token.`);
            continue;
          }

          createdCount += 1;

          // Best-effort: hydrate profile if present in the snapshot.
          const profile = raw?.profile;
          if (profile && typeof profile === "object") {
            try {
              await fetch(`${API_BASE}/onboarding/${tokenForSession}/profile`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  firstName: profile.firstName ?? undefined,
                  lastName: profile.lastName ?? undefined,
                  phone: profile.phone ?? undefined,
                  dob: profile.dob ?? undefined,
                  addressLine1: profile.addressLine1 ?? undefined,
                  addressLine2: profile.addressLine2 ?? undefined,
                  city: profile.city ?? undefined,
                  state: profile.state ?? undefined,
                  postalCode: profile.postalCode ?? undefined,
                  country: profile.country ?? undefined,
                }),
              });
            } catch (err: any) {
              errors.push(`${email}: profile import failed (${err?.message ?? "unknown error"})`);
            }
          }

          // If the original candidate was SUBMITTED, mirror that status by submitting
          // the imported session as well.
          const status = String(raw?.status || "").toUpperCase();
          if (status === "SUBMITTED") {
            try {
              const submitRes = await fetch(
                `${API_BASE}/onboarding/${tokenForSession}/submit`,
                {
                  method: "POST",
                },
              );
              if (submitRes.ok) {
                submittedCount += 1;
              } else {
                const textBody = await submitRes.text().catch(() => "");
                errors.push(
                  `${email}: submit failed (${submitRes.status}) ${
                    textBody?.slice(0, 120) ?? ""
                  }`,
                );
              }
            } catch (err: any) {
              errors.push(`${email}: submit failed (${err?.message ?? "unknown error"})`);
            }
          }
        } catch (err: any) {
          errors.push(`${email}: ${err?.message ?? "import failed"}`);
        }
      }

      let summary = `Imported ${createdCount} candidate session${
        createdCount === 1 ? "" : "s"
      } into ${companyName || companyId}.`;
      if (submittedCount > 0) {
        summary += ` Marked ${submittedCount} as SUBMITTED.`;
      }
      if (errors.length) {
        const shown = errors.slice(0, 5);
        summary += ` Errors: ${shown.join(" | ")}`;
        if (errors.length > shown.length) {
          summary += ` (+${errors.length - shown.length} more)`;
        }
      }

      setImportPeopleResult(summary);
    } catch (err: any) {
      setImportPeopleError(err?.message ?? "Failed to import candidates from snapshot.");
      setImportFile(null);
    } finally {
      setImportingPeople(false);
    }
  }

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
        {canManageMembers && (
          <button
            type="button"
            onClick={() => {
              setActiveTab("importExport");
              router.replace("/company/users?tab=importExport");
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border:
                activeTab === "importExport" ? "1px solid #0f172a" : "1px solid #d1d5db",
              background: activeTab === "importExport" ? "#0f172a" : "#ffffff",
              color: activeTab === "importExport" ? "#f9fafb" : "#111827",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Import / Export People
          </button>
        )}
      </div>

      {activeTab === "importExport" && companyId && canManageMembers ? (
        <section style={{ marginTop: 8 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Import / Export People</h2>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 8 }}>
            Export a snapshot of company members and prospective candidates to JSON so you can
            move data between environments. Import preview validates a snapshot file and shows
            what it contains.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              padding: 12,
              background: "#f9fafb",
            }}
          >
            <div>
              <h3 style={{ fontSize: 14, margin: 0 }}>Export people snapshot</h3>
              <p style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                Creates a JSON file containing all current company members and prospective
                candidates for <strong>{companyName || companyId}</strong>.
              </p>
              <button
                type="button"
                onClick={() => void handleExportPeopleSnapshot()}
                disabled={exportingPeople}
                style={{
                  marginTop: 4,
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: exportingPeople ? "#e5e7eb" : "#0f172a",
                  color: exportingPeople ? "#4b5563" : "#f9fafb",
                  cursor: exportingPeople ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {exportingPeople ? "Preparing export…" : "Export people (JSON)"}
              </button>
              {exportPeopleError && (
                <p style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>
                  {exportPeopleError}
                </p>
              )}
              {exportPeopleResult && (
                <p style={{ marginTop: 4, fontSize: 12, color: "#16a34a" }}>
                  {exportPeopleResult}
                </p>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: 14, margin: 0 }}>Import snapshot (preview)</h3>
              <p style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                Choose a previously exported JSON file to inspect what would be imported into this
                environment. Automated creation of candidates and members can be layered on top of
                this preview.
              </p>
              <form
                onSubmit={handleImportPeoplePreview}
                style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}
              >
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={importingPeople || !importFile}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      backgroundColor:
                        importingPeople || !importFile ? "#e5e7eb" : "#0f172a",
                      color: importingPeople || !importFile ? "#4b5563" : "#f9fafb",
                      cursor:
                        importingPeople || !importFile ? "default" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {importingPeople ? "Reading file" : "Preview snapshot"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleImportPeopleRun()}
                    disabled={importingPeople || !importFile}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #b91c1c",
                      backgroundColor:
                        importingPeople || !importFile ? "#fee2e2" : "#b91c1c",
                      color: importingPeople || !importFile ? "#9f1239" : "#fef2f2",
                      cursor:
                        importingPeople || !importFile ? "default" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {importingPeople ? "Importing" : "Import candidates (dev)"}
                  </button>
                </div>
              </form>
              <p style={{ marginTop: 4, fontSize: 11, color: "#b91c1c" }}>
                DEV-ONLY: importing will create onboarding sessions for each candidate in the
                file in the <strong>{companyName || companyId}</strong> tenant. Do not run this
                in production.
              </p>
              {importPeopleError && (
                <p style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>
                  {importPeopleError}
                </p>
              )}
              {importPeopleResult && (
                <pre
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: "#111827",
                    background: "#ffffff",
                    borderRadius: 6,
                    padding: 8,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {importPeopleResult}
                </pre>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: 14, margin: 0 }}>Fortified payroll admin import (CSV)</h3>
              <p style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                Upload the payroll admin CSV to add missing users to Nexus Fortified Structures
                and update their HR banking records.
              </p>
              <form
                onSubmit={handleFortifiedImport}
                style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}
              >
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={e => setFortifiedFile(e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={fortifiedImporting || !fortifiedFile}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      backgroundColor:
                        fortifiedImporting || !fortifiedFile ? "#e5e7eb" : "#0f172a",
                      color:
                        fortifiedImporting || !fortifiedFile ? "#4b5563" : "#f9fafb",
                      cursor:
                        fortifiedImporting || !fortifiedFile ? "default" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {fortifiedImporting ? "Uploading…" : "Queue Fortified import"}
                  </button>
                </div>
              </form>
              {fortifiedImportError && (
                <p style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>
                  {fortifiedImportError}
                </p>
              )}
              {fortifiedImportResult && (
                <p style={{ marginTop: 4, fontSize: 12, color: "#16a34a" }}>
                  {fortifiedImportResult}
                </p>
              )}
              {(fortifiedJobStatus || fortifiedJobError) && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 6,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Import job status</div>
                  {fortifiedJobError && (
                    <div style={{ color: "#b91c1c", marginBottom: 4 }}>
                      {fortifiedJobError}
                    </div>
                  )}
                  {fortifiedJobStatus && (
                    <>
                      <div>
                        <strong>Target company:</strong>{" "}
                        {fortifiedJobStatus.companyId ?? "—"}
                      </div>
                      <div>
                        <strong>Status:</strong>{" "}
                        {fortifiedJobStatus.status ?? "UNKNOWN"}
                      </div>
                      <div>
                        <strong>Progress:</strong>{" "}
                        {typeof fortifiedJobStatus.progress === "number"
                          ? `${fortifiedJobStatus.progress}%`
                          : "—"}
                      </div>
                      {fortifiedJobStatus.message && (
                        <div>
                          <strong>Message:</strong>{" "}
                          {fortifiedJobStatus.message}
                        </div>
                      )}
                      {fortifiedJobStatus.resultJson && (
                        <div style={{ marginTop: 6 }}>
                          <strong>Result:</strong>
                          <pre
                            style={{
                              marginTop: 4,
                              padding: 6,
                              background: "#f8fafc",
                              borderRadius: 4,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {JSON.stringify(fortifiedJobStatus.resultJson, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : activeTab === "candidates" && companyId ? (
        <ProspectiveCandidatesPanel
          companyId={companyId}
          companyName={companyName}
          actorGlobalRole={actorGlobalRole}
          isNexusSystemAdmin={
            actorGlobalRole === "SUPER_ADMIN" ||
            (me?.memberships ?? []).some(
              m =>
                m.companyId === NEXUS_SYSTEM_COMPANY_ID &&
                (m.role === "OWNER" || m.role === "ADMIN"),
            )
          }
          tenantShareTargets={
            me?.memberships?.map(m => ({
              id: m.companyId,
              name: m.company?.name ?? m.companyId,
            })) ?? []
          }
        />
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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Access</th>
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
                        {m.isActive ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: "1px solid #16a34a",
                              backgroundColor: "#ecfdf3",
                              fontSize: 11,
                              color: "#166534",
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                backgroundColor: "#16a34a",
                              }}
                            />
                            <span>ACTIVE</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: "1px solid #b91c1c",
                              backgroundColor: "#fef2f2",
                              fontSize: 11,
                              color: "#b91c1c",
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                backgroundColor: "#b91c1c",
                              }}
                            />
                            <span>DEACTIVATED</span>
                          </span>
                        )}
                        {canManageMembers && (
                          <div style={{ marginTop: 4 }}>
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 11,
                                color: "#4b5563",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={m.isActive}
                                onChange={e =>
                                  void handleChangeMemberActive(
                                    m.userId,
                                    m.isActive,
                                    e.target.checked,
                                  )
                                }
                              />
                              <span>Allow access to this tenant</span>
                            </label>
                          </div>
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

interface CandidateTag {
  id: string;
  code: string;
  label: string;
  color: string | null;
}

interface CandidateRow {
  id: string;
  email: string;
  status: CandidateStatus;
  createdAt: string;
  updatedAt?: string;
  profile?: CandidateProfile | null;
  checklist?: CandidateChecklist | null;
  detailStatusCode?: string | null;
  userId?: string | null; // underlying User.id when available (for journaling)

  // Optional assignment metadata from the API. These are populated by the
  // onboarding service when available but are not required for existing UI
  // flows.
  assignedTenantCount?: number;
  assignedHere?: boolean;
  assignedElsewhere?: boolean;
  assignedTenants?: {
    companyId: string;
    companyName: string;
    companyRole: string | null;
    interestStatus: string;
    isCurrentTenant: boolean;
  }[];
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
  actorGlobalRole,
  isNexusSystemAdmin,
  tenantShareTargets,
}: {
  companyId: string;
  companyName: string;
  actorGlobalRole?: string | null;
  isNexusSystemAdmin?: boolean;
  tenantShareTargets?: { id: string; name: string }[];
}) {
  // Only NEXUS System admins (SUPER_ADMIN or NEXUS System OWNER/ADMIN) can share with tenants
  const canShareWithTenants = isNexusSystemAdmin === true;
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

  // Candidate tags (groups/classes)
  const [candidateTags, setCandidateTags] = useState<CandidateTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sessionTags, setSessionTags] = useState<Record<string, CandidateTag[]>>({});
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagSelection, setBulkTagSelection] = useState<string[]>([]);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [bulkTagsSaving, setBulkTagsSaving] = useState(false);

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
    | "CORR_ASC"
    | "CORR_DESC"
    | "SUBMITTED_ASC"
    | "SUBMITTED_DESC"
    | "MODIFIED_ASC"
    | "MODIFIED_DESC"
  >("MODIFIED_DESC");
  const [showBulkJournalPanel, setShowBulkJournalPanel] = useState(false);
  const [bulkJournalText, setBulkJournalText] = useState("");
  const [bulkJournalSaving, setBulkJournalSaving] = useState(false);
  const [bulkJournalAttachments, setBulkJournalAttachments] = useState<
    { url: string; label?: string }[]
  >([]);
  const [showBulkMessageModal, setShowBulkMessageModal] = useState(false);
  const [bulkMessageRecipients, setBulkMessageRecipients] = useState<
    { email: string; userId?: string | null }[] | null
  >(null);
  const [shareTargetCompanyIds, setShareTargetCompanyIds] = useState<string[]>([]);
  const [sharingProspects, setSharingProspects] = useState(false);
  const [shareResult, setShareResult] = useState<string | null>(null);

  // Lazy-loaded per-candidate correspondence metadata from messaging
  // threads. Used to populate the "Correspondences" column with
  // Sent/Received counts and last-activity direction.
  const [correspondenceByUserId, setCorrespondenceByUserId] = useState<
    Record<
      string,
      {
        lastAt: string | null;
        direction: "SENT" | "RECEIVED" | null;
        sentCount: number;
        receivedCount: number;
      }
    >
  >({});

  const isFortifiedCompany = companyName
    .toLowerCase()
    .startsWith("nexus fortified structures");

  // --- Cross-Tenant Person Search State ---
  const [crossTenantSearchPhone, setCrossTenantSearchPhone] = useState("");
  const [crossTenantSearching, setCrossTenantSearching] = useState(false);
  const [crossTenantSearchResults, setCrossTenantSearchResults] = useState<
    { id: string; maskedPhone: string; initials: string; isAlreadyMember: boolean }[] | null
  >(null);
  const [crossTenantSearchError, setCrossTenantSearchError] = useState<string | null>(null);
  // Stage 2: Selected person details
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedPersonPhone, setSelectedPersonPhone] = useState<string | null>(null);
  const [personDetails, setPersonDetails] = useState<{
    userId: string;
    initials: string;
    maskedPhone: string;
    emails: { masked: string; full: string; isPrimary: boolean; verified: boolean }[];
    peopleToken: string | null;
    isAlreadyMember: boolean;
  } | null>(null);
  const [personDetailsLoading, setPersonDetailsLoading] = useState(false);
  const [personDetailsError, setPersonDetailsError] = useState<string | null>(null);
  // Stage 3: Invite flow
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [useManualEmail, setUseManualEmail] = useState(false);
  const [inviteRole, setInviteRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<{
    inviteId: string;
    token: string;
    inviteeEmail: string;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Can the current user search for people? (OWNER/ADMIN only)
  const canSearchPeople = actorGlobalRole === "SUPER_ADMIN" || true; // All OWNER/ADMIN can search via API guard

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

  // Load candidate tag dictionary for this company (Groups / Tags for candidates).
  useEffect(() => {
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        setTagsLoading(true);
        setTagsError(null);
        const res = await fetch(`${API_BASE}/tags?entityType=candidate`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return;
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        const mapped: CandidateTag[] = (json || []).map(t => ({
          id: t.id,
          code: t.code,
          label: t.label,
          color: t.color ?? null,
        }));
        setCandidateTags(mapped);
      } catch (e: any) {
        if (!cancelled) {
          setTagsError(e?.message ?? "Failed to load candidate tags");
        }
      } finally {
        if (!cancelled) {
          setTagsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Fortified-only: load shared Nex-Net candidate panel (separate from the
  // main prospective candidates grid).
  useEffect(() => {
    if (!isFortifiedCompany) return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

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
          // Prefer candidateId from the API when present (current shape), but
          // fall back to id for older responses. This ensures we always have a
          // stable unique key for React rendering.
          const candidateId = c.candidateId ?? c.id;
          return {
            id: candidateId,
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
  }, [companyId, isFortifiedCompany]);

  // Main prospective candidates grid (Nexus System and Fortified). For
  // Fortified we hit the shared /prospects endpoint; for other tenants we use
  // the company-local /sessions endpoint.
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
        setSessionTags({});

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

        const basePath = `${API_BASE}/onboarding/company/${companyId}/prospects`;

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
  }, [companyId, statusFilter, detailStatusFilter, isFortifiedCompany]);

  // Load tags for visible candidate sessions (used for filters and display).
  useEffect(() => {
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    if (!rows.length) {
      setSessionTags({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const ids = rows.map(r => r.id);
        const res = await fetch(`${API_BASE}/tags/candidates/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionIds: ids }),
        });
        if (!res.ok) return;
        const json: any[] = await res.json();
        if (cancelled) return;
        const next: Record<string, CandidateTag[]> = {};
        for (const item of json || []) {
          if (!item || typeof item.sessionId !== "string" || !item.tag) continue;
          const sid = item.sessionId;
          if (!next[sid]) next[sid] = [];
          next[sid].push({
            id: item.tag.id,
            code: item.tag.code,
            label: item.tag.label,
            color: item.tag.color ?? null,
          });
        }
        setSessionTags(next);
      } catch {
        // non-fatal; tags are optional
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows]);

  // Load per-candidate correspondence metadata once we have rows and userIds.
  // This uses the dedicated correspondence summary API so we can distinguish
  // between internal sends vs external replies.
  useEffect(() => {
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    const userIdsToLoad = Array.from(
      new Set(
        rows
          .map(r => r.userId)
          .filter(
            (id): id is string => !!id && typeof id === "string" && !correspondenceByUserId[id],
          ),
      ),
    );

    if (userIdsToLoad.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/messages/candidate-correspondence`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            companyId,
            userIds: userIdsToLoad,
          }),
        });
        if (!res.ok) return;
        const json: any[] = await res.json();
        const next: Record<
          string,
          {
            lastAt: string | null;
            direction: "SENT" | "RECEIVED" | null;
            sentCount: number;
            receivedCount: number;
          }
        > = {};
        for (const item of json || []) {
          if (!item || typeof item.userId !== "string" || !item.userId) continue;

          const lastAt =
            typeof item.lastMessageAt === "string" && item.lastMessageAt
              ? item.lastMessageAt
              : null;
          const hasSent = typeof item.sentCount === "number" && item.sentCount > 0;
          const hasReceived =
            typeof item.receivedCount === "number" && item.receivedCount > 0;
          const dir: "SENT" | "RECEIVED" | null =
            item.direction === "RECEIVED" || (!hasSent && hasReceived)
              ? "RECEIVED"
              : hasSent
              ? "SENT"
              : null;

          next[item.userId] = {
            lastAt,
            direction: dir,
            sentCount: hasSent ? item.sentCount : 0,
            receivedCount: hasReceived ? item.receivedCount : 0,
          };
        }
        if (!cancelled && Object.keys(next).length > 0) {
          setCorrespondenceByUserId(prev => ({ ...prev, ...next }));
        }
      } catch {
        // non-fatal; skip enrichment on error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, correspondenceByUserId, companyId]);

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

      // Tag filter: require at least one matching tag when tags are selected.
      if (tagFilter.length > 0) {
        const tagsForSession = sessionTags[r.id] || [];
        const tagIds = new Set(tagsForSession.map(t => t.id));
        const hasMatch = tagFilter.some(id => tagIds.has(id));
        if (!hasMatch) return false;
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
      const compareByName = (aRow: CandidateRow, bRow: CandidateRow) => {
        const aLast = (aRow.profile?.lastName || "").trim().toLowerCase();
        const bLast = (bRow.profile?.lastName || "").trim().toLowerCase();
        const aFirst = (aRow.profile?.firstName || "").trim().toLowerCase();
        const bFirst = (bRow.profile?.firstName || "").trim().toLowerCase();

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
          cmpName = aRow.email.toLowerCase().localeCompare(bRow.email.toLowerCase());
        }
        return cmpName;
      };

      if (sortMode === "MODIFIED_ASC" || sortMode === "MODIFIED_DESC") {
        const aTime = new Date(a.updatedAt || a.createdAt).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt).getTime();
        const diff = aTime - bTime;
        return sortMode === "MODIFIED_ASC" ? diff : -diff;
      }

      if (sortMode === "SUBMITTED_ASC" || sortMode === "SUBMITTED_DESC") {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        const diff = aTime - bTime;
        return sortMode === "SUBMITTED_ASC" ? diff : -diff;
      }

      if (sortMode === "PROFILE_ASC" || sortMode === "PROFILE_DESC") {
        const aPct = computeProfilePercentFromChecklist(a.checklist) ?? -1;
        const bPct = computeProfilePercentFromChecklist(b.checklist) ?? -1;
        if (aPct !== bPct) {
          const diff = aPct - bPct;
          return sortMode === "PROFILE_ASC" ? diff : -diff;
        }
        // Tie-break by candidate name (last, first, then email) in ascending order
        // so that Profile % DESC + name ASC is the default ordering.
        return compareByName(a, b);
      }

      if (sortMode === "CORR_ASC" || sortMode === "CORR_DESC") {
        const aMeta = correspondenceByUserId[a.userId ?? ""];
        const bMeta = correspondenceByUserId[b.userId ?? ""];
        const aTime = aMeta?.lastAt ? new Date(aMeta.lastAt).getTime() : Number.NaN;
        const bTime = bMeta?.lastAt ? new Date(bMeta.lastAt).getTime() : Number.NaN;

        const aHas = Number.isFinite(aTime);
        const bHas = Number.isFinite(bTime);

        if (!aHas && !bHas) return 0;
        if (!aHas) return 1; // rows with no correspondence go to the bottom
        if (!bHas) return -1;

        const diff = aTime - bTime;
        return sortMode === "CORR_ASC" ? diff : -diff;
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
      const cmpName = compareByName(a, b);
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

  async function handleBulkShareProspects() {
    if (typeof window === "undefined") return;
    if (!shareTargetCompanyIds.length) {
      alert("Select at least one tenant to share with.");
      return;
    }
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token. Please log in again.");
      return;
    }
    const selected = filtered.filter(r => selectedIds.includes(r.id));
    if (!selected.length) {
      alert("Select at least one candidate to share.");
      return;
    }

    const confirmMsg = `Share ${selected.length} candidate${
      selected.length > 1 ? "s" : ""
    } with ${shareTargetCompanyIds.length} tenant${
      shareTargetCompanyIds.length > 1 ? "s" : ""
    }?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setSharingProspects(true);
      setShareResult(null);
      const res = await fetch(
        `${API_BASE}/onboarding/company/${companyId}/share-prospects`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionIds: selected.map(r => r.id),
            targetCompanyIds: shareTargetCompanyIds,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const message = text || `Failed to share candidates (${res.status})`;

        // UX tweak: provide a clearer message when candidates are currently
        // employed/assigned and therefore cannot be shared.
        if (
          res.status === 400 &&
          /currently assigned to a tenant/i.test(message) ||
          /currently an active member of a tenant/i.test(message)
        ) {
          alert(
            "One or more selected candidates are currently employed by a tenant. " +
              "To share them with other organizations, first mark them Inactive/Released in People → Worker Profiles.",
          );
        } else {
          alert(message);
        }
        return;
      }
      const json: any = await res.json().catch(() => ({}));
      const sharedCount = typeof json.candidateCount === "number" ? json.candidateCount : selected.length;
      const targetCount =
        typeof json.targetCompanyCount === "number"
          ? json.targetCompanyCount
          : shareTargetCompanyIds.length;
      setShareResult(
        `Shared ${sharedCount} candidate${sharedCount === 1 ? "" : "s"} with ${targetCount} tenant${
          targetCount === 1 ? "" : "s"
        }.`,
      );
    } catch (e: any) {
      alert(e?.message ?? "Failed to share candidates");
    } finally {
      setSharingProspects(false);
    }
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
            body: JSON.stringify({
              body: trimmed,
              attachments:
                bulkJournalAttachments.length > 0
                  ? bulkJournalAttachments.map(att => ({
                      kind: "UPLOADED_FILE",
                      url: att.url,
                      filename: att.label || null,
                    }))
                  : undefined,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`Failed to add journal entry for user ${r.userId}:`, res.status, text);
          }
        }),
      );
      alert("Journal entry added for selected candidates.");
      setBulkJournalText("");
      setBulkJournalAttachments([]);
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

  // --- Cross-Tenant Search & Invite Handlers ---

  async function handleCrossTenantSearch() {
    const phone = crossTenantSearchPhone.replace(/\D/g, "").trim();
    if (!phone || phone.length < 7) {
      setCrossTenantSearchError("Enter a valid phone number (at least 7 digits)");
      return;
    }
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setCrossTenantSearchError("Missing access token. Please log in again.");
      return;
    }
    try {
      setCrossTenantSearching(true);
      setCrossTenantSearchError(null);
      setCrossTenantSearchResults(null);
      setPersonDetails(null);
      setSelectedPersonId(null);
      setInviteSuccess(null);

      const res = await fetch(`${API_BASE}/onboarding/cross-tenant/search?phone=${encodeURIComponent(phone)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Search failed (${res.status})`);
      }
      const json = await res.json();
      if (!json.found || !json.results?.length) {
        setCrossTenantSearchResults([]);
        return;
      }
      setCrossTenantSearchResults(json.results);
    } catch (e: any) {
      setCrossTenantSearchError(e?.message ?? "Search failed");
    } finally {
      setCrossTenantSearching(false);
    }
  }

  async function handleSelectPerson(personId: string) {
    const phone = crossTenantSearchPhone.replace(/\D/g, "").trim();
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setPersonDetailsError("Missing access token. Please log in again.");
      return;
    }
    try {
      setPersonDetailsLoading(true);
      setPersonDetailsError(null);
      setPersonDetails(null);
      setSelectedPersonId(personId);
      setSelectedPersonPhone(phone);
      setSelectedEmail(null);
      setUseManualEmail(false);
      setManualEmail("");

      const res = await fetch(
        `${API_BASE}/onboarding/cross-tenant/person/${encodeURIComponent(personId)}?phone=${encodeURIComponent(phone)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load person details (${res.status})`);
      }
      const json = await res.json();
      setPersonDetails(json);
      // Auto-select primary email if available
      const primaryEmail = json.emails?.find((e: any) => e.isPrimary);
      if (primaryEmail) {
        setSelectedEmail(primaryEmail.full);
      }
    } catch (e: any) {
      setPersonDetailsError(e?.message ?? "Failed to load person details");
    } finally {
      setPersonDetailsLoading(false);
    }
  }

  async function handleSendCrossTenantInvite() {
    const email = useManualEmail ? manualEmail.trim().toLowerCase() : selectedEmail;
    if (!email) {
      setInviteError("Please select or enter an email address");
      return;
    }
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setInviteError("Missing access token. Please log in again.");
      return;
    }
    try {
      setInviteSending(true);
      setInviteError(null);

      const res = await fetch(`${API_BASE}/onboarding/cross-tenant/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetCompanyId: companyId,
          inviteeUserId: personDetails?.userId || null,
          inviteeEmail: email,
          inviteePhone: selectedPersonPhone || null,
          role: inviteRole,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to send invite (${res.status})`);
      }
      const json = await res.json();
      setInviteSuccess({
        inviteId: json.inviteId,
        token: json.token,
        inviteeEmail: json.inviteeEmail,
      });
      // Reset search state
      setCrossTenantSearchResults(null);
      setPersonDetails(null);
      setSelectedPersonId(null);
    } catch (e: any) {
      setInviteError(e?.message ?? "Failed to send invite");
    } finally {
      setInviteSending(false);
    }
  }

  function handleResetCrossTenantSearch() {
    setCrossTenantSearchPhone("");
    setCrossTenantSearchResults(null);
    setCrossTenantSearchError(null);
    setPersonDetails(null);
    setPersonDetailsError(null);
    setSelectedPersonId(null);
    setSelectedPersonPhone(null);
    setSelectedEmail(null);
    setManualEmail("");
    setUseManualEmail(false);
    setInviteSuccess(null);
    setInviteError(null);
  }

  return (
    <section style={{ marginTop: 8 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Prospective candidates</h2>
      <p style={{ fontSize: 12, color: "#4b5563", marginTop: 0 }}>
        Candidates who have submitted onboarding for <strong>{companyName}</strong>. Filter by region/state/city.
      </p>

      {/* Cross-Tenant Person Search Panel */}
      <div
        style={{
          marginTop: 8,
          marginBottom: 12,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#f8fafc",
        }}
      >
        <h3 style={{ fontSize: 14, marginTop: 0, marginBottom: 4 }}>Find person in NEXUS</h3>
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 0, marginBottom: 8 }}>
          Search by phone number to find and invite people who already exist in the NEXUS System.
        </p>

        {/* Success message */}
        {inviteSuccess && (
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: "#dcfce7",
              border: "1px solid #86efac",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 600, color: "#166534", marginBottom: 4 }}>Invite sent!</div>
            <div style={{ fontSize: 12, color: "#166534" }}>
              An invitation has been sent to <strong>{inviteSuccess.inviteeEmail}</strong> to join{" "}
              <strong>{companyName}</strong>.
            </div>
            <button
              type="button"
              onClick={handleResetCrossTenantSearch}
              style={{
                marginTop: 8,
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #166534",
                background: "#166534",
                color: "#ffffff",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Search another person
            </button>
          </div>
        )}

        {!inviteSuccess && (
          <>
            {/* Stage 1: Phone search */}
            {!personDetails && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11 }}>Phone number</span>
                  <input
                    type="tel"
                    value={crossTenantSearchPhone}
                    onChange={e => setCrossTenantSearchPhone(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCrossTenantSearch()}
                    placeholder="(555) 123-4567"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      minWidth: 180,
                      fontSize: 13,
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleCrossTenantSearch}
                  disabled={crossTenantSearching || !crossTenantSearchPhone.trim()}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    border: "1px solid #0f172a",
                    background: crossTenantSearching || !crossTenantSearchPhone.trim() ? "#e5e7eb" : "#0f172a",
                    color: crossTenantSearching || !crossTenantSearchPhone.trim() ? "#6b7280" : "#ffffff",
                    fontSize: 12,
                    cursor: crossTenantSearching || !crossTenantSearchPhone.trim() ? "default" : "pointer",
                  }}
                >
                  {crossTenantSearching ? "Searching…" : "Search"}
                </button>
              </div>
            )}

            {/* Search error */}
            {crossTenantSearchError && (
              <p style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{crossTenantSearchError}</p>
            )}

            {/* Search results: masked phone + initials */}
            {crossTenantSearchResults !== null && !personDetails && (
              <div style={{ marginTop: 10 }}>
                {crossTenantSearchResults.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#6b7280" }}>
                    No matching person found with that phone number.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
                      Select the person you're looking for:
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {crossTenantSearchResults.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectPerson(r.id)}
                          disabled={r.isAlreadyMember}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 6,
                            border: r.isAlreadyMember ? "1px solid #d1d5db" : "1px solid #2563eb",
                            background: r.isAlreadyMember ? "#f3f4f6" : "#eff6ff",
                            color: r.isAlreadyMember ? "#9ca3af" : "#1e40af",
                            fontSize: 13,
                            cursor: r.isAlreadyMember ? "default" : "pointer",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{r.maskedPhone}</span>
                          <span style={{ marginLeft: 8 }}>– {r.initials}</span>
                          {r.isAlreadyMember && (
                            <span style={{ marginLeft: 8, fontSize: 10, color: "#6b7280" }}>(already member)</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Stage 2: Person details + email selection */}
            {personDetailsLoading && (
              <p style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>Loading person details…</p>
            )}
            {personDetailsError && (
              <p style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{personDetailsError}</p>
            )}
            {personDetails && !personDetailsLoading && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{personDetails.maskedPhone}</span>
                    <span style={{ marginLeft: 8 }}>– {personDetails.initials}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetCrossTenantSearch}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: "#f9fafb",
                      color: "#4b5563",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Start over
                  </button>
                </div>

                {personDetails.isAlreadyMember ? (
                  <p style={{ fontSize: 12, color: "#b91c1c" }}>
                    This person is already a member of <strong>{companyName}</strong>.
                  </p>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}>Select email to invite:</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {personDetails.emails.map((e, idx) => (
                        <label
                          key={idx}
                          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                        >
                          <input
                            type="radio"
                            name="invite-email"
                            checked={!useManualEmail && selectedEmail === e.full}
                            onChange={() => {
                              setSelectedEmail(e.full);
                              setUseManualEmail(false);
                            }}
                          />
                          <span style={{ fontFamily: "monospace", fontSize: 12 }}>{e.full}</span>
                          {e.isPrimary && (
                            <span style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>
                              primary
                            </span>
                          )}
                        </label>
                      ))}
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="invite-email"
                          checked={useManualEmail}
                          onChange={() => setUseManualEmail(true)}
                        />
                        <span style={{ fontSize: 12 }}>Use different email:</span>
                        <input
                          type="email"
                          value={manualEmail}
                          onChange={e => setManualEmail(e.target.value)}
                          onFocus={() => setUseManualEmail(true)}
                          placeholder="email@example.com"
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                            minWidth: 200,
                          }}
                        />
                      </label>
                    </div>

                    {/* Role selector + invite button */}
                    <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        Role:
                        <select
                          value={inviteRole}
                          onChange={e => setInviteRole(e.target.value as any)}
                          style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 12 }}
                        >
                          <option value="MEMBER">MEMBER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="OWNER">OWNER</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={handleSendCrossTenantInvite}
                        disabled={inviteSending || (!selectedEmail && !manualEmail.trim())}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 4,
                          border: "1px solid #16a34a",
                          background: inviteSending || (!selectedEmail && !manualEmail.trim()) ? "#e5e7eb" : "#16a34a",
                          color: inviteSending || (!selectedEmail && !manualEmail.trim()) ? "#6b7280" : "#ffffff",
                          fontSize: 12,
                          cursor: inviteSending || (!selectedEmail && !manualEmail.trim()) ? "default" : "pointer",
                        }}
                      >
                        {inviteSending ? "Sending…" : `Invite to ${companyName}`}
                      </button>
                    </div>
                    {inviteError && <p style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{inviteError}</p>}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

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

        {/* City to the left of State to match the table column order */}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>Groups / Tags</span>
          {tagsLoading && (
            <span style={{ fontSize: 11, color: "#6b7280" }}>Loading tags…</span>
          )}
          {tagsError && (
            <span style={{ fontSize: 11, color: "#b91c1c" }}>{tagsError}</span>
          )}
          {!tagsLoading && candidateTags.length === 0 && !tagsError && (
            <span style={{ fontSize: 11, color: "#6b7280" }}>No candidate tags yet.</span>
          )}
          {candidateTags.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxWidth: 260,
              }}
            >
              {candidateTags.map(tag => {
                const checked = tagFilter.includes(tag.id);
                return (
                  <label
                    key={tag.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setTagFilter(prev =>
                          prev.includes(tag.id)
                            ? prev.filter(id => id !== tag.id)
                            : [...prev, tag.id],
                        );
                      }}
                    />
                    <span>{tag.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Share with tenants - NEXUS System admins only */}
        {canShareWithTenants && tenantShareTargets && tenantShareTargets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>Share with tenants</span>
            <select
              multiple
              value={shareTargetCompanyIds}
              onChange={e => {
                const options = Array.from(e.target.selectedOptions || []);
                setShareTargetCompanyIds(options.map(o => o.value));
              }}
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              {tenantShareTargets
                .filter(t => t.id !== companyId)
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        )}

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
            {/* Share button - NEXUS System admins only */}
            {canShareWithTenants && tenantShareTargets && tenantShareTargets.length > 0 && (
              <button
                type="button"
                onClick={() => void handleBulkShareProspects()}
                disabled={selectedCount === 0 || shareTargetCompanyIds.length === 0 || sharingProspects}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #16a34a",
                  backgroundColor:
                    selectedCount === 0 || shareTargetCompanyIds.length === 0 || sharingProspects
                      ? "#e5e7eb"
                      : "#16a34a",
                  color:
                    selectedCount === 0 || shareTargetCompanyIds.length === 0 || sharingProspects
                      ? "#4b5563"
                      : "#f9fafb",
                  fontSize: 11,
                  cursor:
                    selectedCount === 0 || shareTargetCompanyIds.length === 0 || sharingProspects
                      ? "default"
                      : "pointer",
                }}
              >
                {sharingProspects ? "Sharing…" : "Share selected with tenants"}
              </button>
            )}
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
                        prev === "CORR_ASC" ? "CORR_DESC" : "CORR_ASC",
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
                    <span>Correspondences</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "CORR_ASC"
                        ? "↑"
                        : sortMode === "CORR_DESC"
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
                        prev === "MODIFIED_ASC" ? "MODIFIED_DESC" : "MODIFIED_ASC",
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
                    <span>Last modified</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {sortMode === "MODIFIED_ASC"
                        ? "↑"
                        : sortMode === "MODIFIED_DESC"
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
                      <button
                        type="button"
                        onClick={() => {
                          setBulkMenuOpen(false);
                          setBulkTagSelection([]);
                          setShowBulkTagModal(true);
                        }}
                        disabled={selectedCount === 0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          padding: "6px 10px",
                          borderTop: "1px solid #e5e7eb",
                          borderBottom: "none",
                          borderLeft: "none",
                          borderRight: "none",
                          background: selectedCount === 0 ? "#f9fafb" : "#ffffff",
                          color: selectedCount === 0 ? "#9ca3af" : "#111827",
                          cursor: selectedCount === 0 ? "default" : "pointer",
                          fontSize: 12,
                          textAlign: "left",
                        }}
                      >
                        <span>Assign tags / groups</span>
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
                      {sessionTags[r.id] && sessionTags[r.id].length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {sessionTags[r.id].map(tag => (
                            <span
                              key={tag.id}
                              style={{
                                borderRadius: 999,
                                border: "1px solid #d1d5db",
                                padding: "1px 6px",
                                fontSize: 11,
                                backgroundColor: "#f9fafb",
                                color: "#374151",
                              }}
                            >
                              {tag.label}
                            </span>
                          ))}
                        </div>
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
                                  backgroundColor: "#16a34a", // green fill
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
                                  fontWeight: 700,
                                  color: "#1d4ed8", // Nexus blue text
                                }}
                              >
                                {clamped}%
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      {(() => {
                        if (!r.userId) return "—";
                        const meta = correspondenceByUserId[r.userId];
                        if (!meta) return "—";
                        const sent = meta.sentCount ?? 0;
                        const received = meta.receivedCount ?? 0;
                        if (!sent && !received) {
                          return <span style={{ color: "#6b7280" }}>—</span>;
                        }

                        const tooltip =
                          meta.direction === "RECEIVED"
                            ? `Received (${received})`
                            : meta.direction === "SENT"
                            ? `Sent (${sent})`
                            : "";

                        return (
                          <div
                            style={{ display: "flex", flexDirection: "column", gap: 2 }}
                            title={tooltip || undefined}
                          >
                            <span style={{ color: "#1d4ed8", fontWeight: 600 }}>
                              Sent ({sent})
                            </span>
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>
                              Received ({received})
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280" }}>
                      {new Date(r.updatedAt || r.createdAt).toLocaleString()}
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
                  <td colSpan={10} style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
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
            onPaste={async e => {
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

              if (typeof window === "undefined") return;
              const token = window.localStorage.getItem("accessToken");
              if (!token) {
                alert("Missing access token. Please log in again.");
                return;
              }

              for (const file of images) {
                try {
                  const metaRes = await fetch(`${API_BASE}/uploads`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      contentType: file.type || "image/png",
                      fileName: file.name || "screenshot.png",
                      scope: "JOURNAL",
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

                  const label = file.name && file.name.trim().length > 0
                    ? file.name
                    : "Screenshot";
                  setBulkJournalAttachments(prev => [...prev, { url: publicUrl, label }]);
                } catch (err: any) {
                  console.error("Failed to upload pasted bulk journal image", err);
                  alert(err?.message ?? "Failed to upload pasted image.");
                  break;
                }
              }
            }}
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
          {bulkJournalAttachments.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11 }}>
              <div style={{ marginBottom: 2 }}>Attached images</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {bulkJournalAttachments.map(att => (
                  <span
                    key={att.url}
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
                    <span>{att.label || att.url}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBulkJournalAttachments(prev => prev.filter(x => x.url !== att.url))
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
            </div>
          )}
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

      {showBulkTagModal && (
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
            <div style={{ fontWeight: 600 }}>Assign tags / groups to selected candidates</div>
            <button
              type="button"
              onClick={() => setShowBulkTagModal(false)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          <p style={{ marginTop: 0, marginBottom: 6, color: "#4b5563" }}>
            Choose one or more tags to apply to all currently selected candidates. Existing
            tags will be preserved; new selections will be added.
          </p>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 4 }}>Existing tags</div>
            {candidateTags.length === 0 ? (
              <div style={{ color: "#6b7280" }}>No candidate tags defined yet.</div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 180,
                  overflowY: "auto",
                  padding: 4,
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                }}
              >
                {candidateTags.map(tag => {
                  const checked = bulkTagSelection.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setBulkTagSelection(prev =>
                            prev.includes(tag.id)
                              ? prev.filter(id => id !== tag.id)
                              : [...prev, tag.id],
                          );
                        }}
                      />
                      <span>{tag.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 4 }}>
            <div style={{ marginBottom: 4 }}>Create new tag</div>
            <input
              value={newTagLabel}
              onChange={e => setNewTagLabel(e.target.value)}
              placeholder="e.g. Team 01"
              style={{
                width: "100%",
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
            <button
              type="button"
              disabled={bulkTagsSaving || !newTagLabel.trim()}
              onClick={async () => {
                const label = newTagLabel.trim();
                if (!label) return;
                if (typeof window === "undefined") return;
                const token = window.localStorage.getItem("accessToken");
                if (!token) {
                  alert("Missing access token. Please log in again.");
                  return;
                }
                setBulkTagsSaving(true);
                try {
                  const res = await fetch(`${API_BASE}/tags/candidates/create`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ label }),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    alert(
                      `Failed to create candidate tag (${res.status}). ${
                        text || "Check your permissions."
                      }`,
                    );
                    return;
                  }
                  const created: CandidateTag = await res.json();
                  setCandidateTags(prev => [...prev, created]);
                  setBulkTagSelection(prev => [...prev, created.id]);
                  setNewTagLabel("");
                } finally {
                  setBulkTagsSaving(false);
                }
              }}
              style={{
                marginTop: 6,
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                background: bulkTagsSaving ? "#e5e7eb" : "#0f172a",
                color: bulkTagsSaving ? "#4b5563" : "#f9fafb",
                fontSize: 12,
                cursor: bulkTagsSaving ? "default" : "pointer",
              }}
            >
              {bulkTagsSaving ? "Saving…" : "Create tag"}
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setShowBulkTagModal(false)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
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
              disabled={bulkTagsSaving || bulkTagSelection.length === 0 || selectedIds.length === 0}
              onClick={async () => {
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
                setBulkTagsSaving(true);
                try {
                  await Promise.all(
                    selected.map(async r => {
                      const existing = sessionTags[r.id] || [];
                      const existingIds = new Set(existing.map(t => t.id));
                      const combinedIds = Array.from(
                        new Set([
                          ...Array.from(existingIds),
                          ...bulkTagSelection,
                        ]),
                      );
                      const res = await fetch(`${API_BASE}/tags/candidates/${r.id}`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ tagIds: combinedIds }),
                      });
                      if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        console.error(
                          `Failed to set tags for candidate ${r.id}:`,
                          res.status,
                          text,
                        );
                      }
                    }),
                  );

                  // Refresh tags after bulk update
                  const ids = filtered.map(r => r.id);
                  const res = await fetch(`${API_BASE}/tags/candidates/batch`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ sessionIds: ids }),
                  });
                  if (res.ok) {
                    const json: any[] = await res.json();
                    const next: Record<string, CandidateTag[]> = {};
                    for (const item of json || []) {
                      if (!item || typeof item.sessionId !== "string" || !item.tag) continue;
                      const sid = item.sessionId;
                      if (!next[sid]) next[sid] = [];
                      next[sid].push({
                        id: item.tag.id,
                        code: item.tag.code,
                        label: item.tag.label,
                        color: item.tag.color ?? null,
                      });
                    }
                    setSessionTags(next);
                  }

                  setShowBulkTagModal(false);
                } finally {
                  setBulkTagsSaving(false);
                }
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #16a34a",
                background:
                  bulkTagsSaving || bulkTagSelection.length === 0 || selectedIds.length === 0
                    ? "#e5e7eb"
                    : "#16a34a",
                color:
                  bulkTagsSaving || bulkTagSelection.length === 0 || selectedIds.length === 0
                    ? "#4b5563"
                    : "#f9fafb",
                fontSize: 12,
                cursor:
                  bulkTagsSaving || bulkTagSelection.length === 0 || selectedIds.length === 0
                    ? "default"
                    : "pointer",
              }}
            >
              {bulkTagsSaving ? "Saving…" : "Apply to selected"}
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
        {shareResult && (
          <span style={{ marginLeft: 8, color: "#16a34a" }}>{shareResult}</span>
        )}
      </div>
    </section>
  );
}
