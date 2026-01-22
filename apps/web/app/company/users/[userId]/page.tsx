"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatPhone } from "../../../lib/phone";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SkillRow {
  id: string;
  code: string;
  label: string;
  categoryLabel: string | null;
  tradeLabel: string | null;

  // Aggregate rating (employer + client), available to all viewers.
  aggregateAvgLevel: number | null;
  aggregateRatingCount: number;

  // Breakdown values: only visible to admins+ (API returns null for others).
  selfLevel: number | null;
  employerAvgLevel: number | null;
  employerRatingCount: number | null;
  clientAvgLevel: number | null;
  clientRatingCount: number | null;
}

interface HrDto {
  displayEmail?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  bankName?: string | null;
  bankAddress?: string | null;
  hipaaNotes?: string | null;
  hourlyRate?: number | null;
  dayRate?: number | null;
  cpHourlyRate?: number | null;
  candidateDesiredPay?: number | null;
  ssnLast4?: string | null;
  itinLast4?: string | null;
  bankAccountLast4?: string | null;
  bankRoutingLast4?: string | null;
  hasSsn?: boolean;
  hasItin?: boolean;
  hasBankAccount?: boolean;
  hasBankRouting?: boolean;
  documents?: {
    id: string;
    type: string;
    fileUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
  }[];
}

interface WorkerDto {
  id: string;
  fullName: string | null;
  status: string | null;
  defaultProjectCode: string | null;
  primaryClassCode: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  unionLocal: string | null;
  dateHired: string | null;
  totalHoursCbs: number | null;
  totalHoursCct: number | null;
  defaultPayRate: number | null;
  defaultHoursPerDay: number | null;
  billRate: number | null;
  cpRate: number | null;
  cpRole: string | null;
  cpFringeRate: number | null;
}

interface UserProfileDto {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  globalRole: string;
  userType: string;
  company: { id: string; name: string };
  companyRole: string;
  canEditHr?: boolean;
  canViewHr?: boolean;
  canEditWorkerComp?: boolean;
  hr?: HrDto | null;
  worker?: WorkerDto | null;
  reputation: {
    avg: number;
    count: number;
    override: number | null;
  };
  portfolio?: {
    headline: string | null;
    bio: string | null;
    photoUrl: string | null;
    updatedAt?: string;
  } | null;
  skills: SkillRow[];
}

export default function CompanyUserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [canRate, setCanRate] = useState(false);
  const [canClientRate, setCanClientRate] = useState(false);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Skills matrix style: category groups start collapsed by default.
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  // Employer skill rating (admins+)
  const [employerLevel, setEmployerLevel] = useState<string>("");
  const [employerNotes, setEmployerNotes] = useState("");
  const [employerSaving, setEmployerSaving] = useState(false);
  const [employerError, setEmployerError] = useState<string | null>(null);

  // Overall reputation rating (admins+)
  const [overallLevel, setOverallLevel] = useState<string>("");
  const [overallNotes, setOverallNotes] = useState("");
  const [overallSaving, setOverallSaving] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);

  // Client skill rating
  const [clientLevel, setClientLevel] = useState<string>("");
  const [clientComment, setClientComment] = useState("");
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // HR (confidential) card: shown only when backend provides HR payload and
  // collapsed by default so sensitive details are not immediately visible.
  const [hrCollapsed, setHrCollapsed] = useState(true);
  const [savingHr, setSavingHr] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [hrHourlyRate, setHrHourlyRate] = useState<string>("");
  const [hrDayRate, setHrDayRate] = useState<string>("");
  const [hrCpHourlyRate, setHrCpHourlyRate] = useState<string>("");
  const [hrCandidateDesiredPay, setHrCandidateDesiredPay] = useState<string>("");

  // HR journal: internal case log for this worker/user.
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<
    {
      id: string;
      body: string;
      createdAt: string;
      senderEmail?: string | null;
      attachments?: { id: string; url: string; filename?: string | null }[];
    }[]
  >([]);
  const [journalDraft, setJournalDraft] = useState("");
  const [savingJournal, setSavingJournal] = useState(false);
  const [journalAttachments, setJournalAttachments] = useState<
    { url: string; label?: string }[]
  >([]);
  const [shareJournalWithWorker, setShareJournalWithWorker] = useState(false);

  // Admin-only: per-skill rating details (including comments)
  const [detailsBySkillId, setDetailsBySkillId] = useState<Record<string, any>>({});
  const [detailsLoadingBySkillId, setDetailsLoadingBySkillId] = useState<Record<string, boolean>>({});
  const [detailsErrorBySkillId, setDetailsErrorBySkillId] = useState<Record<string, string | null>>({});

  // Identity editing (admin+)
  const [identityFirstName, setIdentityFirstName] = useState("");
  const [identityLastName, setIdentityLastName] = useState("");
  const [identityUserType, setIdentityUserType] = useState<string>("");
  const [identityGlobalRole, setIdentityGlobalRole] = useState<string>("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Worker editing (contact + compensation), gated by canEditWorkerComp
  const [workerPhone, setWorkerPhone] = useState<string>("");
  const [workerStatus, setWorkerStatus] = useState<string>("");
  const [workerDefaultProjectCode, setWorkerDefaultProjectCode] = useState<string>("");
  const [workerPrimaryClassCode, setWorkerPrimaryClassCode] = useState<string>("");
  const [workerAddressLine1, setWorkerAddressLine1] = useState<string>("");
  const [workerAddressLine2, setWorkerAddressLine2] = useState<string>("");
  const [workerCity, setWorkerCity] = useState<string>("");
  const [workerState, setWorkerState] = useState<string>("");
  const [workerPostalCode, setWorkerPostalCode] = useState<string>("");
  const [workerUnionLocal, setWorkerUnionLocal] = useState<string>("");
  const [workerDateHired, setWorkerDateHired] = useState<string>("");
  const [workerPayRate, setWorkerPayRate] = useState<string>("");
  // Day rate is derived from hourly (hours-per-day units) but kept as its own
  // state so edits in either field keep the other in sync.
  const [workerDayRate, setWorkerDayRate] = useState<string>("");
  // Units for converting hourly ↔ day rate; UI-only for now, default 10 hours.
  const [workerHoursPerDay, setWorkerHoursPerDay] = useState<string>("10");
  const [workerBillRate, setWorkerBillRate] = useState<string>("");
  const [workerCpRate, setWorkerCpRate] = useState<string>("");
  const [workerCpRole, setWorkerCpRole] = useState<string>("");
  const [workerCpFringe, setWorkerCpFringe] = useState<string>("");
  const [workerSaving, setWorkerSaving] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  // Worker market comparison (state occupational wages)
  const [workerMarketComp, setWorkerMarketComp] = useState<any | null>(null);
  const [workerMarketLoading, setWorkerMarketLoading] = useState(false);
  const [workerMarketError, setWorkerMarketError] = useState<string | null>(null);
  const [showMarketDetails, setShowMarketDetails] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem("accessToken");

    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [profileRes, meRes] = await Promise.all([
          fetch(`${API_BASE}/users/${userId}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!profileRes.ok) {
          const text = await profileRes.text();
          throw new Error(`Failed to load user profile (${profileRes.status}): ${text}`);
        }
        const profileJson = await profileRes.json();
        setProfile(profileJson);

        // Initialize editable identity fields from loaded profile.
        setIdentityFirstName(profileJson.firstName ?? "");
        setIdentityLastName(profileJson.lastName ?? "");
        setIdentityUserType(profileJson.userType ?? "");
        setIdentityGlobalRole(profileJson.globalRole ?? "");

        if (profileJson.worker) {
          setWorkerPhone(profileJson.worker.phone ?? "");
          setWorkerStatus(profileJson.worker.status ?? "");
          setWorkerDefaultProjectCode(profileJson.worker.defaultProjectCode ?? "");
          setWorkerPrimaryClassCode(profileJson.worker.primaryClassCode ?? "");
          setWorkerAddressLine1(profileJson.worker.addressLine1 ?? "");
          setWorkerAddressLine2(profileJson.worker.addressLine2 ?? "");
          setWorkerCity(profileJson.worker.city ?? "");
          setWorkerState(profileJson.worker.state ?? "");
          setWorkerPostalCode(profileJson.worker.postalCode ?? "");
          setWorkerUnionLocal(profileJson.worker.unionLocal ?? "");
          setWorkerDateHired(
            profileJson.worker.dateHired
              ? profileJson.worker.dateHired.substring(0, 10)
              : "",
          );
          setWorkerPayRate(
            profileJson.worker.defaultPayRate != null
              ? String(profileJson.worker.defaultPayRate)
              : "",
          );
          const hoursFromApi =
            profileJson.worker.defaultHoursPerDay != null
              ? profileJson.worker.defaultHoursPerDay
              : 10;
          setWorkerHoursPerDay(String(hoursFromApi));
          if (profileJson.worker.defaultPayRate != null) {
            setWorkerDayRate(String(profileJson.worker.defaultPayRate * hoursFromApi));
          } else {
            setWorkerDayRate("");
          }
          setWorkerBillRate(
            profileJson.worker.billRate != null ? String(profileJson.worker.billRate) : "",
          );
          setWorkerCpRate(
            profileJson.worker.cpRate != null ? String(profileJson.worker.cpRate) : "",
          );
          setWorkerCpRole(profileJson.worker.cpRole ?? "");
          setWorkerCpFringe(
            profileJson.worker.cpFringeRate != null
              ? String(profileJson.worker.cpFringeRate)
              : "",
          );
        }

        // Default selection to the first skill so the right panel has context.
        if (Array.isArray(profileJson?.skills) && profileJson.skills[0]?.id) {
          setSelectedSkillId(prev => prev ?? profileJson.skills[0].id);
        }

        if (meRes.ok) {
          const me = await meRes.json();

          const isSuperAdmin = me.globalRole === "SUPER_ADMIN";
          setIsSuperAdmin(!!isSuperAdmin);
          const actorMemberships = Array.isArray(me.memberships) ? me.memberships : [];
          const targetCompanyId = profileJson?.company?.id;

          // Determine if actor can rate / view breakdown as employer (OWNER/ADMIN in this company)
          if (targetCompanyId) {
            const membership = actorMemberships.find((m: any) => m.companyId === targetCompanyId);
            if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
              setCanRate(true);
              setIsAdminOrAbove(true);
            }
          }

          if (isSuperAdmin) {
            setCanRate(true);
            setIsAdminOrAbove(true);
          }

          // Determine if actor is a client user who can leave client ratings
          if (me.userType === "CLIENT") {
            setCanClientRate(true);
          }
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load user profile.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [userId]);

  useEffect(() => {
    // Load worker market comparison once we have a worker and token.
    const workerId = profile?.worker?.id;
    if (!workerId) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    async function loadMarket() {
      try {
        setWorkerMarketLoading(true);
        setWorkerMarketError(null);

        const res = await fetch(`${API_BASE}/workers/${workerId}/market-comp`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load market comparison (${res.status})`);
        }

        const json = await res.json();
        if (!cancelled) {
          setWorkerMarketComp(json);
        }
      } catch (e: any) {
        if (!cancelled) {
          setWorkerMarketError(e?.message ?? "Failed to load market comparison.");
        }
      } finally {
        if (!cancelled) {
          setWorkerMarketLoading(false);
        }
      }
    }

    void loadMarket();

    return () => {
      cancelled = true;
    };
  }, [profile?.worker?.id]);

  useEffect(() => {
    // Keep hooks above conditional returns to avoid "Rendered more hooks than during the previous render".
    if (!profile) return;
    if (!isAdminOrAbove) return;
    if (!selectedSkillId) return;

    const profileId = profile.id;
    const skillId = selectedSkillId;

    if (detailsBySkillId[skillId]) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    async function loadDetails() {
      try {
        setDetailsLoadingBySkillId(prev => ({ ...prev, [skillId]: true }));
        setDetailsErrorBySkillId(prev => ({ ...prev, [skillId]: null }));

        const res = await fetch(
          `${API_BASE}/skills/workers/${profileId}/details/${skillId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load skill details (${res.status})`);
        }

        const json = await res.json();
        setDetailsBySkillId(prev => ({ ...prev, [skillId]: json }));
      } catch (e: any) {
        setDetailsErrorBySkillId(prev => ({
          ...prev,
          [skillId]: e?.message ?? "Failed to load details",
        }));
      } finally {
        setDetailsLoadingBySkillId(prev => ({ ...prev, [skillId]: false }));
      }
    }

    void loadDetails();
  }, [profile, isAdminOrAbove, selectedSkillId, detailsBySkillId]);

  // Load HR journal entries when HR can view this worker.
  useEffect(() => {
    if (!profile) return;
    if (!profile.id) return;
    if (!profile.canViewHr && !profile.hr) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    async function loadJournal() {
      if (!profile) return;
      try {
        setJournalLoading(true);
        setJournalError(null);
        const userIdForJournal = profile.id;
        const res = await fetch(`${API_BASE}/messages/journal/user/${userIdForJournal}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load journal (${res.status}) ${text}`);
        }
        const json = await res.json();
        const msgs = Array.isArray(json?.messages) ? json.messages : [];
        if (cancelled) return;
        setJournalEntries(
          msgs.map((m: any) => ({
            id: m.id,
            body: m.body ?? "",
            createdAt: m.createdAt,
            senderEmail: m.senderEmail ?? null,
            attachments: Array.isArray(m.attachments)
              ? m.attachments.map((att: any) => ({
                  id: att.id,
                  url: att.url,
                  filename: att.filename ?? null,
                }))
              : [],
          })),
        );
      } catch (e: any) {
        if (!cancelled) setJournalError(e?.message ?? "Failed to load journal entries.");
      } finally {
        if (!cancelled) setJournalLoading(false);
      }
    }

    void loadJournal();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading user profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>User profile</h1>
        <p style={{ color: "#b91c1c" }}>{error || "User not found"}</p>
      </div>
    );
  }

  const displayedReputation = profile.reputation.override ?? profile.reputation.avg;
  const canViewHr = profile.canViewHr ?? !!profile.hr;
  const canEditHrFields = profile.canEditHr ?? false;
  const hasWorker = !!profile.worker;
  const hr = (profile.hr as HrDto | null) || {};
  const hasHrData = !!profile.hr;

  const workerLink =
    profile.worker && profile.worker.id
      ? `/workers/${profile.worker.id}/weeks`
      : null;

  // Initialize editable HR compensation fields from the HR portfolio payload
  // (when available). These are HR-only screening/export rates and are distinct
  // from the Worker record compensation fields.
  useEffect(() => {
    const hrPayload = profile.hr as HrDto | null | undefined;
    if (!hrPayload) {
      setHrHourlyRate("");
      setHrDayRate("");
      setHrCpHourlyRate("");
      setHrCandidateDesiredPay("");
      return;
    }

    setHrHourlyRate(
      typeof hrPayload.hourlyRate === "number" && !Number.isNaN(hrPayload.hourlyRate)
        ? String(hrPayload.hourlyRate)
        : "",
    );
    setHrDayRate(
      typeof hrPayload.dayRate === "number" && !Number.isNaN(hrPayload.dayRate)
        ? String(hrPayload.dayRate)
        : "",
    );
    setHrCpHourlyRate(
      typeof hrPayload.cpHourlyRate === "number" && !Number.isNaN(hrPayload.cpHourlyRate)
        ? String(hrPayload.cpHourlyRate)
        : "",
    );
    setHrCandidateDesiredPay(
      typeof hrPayload.candidateDesiredPay === "number" &&
      !Number.isNaN(hrPayload.candidateDesiredPay)
        ? String(hrPayload.candidateDesiredPay)
        : "",
    );
  }, [profile.hr]);

  const displayName =
    profile.firstName || profile.lastName
      ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()
      : profile.worker?.fullName || profile.email;

  // Worker avatar: prefer portfolio photo synced from onboarding; fall back to
  // a neutral silhouette so the layout stays consistent even when no photo is
  // on file yet.
  const workerPhotoUrl = profile.portfolio?.photoUrl || "/people-icon-users.jpg";
  const hasPortfolioPhoto = !!profile.portfolio?.photoUrl;

  const canEditNames = isAdminOrAbove;
  const canEditUserType = isAdminOrAbove;
  const canEditGlobalRole = isSuperAdmin;
  const canEditWorkerComp = !!profile.canEditWorkerComp && !!profile.worker;

  async function handleSaveIdentity(e?: FormEvent) {
    if (e) e.preventDefault();
    setIdentityError(null);

    if (!profile) {
      setIdentityError("Profile not loaded.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setIdentityError("Missing access token. Please log in again.");
      return;
    }

    const promises: Promise<any>[] = [];

    const nextFirst = identityFirstName.trim();
    const nextLast = identityLastName.trim();
    const nextUserType = identityUserType as string;
    const nextGlobalRole = identityGlobalRole as string;

    const hasNameChange =
      canEditNames &&
      (nextFirst !== (profile.firstName ?? "") || nextLast !== (profile.lastName ?? ""));
    const hasUserTypeChange =
      canEditUserType && nextUserType && nextUserType !== (profile.userType ?? "");
    const hasGlobalRoleChange =
      canEditGlobalRole && nextGlobalRole && nextGlobalRole !== (profile.globalRole ?? "");

    if (!hasNameChange && !hasUserTypeChange && !hasGlobalRoleChange) {
      setIdentityError("No changes to save.");
      return;
    }

    try {
      setIdentitySaving(true);

      if (hasNameChange) {
        promises.push(
          fetch(`${API_BASE}/users/${profile.id}/profile`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              firstName: nextFirst,
              lastName: nextLast,
            }),
          }),
        );
      }

      if (hasUserTypeChange) {
        promises.push(
          fetch(`${API_BASE}/users/${profile.id}/user-type`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ userType: nextUserType }),
          }),
        );
      }

      if (hasGlobalRoleChange) {
        promises.push(
          fetch(`${API_BASE}/users/${profile.id}/global-role`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ globalRole: nextGlobalRole }),
          }),
        );
      }

      const results = await Promise.all(promises);

      for (const res of results) {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to save identity changes (${res.status}).`);
        }
      }

      setProfile(prev =>
        prev
          ? {
              ...prev,
              firstName: hasNameChange ? nextFirst || null : prev.firstName ?? null,
              lastName: hasNameChange ? nextLast || null : prev.lastName ?? null,
              userType: hasUserTypeChange ? nextUserType : prev.userType,
              globalRole: hasGlobalRoleChange ? nextGlobalRole : prev.globalRole,
            }
          : prev,
      );
    } catch (err: any) {
      setIdentityError(err?.message ?? "Failed to save identity changes.");
    } finally {
      setIdentitySaving(false);
    }
  }

  async function handleSaveWorkerComp(e?: FormEvent) {
    if (e) e.preventDefault();
    setWorkerError(null);

    if (!profile?.worker || !canEditWorkerComp) {
      setWorkerError("Worker record not available.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setWorkerError("Missing access token. Please log in again.");
      return;
    }

    const parseRate = (value: string): number | null | undefined => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (Number.isNaN(n)) return undefined;
      return n;
    };

    const nextPay = parseRate(workerPayRate);
    const nextBill = parseRate(workerBillRate);
    const nextCp = parseRate(workerCpRate);
    const nextCpFringe = parseRate(workerCpFringe);
    const nextHours = parseRate(workerHoursPerDay);

    if (
      nextPay === undefined ||
      nextBill === undefined ||
      nextCp === undefined ||
      nextCpFringe === undefined ||
      nextHours === undefined
    ) {
      setWorkerError("Rates must be numeric when provided.");
      return;
    }

    try {
      setWorkerSaving(true);
      const body: any = {
        phone: workerPhone.trim() || null,
        status: workerStatus.trim() || null,
        defaultProjectCode: workerDefaultProjectCode.trim() || null,
        primaryClassCode: workerPrimaryClassCode.trim() || null,
        addressLine1: workerAddressLine1.trim() || null,
        addressLine2: workerAddressLine2.trim() || null,
        city: workerCity.trim() || null,
        state: workerState.trim() || null,
        postalCode: workerPostalCode.trim() || null,
        unionLocal: workerUnionLocal.trim() || null,
        dateHired: workerDateHired.trim() || null,
      };
      if (nextPay !== undefined) body.defaultPayRate = nextPay;
      if (nextBill !== undefined) body.billRate = nextBill;
      if (nextCp !== undefined) body.cpRate = nextCp;
      if (nextCpFringe !== undefined) body.cpFringeRate = nextCpFringe;
      if (nextHours !== undefined) body.defaultHoursPerDay = nextHours;
      body.cpRole = workerCpRole.trim() || null;

      const res = await fetch(`${API_BASE}/workers/${profile.worker.id}/comp`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to save worker compensation (${res.status}).`);
      }

      const updated = await res.json();

      setProfile(prev =>
        prev
          ? {
              ...prev,
              worker: prev.worker
                ? {
                    ...prev.worker,
                    phone: updated.phone ?? prev.worker.phone,
                    status: updated.status ?? prev.worker.status,
                    defaultProjectCode:
                      updated.defaultProjectCode ?? prev.worker.defaultProjectCode,
                    primaryClassCode:
                      updated.primaryClassCode ?? prev.worker.primaryClassCode,
                    addressLine1: updated.addressLine1 ?? prev.worker.addressLine1,
                    addressLine2: updated.addressLine2 ?? prev.worker.addressLine2,
                    city: updated.city ?? prev.worker.city,
                    state: updated.state ?? prev.worker.state,
                    postalCode: updated.postalCode ?? prev.worker.postalCode,
                    unionLocal: updated.unionLocal ?? prev.worker.unionLocal,
                    dateHired: updated.dateHired ?? prev.worker.dateHired,
                    defaultPayRate:
                      updated.defaultPayRate != null
                        ? updated.defaultPayRate
                        : prev.worker.defaultPayRate,
                    billRate:
                      updated.billRate != null ? updated.billRate : prev.worker.billRate,
                    cpRate: updated.cpRate != null ? updated.cpRate : prev.worker.cpRate,
                    cpRole: updated.cpRole ?? prev.worker.cpRole,
                  }
                : prev.worker,
            }
          : prev,
      );
    } catch (err: any) {
      setWorkerError(err?.message ?? "Failed to save worker compensation.");
    } finally {
      setWorkerSaving(false);
    }
  }

  async function handleAddEmployerRating(e: FormEvent) {
    e.preventDefault();
    setEmployerError(null);

    if (!selectedSkillId || !employerLevel) {
      setEmployerError("Select a skill and level.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setEmployerError("Missing access token.");
      return;
    }

    if (!profile) {
      setEmployerError("Profile not loaded.");
      return;
    }

    try {
      setEmployerSaving(true);
      const res = await fetch(`${API_BASE}/skills/workers/${profile.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skillId: selectedSkillId,
          level: Number(employerLevel),
          comment: employerNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to add rating (${res.status}): ${text}`);
      }
      const updated = await res.json();

      // updated is UserSkillRating for this skill
      setProfile(prev =>
        prev
          ? {
              ...prev,
              skills: prev.skills.map(s => {
                if (s.id !== updated.skillId) return s;

                const employerAvgLevel = updated.employerAvgLevel ?? null;
                const employerRatingCount = updated.employerRatingCount ?? null;

                const employerCount = employerRatingCount ?? 0;
                const clientCount = s.clientRatingCount ?? 0;
                const totalCount = employerCount + clientCount;

                const sum =
                  (employerAvgLevel != null ? employerAvgLevel * employerCount : 0) +
                  (s.clientAvgLevel != null ? s.clientAvgLevel * clientCount : 0);

                const aggregateAvgLevel = totalCount > 0 ? sum / totalCount : null;

                return {
                  ...s,
                  employerAvgLevel,
                  employerRatingCount,
                  aggregateAvgLevel,
                  aggregateRatingCount: totalCount,
                };
              }),
            }
          : prev
      );

      setEmployerLevel("");
      setEmployerNotes("");
    } catch (err: any) {
      setEmployerError(err.message || "Failed to add rating.");
    } finally {
      setEmployerSaving(false);
    }
  }

  async function handleAddClientRating(e: FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (!selectedSkillId || !clientLevel) {
      setClientError("Select a skill and level.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setClientError("Missing access token.");
      return;
    }

    if (!profile) {
      setClientError("Profile not loaded.");
      return;
    }

    try {
      setClientSaving(true);
      const res = await fetch(`${API_BASE}/skills/clients/${profile.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skillId: selectedSkillId,
          level: Number(clientLevel),
          comment: clientComment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to add client rating (${res.status}): ${text}`);
      }
      const updated = await res.json();

      // updated is UserSkillRating for this skill
      setProfile(prev =>
        prev
          ? {
              ...prev,
              skills: prev.skills.map(s => {
                if (s.id !== updated.skillId) return s;

                const clientAvgLevel = updated.clientAvgLevel ?? null;
                const clientRatingCount = updated.clientRatingCount ?? null;

                const employerCount = s.employerRatingCount ?? 0;
                const clientCount = clientRatingCount ?? 0;
                const totalCount = employerCount + clientCount;

                const sum =
                  (s.employerAvgLevel != null ? s.employerAvgLevel * employerCount : 0) +
                  (clientAvgLevel != null ? clientAvgLevel * clientCount : 0);

                const aggregateAvgLevel = totalCount > 0 ? sum / totalCount : null;

                return {
                  ...s,
                  clientAvgLevel,
                  clientRatingCount,
                  aggregateAvgLevel,
                  aggregateRatingCount: totalCount,
                };
              }),
            }
          : prev
      );

      setClientLevel("");
      setClientComment("");
    } catch (err: any) {
      setClientError(err.message || "Failed to add client rating.");
    } finally {
      setClientSaving(false);
    }
  }

  const NEXUS_DARK_BLUE = "#0f172a";
  const NEXUS_GOLD = "#facc15";

  const fmtCurrency = (value: number | null | undefined) =>
    typeof value === "number" ? value.toFixed(2) : "—";

  const fmtSignedCurrency = (value: number | null | undefined) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    const fixed = value.toFixed(2);
    if (value > 0) return `+${fixed}`;
    return fixed;
  };

  const renderStars = (value: number | null, size: number) => {
    const filledCount = value == null ? 0 : Math.round(value);
    return (
      <div style={{ display: "inline-flex", gap: 3, verticalAlign: "middle" }}>
        {Array.from({ length: 5 }, (_, idx) => {
          const starValue = idx + 1;
          const active = filledCount >= starValue;
          return (
            <svg
              key={starValue}
              width={size}
              height={size}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2.5l2.47 5.01 5.53.8-4 3.9.94 5.49L12 15.9l-4.94 2.8.94-5.49-4-3.9 5.53-.8L12 2.5z"
                fill={active ? NEXUS_GOLD : "#ffffff"}
                stroke={NEXUS_DARK_BLUE}
                strokeWidth={1}
              />
            </svg>
          );
        })}
      </div>
    );
  };

  const getSkillSort = (s: SkillRow): { rated: boolean; score: number } => {
    // Prefer aggregate (employer+client) if present, otherwise fall back to self.
    if (typeof s.aggregateAvgLevel === "number" && s.aggregateRatingCount > 0) {
      return { rated: true, score: s.aggregateAvgLevel };
    }

    if (typeof s.selfLevel === "number") {
      return { rated: true, score: s.selfLevel };
    }

    return { rated: false, score: -1 };
  };

  const categoryNames = Array.from(
    new Set(profile.skills.map(s => (s.categoryLabel || "Other").trim() || "Other"))
  );

  const categoryGroups = categoryNames
    .map(categoryLabel => {
      const groupSkills = profile.skills
        .filter(s => {
          const cat = (s.categoryLabel || "Other").trim() || "Other";
          return cat === categoryLabel;
        })
        .sort((a, b) => {
          const aSort = getSkillSort(a);
          const bSort = getSkillSort(b);

          if (aSort.rated !== bSort.rated) return aSort.rated ? -1 : 1;
          if (bSort.score !== aSort.score) return bSort.score - aSort.score;
          return a.label.localeCompare(b.label);
        });

      const ratedSelf = groupSkills.filter(
        s => typeof s.selfLevel === "number" && s.selfLevel >= 1 && s.selfLevel <= 5
      );
      const avgSelf = ratedSelf.length
        ? ratedSelf.reduce((sum, s) => sum + (s.selfLevel as number), 0) / ratedSelf.length
        : null;

      const ratedAgg = groupSkills.filter(s => getSkillSort(s).rated);
      const maxScore = ratedAgg.reduce((max, s) => {
        const { score } = getSkillSort(s);
        return score > max ? score : max;
      }, -1);

      // For display: still compute a weighted aggregate where possible.
      const ratedByAgg = groupSkills.filter(
        s => s.aggregateAvgLevel != null && s.aggregateRatingCount > 0
      );
      const aggCount = ratedByAgg.reduce((sum, s) => sum + s.aggregateRatingCount, 0);
      const aggSum = ratedByAgg.reduce(
        (sum, s) => sum + (s.aggregateAvgLevel as number) * s.aggregateRatingCount,
        0,
      );
      const avgAggregate = aggCount > 0 ? aggSum / aggCount : null;

      const peerRated = groupSkills.filter(s => s.employerAvgLevel != null);
      const avgPeer = peerRated.length
        ? peerRated.reduce((sum, s) => sum + (s.employerAvgLevel as number), 0) / peerRated.length
        : null;

      const clientRated = groupSkills.filter(s => s.clientAvgLevel != null);
      const avgClient = clientRated.length
        ? clientRated.reduce((sum, s) => sum + (s.clientAvgLevel as number), 0) / clientRated.length
        : null;

      return {
        categoryLabel,
        skills: groupSkills,
        ratedCount: ratedAgg.length,
        totalCount: groupSkills.length,
        avgSelf,
        avgPeer,
        avgClient,
        avgAggregate,
        maxScore,
      };
    })
    .filter(g => g.totalCount > 0)
    .sort((a, b) => {
      if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
      if (b.ratedCount !== a.ratedCount) return b.ratedCount - a.ratedCount;
      return a.categoryLabel.localeCompare(b.categoryLabel);
    });

  const totalSkills = profile.skills.length;
  const ratedSkills = profile.skills.filter(s => getSkillSort(s).rated).length;

  return (
    <div
      className="app-card"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ marginBottom: 8 }}>
          <a
            href="/company/users"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#2563eb",
              textDecoration: "none",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 14 }}>
              ←
            </span>
            <span>Return to Company users list</span>
          </a>
        </div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>
          Worker profile{displayName ? ` \u0013 ${displayName}` : ""}
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          {profile.company.name} \u00b7 {profile.companyRole}
        </p>

        <section
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <img
            src={workerPhotoUrl}
            alt={displayName || "Worker profile photo"}
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              objectFit: "cover",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
            }}
          />
          <div style={{ fontSize: 12, color: "#111827" }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Photo on file</div>
            {hasPortfolioPhoto ? (
              <a
                href={workerPhotoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#2563eb", textDecoration: "none", fontSize: 11 }}
              >
                View full-size
              </a>
            ) : (
              <span style={{ fontSize: 11, color: "#6b7280" }}>No uploaded photo yet</span>
            )}
          </div>
        </section>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 0", minWidth: 320, order: 2 }}>
          <section>
              <h2 style={{ fontSize: 16, marginBottom: 4 }}>Identity</h2>

              {canEditNames ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <label style={{ fontSize: 12, flex: "0 0 160px" }}>
                    <div style={{ color: "#6b7280", marginBottom: 2 }}>First name</div>
                    <input
                      type="text"
                      value={identityFirstName}
                      onChange={e => setIdentityFirstName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </label>
                  <label style={{ fontSize: 12, flex: "0 0 160px" }}>
                    <div style={{ color: "#6b7280", marginBottom: 2 }}>Last name</div>
                    <input
                      type="text"
                      value={identityLastName}
                      onChange={e => setIdentityLastName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </label>
                </div>
              ) : (
                <p style={{ fontSize: 13 }}>
                  <strong>Name:</strong>{" "}
                  {profile.firstName || profile.lastName
                    ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()
                    : "—"}
                </p>
              )}

              <p style={{ fontSize: 13 }}>
                <strong>Email:</strong>{" "}
                <a
                  href={`mailto:${profile.email}`}
                  style={{ color: "#2563eb", textDecoration: "none" }}
                >
                  {profile.email}
                </a>
              </p>

              <p style={{ fontSize: 13 }}>
                <strong>User type:</strong>{" "}
                {canEditUserType ? (
                  <select
                    value={identityUserType}
                    onChange={e => setIdentityUserType(e.target.value)}
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
                  profile.userType
                )}
              </p>
              <p style={{ fontSize: 13 }}>
                <strong>Global role:</strong>{" "}
                {canEditGlobalRole ? (
                  <select
                    value={identityGlobalRole}
                    onChange={e => setIdentityGlobalRole(e.target.value)}
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
                  profile.globalRole
                )}
              </p>

              {(canEditNames || canEditUserType || canEditGlobalRole) && (
                <form
                  onSubmit={handleSaveIdentity}
                  style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}
                >
                  <button
                    type="submit"
                    disabled={identitySaving}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      backgroundColor: identitySaving ? "#e5e7eb" : "#0f172a",
                      color: identitySaving ? "#4b5563" : "#f9fafb",
                      fontSize: 12,
                      cursor: identitySaving ? "default" : "pointer",
                    }}
                  >
                    {identitySaving ? "Saving…" : "Save identity"}
                  </button>
                  {identityError && (
                    <span style={{ fontSize: 12, color: "#b91c1c" }}>{identityError}</span>
                  )}
                </form>
              )}
            </section>

            <section style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 16, marginBottom: 4 }}>Worker record</h2>
              {!hasWorker || !profile.worker ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  No Data in records – personnel records incomplete.
                </p>
              ) : (
                <div style={{ fontSize: 13 }}>
                  <div>
                    <strong>Worker:</strong>{" "}
                    {profile.worker.fullName || "Imported worker"}
                    {workerLink && (
                      <>
                        {" "}·{" "}
                        <a
                          href={workerLink}
                          style={{ color: "#2563eb", textDecoration: "none", fontSize: 12 }}
                        >
                          View weekly hours
                        </a>
                      </>
                    )}
                  </div>
                  <div>
                    <strong>Status:</strong>{" "}
                    {canEditWorkerComp ? (
                      <input
                        type="text"
                        value={workerStatus}
                        onChange={e => setWorkerStatus(e.target.value)}
                        style={{
                          fontSize: 12,
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          minWidth: 120,
                        }}
                      />
                    ) : (
                      <span>{profile.worker.status || "—"}</span>
                    )}
                  </div>
                  <div>
                    <strong>Worker phone:</strong>{" "}
                    {canEditWorkerComp ? (
                      <input
                        type="tel"
                        value={workerPhone}
                        onChange={e => setWorkerPhone(e.target.value)}
                        style={{
                          fontSize: 12,
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          minWidth: 160,
                        }}
                      />
                    ) : profile.worker.phone ? (
                      (() => {
                        const formatted = formatPhone(
                          profile.worker?.phone ?? null,
                          profile.hr?.country ?? "US",
                        );
                        if (!formatted) return profile.worker?.phone;
                        return (
                          <a
                            href={formatted.href}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            {formatted.display}
                          </a>
                        );
                      })()
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  {canEditWorkerComp ? (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Assignment & classification</div>
                      <div>
                        <strong>Default project code:</strong>{" "}
                        <input
                          type="text"
                          value={workerDefaultProjectCode}
                          onChange={e => setWorkerDefaultProjectCode(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 80,
                          }}
                        />
                      </div>
                      <div>
                        <strong>Primary class code:</strong>{" "}
                        <input
                          type="text"
                          value={workerPrimaryClassCode}
                          onChange={e => setWorkerPrimaryClassCode(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 100,
                          }}
                        />
                      </div>
                      <div>
                        <strong>Union local:</strong>{" "}
                        <input
                          type="text"
                          value={workerUnionLocal}
                          onChange={e => setWorkerUnionLocal(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 100,
                          }}
                        />
                      </div>
                      <div>
                        <strong>Date hired:</strong>{" "}
                        <input
                          type="date"
                          value={workerDateHired}
                          onChange={e => setWorkerDateHired(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 140,
                          }}
                        />
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <strong>Address:</strong>{" "}
                        <div>
                          <input
                            type="text"
                            placeholder="Address line 1"
                            value={workerAddressLine1}
                            onChange={e => setWorkerAddressLine1(e.target.value)}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              minWidth: 220,
                              marginBottom: 2,
                            }}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Address line 2"
                            value={workerAddressLine2}
                            onChange={e => setWorkerAddressLine2(e.target.value)}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              minWidth: 220,
                              marginBottom: 2,
                            }}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="City"
                            value={workerCity}
                            onChange={e => setWorkerCity(e.target.value)}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              minWidth: 120,
                              marginRight: 4,
                            }}
                          />
                          <input
                            type="text"
                            placeholder="State"
                            value={workerState}
                            onChange={e => setWorkerState(e.target.value)}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              width: 60,
                              marginRight: 4,
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Postal code"
                            value={workerPostalCode}
                            onChange={e => setWorkerPostalCode(e.target.value)}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              width: 90,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : profile.worker.city ? (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {profile.worker.city}
                      {profile.worker.state ? `, ${profile.worker.state}` : ""}
                      {profile.worker.postalCode ? ` ${profile.worker.postalCode}` : ""}
                    </div>
                  ) : null}
                  {canEditWorkerComp && (
                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Compensation</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                          <label style={{ flex: "0 0 140px" }}>
                            <span>
                              <strong>Base pay (hourly)</strong>
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              value={workerPayRate}
                              onChange={e => {
                                const val = e.target.value;
                                setWorkerPayRate(val);
                                const n = Number(val);
                                const hours = Number(workerHoursPerDay) || 10;
                                if (!Number.isNaN(n)) {
                                  setWorkerDayRate(String(n * hours));
                                } else if (!val.trim()) {
                                  setWorkerDayRate("");
                                }
                              }}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              width: "100%",
                            }}
                          />
                        </label>
                        <label style={{ flex: "0 0 160px" }}>
                          <span>
                            <strong>Base pay (day)</strong>
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={workerDayRate}
                            onChange={e => {
                              const val = e.target.value;
                              setWorkerDayRate(val);
                              const n = Number(val);
                              const hours = Number(workerHoursPerDay) || 10;
                              if (!Number.isNaN(n) && hours > 0) {
                                setWorkerPayRate(String(n / hours));
                              } else if (!val.trim()) {
                                setWorkerPayRate("");
                              }
                            }}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              width: "100%",
                            }}
                          />
                        </label>
                        <label style={{ flex: "0 0 120px" }}>
                          <span>
                            <strong>Units (hrs / day)</strong>
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={workerHoursPerDay}
                            onChange={e => {
                              const val = e.target.value;
                              setWorkerHoursPerDay(val);
                              const hours = Number(val) || 10;
                              const hourly = Number(workerPayRate);
                              if (!Number.isNaN(hourly)) {
                                setWorkerDayRate(String(hourly * hours));
                              }
                            }}
                            style={{
                              fontSize: 12,
                              padding: "2px 4px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              width: "100%",
                            }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <strong>Bill rate (hourly):</strong>{" "}
                        <input
                          type="number"
                          step="0.01"
                          value={workerBillRate}
                          onChange={e => setWorkerBillRate(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 100,
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <strong>CP hourly rate:</strong>{" "}
                        <input
                          type="number"
                          step="0.01"
                          value={workerCpRate}
                          onChange={e => setWorkerCpRate(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 100,
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <strong>CP estimated fringe ($/hr):</strong>{" "}
                        <input
                          type="number"
                          step="0.01"
                          value={workerCpFringe}
                          onChange={e => setWorkerCpFringe(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 100,
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        <strong>CP wage code / classification:</strong>{" "}
                        <input
                          type="text"
                          value={workerCpRole}
                          onChange={e => setWorkerCpRole(e.target.value)}
                          style={{
                            fontSize: 12,
                            padding: "2px 4px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            minWidth: 140,
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={workerSaving}
                        onClick={handleSaveWorkerComp}
                        style={{
                          marginTop: 4,
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #0f172a",
                          backgroundColor: workerSaving ? "#e5e7eb" : "#0f172a",
                          color: workerSaving ? "#4b5563" : "#f9fafb",
                          fontSize: 12,
                          cursor: workerSaving ? "default" : "pointer",
                        }}
                      >
                        {workerSaving ? "Saving…" : "Save worker rates"}
                      </button>
                      {workerError && (
                        <div style={{ marginTop: 2, fontSize: 11, color: "#b91c1c" }}>
                          {workerError}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 12,
                          padding: 8,
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                          backgroundColor: "#f9fafb",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                          Market comparison (state benchmark)
                        </div>
                        {workerMarketLoading && (
                          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                            Loading market comparison…
                          </p>
                        )}
                        {workerMarketError && (
                          <p style={{ fontSize: 12, color: "#b91c1c", margin: 0 }}>
                            {workerMarketError}
                          </p>
                        )}
                        {!workerMarketLoading && !workerMarketError && workerMarketComp && (
                          <div style={{ fontSize: 12 }}>
                            {workerMarketComp.message && (
                              <p
                                style={{
                                  margin: 0,
                                  marginBottom: 4,
                                  color: "#6b7280",
                                }}
                              >
                                {workerMarketComp.message}
                              </p>
                            )}
                            {workerMarketComp.market && (
                              <>
                                <p style={{ margin: 0, marginBottom: 4 }}>
                                  <strong>
                                    {workerMarketComp.market.stateCode} ·{" "}
                                    {workerMarketComp.market.socCode}
                                  </strong>{" "}
                                  – {workerMarketComp.market.occupationName}
                                </p>
                                <ul style={{ paddingLeft: 16, margin: 0 }}>
                                  <li>
                                    Worker base hourly: $
                                    {fmtCurrency(workerMarketComp.worker?.baseHourly)} (median: $
                                    {fmtCurrency(workerMarketComp.market.hourlyMedian)})
                                  </li>
                                  <li>
                                    CP total (base + fringe): $
                                    {fmtCurrency(workerMarketComp.worker?.cpTotalHourly)}
                                  </li>
                                  <li>
                                    Market P25 / P75: $
                                    {fmtCurrency(workerMarketComp.market.hourlyP25)} / $
                                    {fmtCurrency(workerMarketComp.market.hourlyP75)}
                                  </li>
                                </ul>
                                {workerMarketComp.comparisons && (
                                  <p style={{ margin: 0, marginTop: 4 }}>
                                    <span style={{ fontWeight: 600 }}>Base vs median: </span>
                                    <span
                                      style={{
                                        color:
                                          typeof workerMarketComp.comparisons
                                            .baseVsMedian === "number"
                                            ? workerMarketComp.comparisons
                                                .baseVsMedian > 0
                                              ? "#16a34a"
                                              : workerMarketComp.comparisons
                                                  .baseVsMedian < 0
                                              ? "#b91c1c"
                                              : "#374151"
                                            : "#374151",
                                      }}
                                    >
                                      {fmtSignedCurrency(
                                        workerMarketComp.comparisons.baseVsMedian,
                                      )}
                                    </span>
                                  </p>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setShowMarketDetails(prev => !prev)}
                                  style={{
                                    marginTop: 6,
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    border: "1px solid #d1d5db",
                                    backgroundColor: "#f3f4f6",
                                    fontSize: 11,
                                    cursor: "pointer",
                                  }}
                                >
                                  {showMarketDetails ? "Hide percentile details" : "Show percentile details"}
                                </button>
                                {showMarketDetails && (
                                  <ul
                                    style={{
                                      paddingLeft: 16,
                                      margin: 0,
                                      marginTop: 4,
                                      color: "#4b5563",
                                    }}
                                  >
                                    <li>
                                      P10: ${fmtCurrency(workerMarketComp.market.hourlyP10)}
                                    </li>
                                    <li>
                                      P25: ${fmtCurrency(workerMarketComp.market.hourlyP25)}
                                    </li>
                                    <li>
                                      Median (P50): $
                                      {fmtCurrency(workerMarketComp.market.hourlyMedian)}
                                    </li>
                                    <li>
                                      P75: ${fmtCurrency(workerMarketComp.market.hourlyP75)}
                                    </li>
                                    <li>
                                      P90: ${fmtCurrency(workerMarketComp.market.hourlyP90)}
                                    </li>
                                  </ul>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 16, marginBottom: 4 }}>Reputation (overall)</h2>
              <p style={{ fontSize: 13 }}>
                <strong>Rating:</strong> {displayedReputation.toFixed(1)} / 5 ·
                <span style={{ marginLeft: 4 }}>
                  {profile.reputation.count} rating{profile.reputation.count === 1 ? "" : "s"}
                </span>
              </p>
              {profile.reputation.override != null && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  (Includes admin override of {profile.reputation.override}/5)
                </p>
              )}
              {canRate && (
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    setOverallError(null);
                    const token = localStorage.getItem("accessToken");
                    if (!token) {
                      setOverallError("Missing access token.");
                      return;
                    }
                    if (!overallLevel) {
                      setOverallError("Select a level.");
                      return;
                    }
                    try {
                      setOverallSaving(true);
                      const res = await fetch(`${API_BASE}/reputation/user/${profile.id}/overall`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ score: Number(overallLevel), comment: overallNotes.trim() || undefined }),
                      });
                      if (!res.ok) {
                        const text = await res.text();
                        throw new Error(`Failed to submit overall rating (${res.status}): ${text}`);
                      }
                      setOverallLevel("");
                      setOverallNotes("");
                    } catch (err: any) {
                      setOverallError(err.message || "Failed to submit overall rating.");
                    } finally {
                      setOverallSaving(false);
                    }
                  }}
                  style={{
                    marginTop: 8,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Add overall employer rating:</span>
                  <select
                    value={overallLevel}
                    onChange={e => setOverallLevel(e.target.value)}
                    style={{
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="">Level…</option>
                    <option value="1">1 – Novice</option>
                    <option value="2">2 – Beginner</option>
                    <option value="3">3 – Competent</option>
                    <option value="4">4 – Proficient</option>
                    <option value="5">5 – Expert</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Optional comment"
                    value={overallNotes}
                    onChange={e => setOverallNotes(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 200,
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={overallSaving}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      backgroundColor: overallSaving ? "#e5e7eb" : "#0f172a",
                      color: overallSaving ? "#4b5563" : "#f9fafb",
                      cursor: overallSaving ? "default" : "pointer",
                    }}
                  >
                    {overallSaving ? "Saving…" : "Save overall rating"}
                  </button>
                  {overallError && (
                    <span style={{ color: "#b91c1c" }}>{overallError}</span>
                  )}
                </form>
              )}
            </section>
          </div>

          {canViewHr && (
            <section
              style={{
                flex: "0 0 420px",
                maxWidth: 460,
                fontSize: 13,
                alignSelf: "stretch",
                minHeight: 0,
                order: 1,
              }}
            >
              {canViewHr && (
                <div
                style={{
                  marginTop: hasWorker ? 8 : 0,
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid #fee2e2",
                  background: "#fef2f2",
                  fontSize: 13,
                }}
              >
                <button
                  type="button"
                  onClick={() => setHrCollapsed(prev => !prev)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: 0,
                    margin: 0,
                    border: "none",
                    background: "transparent",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <span>HR (confidential)</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {hrCollapsed ? "Show" : "Hide"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        border: `1px solid ${hrCollapsed ? "#b91c1c" : "#16a34a"}`,
                        color: hrCollapsed ? "#b91c1c" : "#166534",
                        backgroundColor: hrCollapsed ? "#fef2f2" : "#ecfdf3",
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                      }}
                    >
                      {hrCollapsed ? "Lock" : "Open"}
                    </span>
                  </span>
                </button>

                {!hrCollapsed && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Editable HR contact snapshot for this worker. Changes here update
                      the worker's HR portfolio for this company only.
                    </div>
                    {!hasHrData && (
                      <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
                        No Data in records – personnel records incomplete.
                      </div>
                    )}
                    {hr && (hr.hasSsn || hr.hasBankAccount || hr.hasBankRouting) && (
                      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                        <div>
                          <strong>Identifiers on file:</strong>{" "}
                          {hr.hasSsn ? (
                            <span>SSN ending in {hr.ssnLast4 ?? "••••"}</span>
                          ) : (
                            <span>No SSN on file</span>
                          )}
                        </div>
                        <div>
                          <strong>Bank account:</strong>{" "}
                          {hr.hasBankAccount ? (
                            <span>Acct ending in {hr.bankAccountLast4 ?? "••••"}</span>
                          ) : (
                            <span>No account on file</span>
                          )}
                        </div>
                        <div>
                          <strong>Routing:</strong>{" "}
                          {hr.hasBankRouting ? (
                            <span>Routing ending in {hr.bankRoutingLast4 ?? "••••"}</span>
                          ) : (
                            <span>No routing on file</span>
                          )}
                        </div>
                      </div>
                    )}

                    {Array.isArray(hr?.documents) && hr.documents.length > 0 && (
                      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Attachments on file</div>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {hr.documents.map(doc => {
                            const type = (doc.type || "").toUpperCase();
                            if (!doc.fileUrl) return null;
                            if (type === "PHOTO") {
                              return (
                                <li key={doc.id} style={{ marginBottom: 4 }}>
                                  <strong>Photo:</strong>{" "}
                                  <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#2563eb", textDecoration: "none" }}
                                  >
                                    View photo
                                  </a>
                                </li>
                              );
                            }
                            if (type === "GOV_ID") {
                              return (
                                <li key={doc.id} style={{ marginBottom: 4 }}>
                                  <strong>Government ID:</strong>{" "}
                                  <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#2563eb", textDecoration: "none" }}
                                  >
                                    View ID {doc.fileName ? `(${doc.fileName})` : ""}
                                  </a>
                                </li>
                              );
                            }
                            return (
                              <li key={doc.id} style={{ marginBottom: 4 }}>
                                <strong>Attachment:</strong>{" "}
                                <a
                                  href={doc.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {doc.fileName || doc.type || "View attachment"}
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {!canEditHrFields && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                        You can view HR contact details for this worker but do not have permission to edit them.
                      </div>
                    )}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <label style={{ flex: "1 1 220px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>HR email</div>
                        <input
                          type="email"
                          value={hr.displayEmail ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          displayEmail: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          placeholder={profile.email}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                      <label style={{ flex: "1 1 180px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>HR phone</div>
                        <input
                          type="tel"
                          value={hr.phone ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          phone: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          placeholder="(555) 555-5555"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <label style={{ flex: "1 1 260px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Address line 1</div>
                        <input
                          type="text"
                          value={hr.addressLine1 ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          addressLine1: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                      <label style={{ flex: "1 1 220px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Address line 2</div>
                        <input
                          type="text"
                          value={hr.addressLine2 ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          addressLine2: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <label style={{ flex: "1 1 180px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>City</div>
                        <input
                          type="text"
                          value={hr.city ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          city: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                      <label style={{ flex: "0 0 100px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>State</div>
                        <input
                          type="text"
                          value={hr.state ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          state: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                      <label style={{ flex: "0 0 120px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Postal code</div>
                        <input
                          type="text"
                          value={hr.postalCode ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          postalCode: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                      <label style={{ flex: "0 0 120px" }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Country</div>
                        <input
                          type="text"
                          value={hr.country ?? ""}
                          onChange={e =>
                            canEditHrFields
                              ? setProfile(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hr: {
                                          ...(prev.hr || {}),
                                          country: e.target.value,
                                        },
                                      }
                                    : prev,
                                )
                              : undefined
                          }
                          disabled={!canEditHrFields}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </label>
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 8,
                        borderTop: "1px dashed #e5e7eb",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>HR-only compensation</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                        <label style={{ flex: "0 0 140px" }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Hourly rate</div>
                          <input
                            type="number"
                            step="0.01"
                            value={hrHourlyRate}
                            onChange={e => {
                              const val = e.target.value;
                              setHrHourlyRate(val);
                              const n = Number(val);
                              const hours = Number(workerHoursPerDay) || 10;
                              if (!Number.isNaN(n)) {
                                setHrDayRate(String(n * hours));
                              } else if (!val.trim()) {
                                setHrDayRate("");
                              }
                            }}
                            disabled={!canEditHrFields}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                        </label>
                        <label style={{ flex: "0 0 140px" }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Day rate</div>
                          <input
                            type="number"
                            step="0.01"
                            value={hrDayRate}
                            onChange={e => {
                              const val = e.target.value;
                              setHrDayRate(val);
                              const n = Number(val);
                              const hours = Number(workerHoursPerDay) || 10;
                              if (!Number.isNaN(n) && hours > 0) {
                                setHrHourlyRate(String(n / hours));
                              } else if (!val.trim()) {
                                setHrHourlyRate("");
                              }
                            }}
                            disabled={!canEditHrFields}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                        </label>
                        <label style={{ flex: "0 0 160px" }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>CP hourly rate</div>
                          <input
                            type="number"
                            step="0.01"
                            value={hrCpHourlyRate}
                            onChange={e => setHrCpHourlyRate(e.target.value)}
                            disabled={!canEditHrFields}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                        </label>
                        <label style={{ flex: "0 0 180px" }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Candidate desired pay</div>
                          <input
                            type="number"
                            step="0.01"
                            value={hrCandidateDesiredPay}
                            onChange={e => setHrCandidateDesiredPay(e.target.value)}
                            disabled={!canEditHrFields}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                        Units: {(Number(workerHoursPerDay) || 10).toString()} hrs / day.
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        Stored in the encrypted HR portfolio; used for HR screening and CP/export only.
                      </div>
                    </div>

                    {canEditHrFields && (
                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          disabled={savingHr}
                          onClick={async () => {
                          if (!profile) return;
                          const token = localStorage.getItem("accessToken");
                          if (!token) {
                            setHrError("Missing access token. Please log in again.");
                            return;
                          }
                          try {
                            setSavingHr(true);
                            setHrError(null);
                            const currentHr = profile.hr || {};

                            const parseRate = (value: string): number | null | undefined => {
                              const trimmed = value.trim();
                              if (!trimmed) return null;
                              const n = Number(trimmed);
                              if (Number.isNaN(n)) return undefined;
                              return n;
                            };

                            const nextHourly = parseRate(hrHourlyRate);
                            const nextDay = parseRate(hrDayRate);
                            const nextCpHourly = parseRate(hrCpHourlyRate);
                            const nextDesired = parseRate(hrCandidateDesiredPay);

                            if (
                              nextHourly === undefined ||
                              nextDay === undefined ||
                              nextCpHourly === undefined ||
                              nextDesired === undefined
                            ) {
                              throw new Error("Rates must be numeric when provided.");
                            }

                            const body: any = {
                              displayEmail: currentHr.displayEmail ?? null,
                              phone: currentHr.phone ?? null,
                              addressLine1: currentHr.addressLine1 ?? null,
                              addressLine2: currentHr.addressLine2 ?? null,
                              city: currentHr.city ?? null,
                              state: currentHr.state ?? null,
                              postalCode: currentHr.postalCode ?? null,
                              country: currentHr.country ?? null,
                            };

                            if (nextHourly !== undefined) body.hourlyRate = nextHourly;
                            if (nextDay !== undefined) body.dayRate = nextDay;
                            if (nextCpHourly !== undefined) body.cpHourlyRate = nextCpHourly;
                            if (nextDesired !== undefined) body.candidateDesiredPay = nextDesired;
                            const res = await fetch(
                              `${API_BASE}/users/${profile.id}/portfolio-hr`,
                              {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify(body),
                              },
                            );
                            if (!res.ok) {
                              const text = await res.text().catch(() => "");
                              throw new Error(
                                `Failed to save HR contact (${res.status}) ${text}`,
                              );
                            }
                            const json = await res.json();
                            setProfile(json);
                          } catch (e: any) {
                            setHrError(e?.message ?? "Failed to save HR contact.");
                          } finally {
                            setSavingHr(false);
                          }
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 4,
                          border: "1px solid #0f172a",
                          backgroundColor: savingHr ? "#e5e7eb" : "#0f172a",
                          color: savingHr ? "#4b5563" : "#f9fafb",
                          fontSize: 12,
                          cursor: savingHr ? "default" : "pointer",
                        }}
                      >
                        {savingHr ? "Saving" : "Save HR contact"}
                        </button>
                        {hrError && (
                          <span style={{ fontSize: 11, color: "#b91c1c" }}>{hrError}</span>
                        )}
                      </div>
                    )}

                    {/* HR Journal (internal log) */}
                    <div
                      id="journal"
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px dashed #e5e7eb",
                      }}
                    >
                      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Journal</h3>
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
                        Internal notes and message history related to this worker. Workers may
                        see high-level message history on their own journal board, but HR-only
                        notes remain internal unless explicitly shared.
                      </p>

                      {journalLoading ? (
                        <p style={{ fontSize: 12, color: "#6b7280" }}>Loading journal…</p>
                      ) : journalError ? (
                        <p style={{ fontSize: 12, color: "#b91c1c" }}>{journalError}</p>
                      ) : journalEntries.length === 0 ? (
                        <p style={{ fontSize: 12, color: "#6b7280" }}>No journal entries yet.</p>
                      ) : (
                        <div
                          style={{
                            maxHeight: 220,
                            overflowY: "auto",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            background: "#ffffff",
                            padding: 8,
                          }}
                        >
                          <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}>
                            {journalEntries.map(entry => (
                              <li
                                key={entry.id}
                                style={{
                                  padding: "6px 4px",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                              >
                                <div style={{ color: "#6b7280", fontSize: 11 }}>
                                  {new Date(entry.createdAt).toLocaleString()}
                                  {entry.senderEmail && (
                                    <>
                                      {" "}· <span>{entry.senderEmail}</span>
                                    </>
                                  )}
                                </div>
                                <div style={{ whiteSpace: "pre-wrap", color: "#111827" }}>
                                  {entry.body}
                                </div>
                                {entry.attachments && entry.attachments.length > 0 && (
                                  <div style={{ marginTop: 4, fontSize: 11 }}>
                                    {entry.attachments.map(att => {
                                      const name = (att.filename || att.url || "").toLowerCase();
                                      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
                                      if (isImage) {
                                        return (
                                          <div
                                            key={att.id}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 8,
                                              marginBottom: 4,
                                            }}
                                          >
                                            <a
                                              href={att.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 8,
                                              }}
                                            >
                                              <img
                                                src={att.url}
                                                alt={att.filename || "Screenshot"}
                                                style={{
                                                  width: 72,
                                                  height: 72,
                                                  objectFit: "cover",
                                                  borderRadius: 6,
                                                  border: "1px solid #e5e7eb",
                                                  backgroundColor: "#f9fafb",
                                                }}
                                              />
                                              <span
                                                style={{
                                                  color: "#2563eb",
                                                  textDecoration: "underline",
                                                }}
                                              >
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
                                            style={{
                                              color: "#2563eb",
                                              textDecoration: "underline",
                                            }}
                                          >
                                            {att.filename || att.url}
                                          </a>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Simple inline add-entry box for HR */}
                      <form
                        onSubmit={async e => {
                          e.preventDefault();
                          if (!journalDraft.trim() || !profile?.id) return;
                          const token = window.localStorage.getItem("accessToken");
                          if (!token) {
                            alert("Missing access token. Please log in again.");
                            return;
                          }
                          try {
                            setSavingJournal(true);
                            const res = await fetch(
                              `${API_BASE}/messages/journal/user/${profile.id}/entries`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({
                                  body: journalDraft.trim(),
                                  shareWithSubject: shareJournalWithWorker,
                                  attachments:
                                    journalAttachments.length > 0
                                      ? journalAttachments.map(att => ({
                                          kind: "UPLOADED_FILE",
                                          url: att.url,
                                          filename: att.label || null,
                                        }))
                                      : undefined,
                                }),
                              },
                            );
                            if (!res.ok) {
                              const text = await res.text().catch(() => "");
                              throw new Error(
                                `Failed to add journal entry (${res.status}) ${text}`,
                              );
                            }
                            const json = await res.json();
                            const created = json?.message ?? json;
                            setJournalEntries(prev => [
                              {
                                id: created.id,
                                body: created.body ?? journalDraft.trim(),
                                createdAt: created.createdAt ?? new Date().toISOString(),
                                senderEmail: created.senderEmail ?? null,
                                attachments:
                                  journalAttachments.length > 0
                                    ? journalAttachments.map((att, idx) => ({
                                        id: `${created.id}-att-${idx}`,
                                        url: att.url,
                                        filename: att.label || null,
                                      }))
                                    : [],
                              },
                              ...prev,
                            ]);
                            setJournalDraft("");
                            setJournalAttachments([]);
                            setShareJournalWithWorker(false);
                          } catch (err: any) {
                            alert(err?.message ?? "Failed to add journal entry.");
                          } finally {
                            setSavingJournal(false);
                          }
                        }}
                        style={{
                          marginTop: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <label style={{ fontSize: 12, color: "#4b5563" }}>
                          Add HR-only journal note
                          <textarea
                            value={journalDraft}
                            onChange={e => setJournalDraft(e.target.value)}
                            rows={3}
                            style={{
                              marginTop: 4,
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                              fontFamily:
                                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                            }}
                          />
                        </label>
                        {journalAttachments.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 11 }}>
                            <div style={{ marginBottom: 2 }}>Attached images</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {journalAttachments.map(att => (
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
                                      setJournalAttachments(prev =>
                                        prev.filter(x => x.url !== att.url),
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
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 11,
                          }}
                        >
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={shareJournalWithWorker}
                              onChange={e => setShareJournalWithWorker(e.target.checked)}
                            />
                            <span>Share this note with the worker via Messages</span>
                          </label>
                          <button
                            type="submit"
                            disabled={savingJournal || !journalDraft.trim()}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 4,
                              border: "1px solid #0f172a",
                              backgroundColor:
                                savingJournal || !journalDraft.trim()
                                  ? "#e5e7eb"
                                  : "#0f172a",
                              color:
                                savingJournal || !journalDraft.trim()
                                  ? "#4b5563"
                                  : "#f9fafb",
                              fontSize: 12,
                              cursor:
                                savingJournal || !journalDraft.trim() ? "default" : "pointer",
                            }}
                          >
                            {savingJournal ? "Saving…" : "Add journal entry"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
            </section>
          )}
        </div>

        <hr
          style={{
            marginTop: 16,
            marginBottom: 12,
            border: 0,
            borderTop: "1px solid #e5e7eb",
          }}
        />
      </div>

      <section style={{ marginTop: 0, flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>Skills</h2>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Rated {ratedSkills}/{totalSkills} skills
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "stretch", flex: "1 1 auto", minHeight: 0 }}>
          {/* Left: compact matrix (groupings + ratings) */}
          <div style={{ flex: "0 0 760px", maxWidth: 760, minHeight: 0, display: "flex" }}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  tableLayout: "fixed",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", width: 320 }}>Skill</th>
                    {isAdminOrAbove ? (
                      <>
                        <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 140 }}>
                          Self
                        </th>
                        <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 140 }}>
                          Peer
                        </th>
                        <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 140 }}>
                          Client
                        </th>
                      </>
                    ) : (
                      <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 180 }}>
                        Rating
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {categoryGroups.map((g, gIdx) => {
                    const expanded = !!expandedCategories[g.categoryLabel];
                    const roundedSelf = g.avgSelf != null ? Math.round(g.avgSelf) : null;
                    const roundedAgg = g.avgAggregate != null ? Math.round(g.avgAggregate) : null;

                    return (
                      <Fragment key={g.categoryLabel}>
                        <tr
                          style={{
                            backgroundColor: gIdx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                          }}
                        >
                          <td
                            style={{
                              padding: "10px 10px",
                              borderTop: "1px solid #e5e7eb",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                            onClick={() =>
                              setExpandedCategories(prev => ({
                                ...prev,
                                [g.categoryLabel]: !prev[g.categoryLabel],
                              }))
                            }
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span>
                                {expanded ? "▾" : "▸"} {g.categoryLabel}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                                Rated {g.ratedCount}/{g.totalCount}
                              </span>
                            </div>
                          </td>

                          {isAdminOrAbove ? (
                            <>
                              <td
                                style={{
                                  padding: "10px 10px",
                                  borderTop: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(roundedSelf, 14)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgSelf != null ? `${g.avgSelf.toFixed(1)}/5` : "—"}
                                  </span>
                                </div>
                              </td>
                              <td
                                style={{
                                  padding: "10px 10px",
                                  borderTop: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(g.avgPeer, 12)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgPeer != null ? `${g.avgPeer.toFixed(1)}/5` : "—"}
                                  </span>
                                </div>
                              </td>
                              <td
                                style={{
                                  padding: "10px 10px",
                                  borderTop: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(g.avgClient, 12)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgClient != null ? `${g.avgClient.toFixed(1)}/5` : "—"}
                                  </span>
                                </div>
                              </td>
                            </>
                          ) : (
                            <td
                              style={{
                                padding: "10px 10px",
                                borderTop: "1px solid #e5e7eb",
                                whiteSpace: "nowrap",
                                textAlign: "left",
                              }}
                            >
                              {g.avgAggregate == null ? (
                                <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                              ) : (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(roundedAgg, 14)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgAggregate.toFixed(1)}/5
                                  </span>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>

                        {expanded &&
                          g.skills.map((skill, idx) => {
                            const selected = selectedSkillId === skill.id;

                            return (
                              <tr
                                key={skill.id}
                                onClick={() => {
                                  setSelectedSkillId(skill.id);
                                  setEmployerLevel("");
                                  setEmployerNotes("");
                                  setClientLevel("");
                                  setClientComment("");
                                }}
                                style={{
                                  backgroundColor: selected
                                    ? "#eff6ff"
                                    : idx % 2 === 0
                                    ? "#ffffff"
                                    : "#fcfcfd",
                                  cursor: "pointer",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "8px 10px 8px 26px",
                                    borderTop: "1px solid #e5e7eb",
                                    fontWeight: selected ? 600 : 400,
                                    borderLeft: selected ? "3px solid #2563eb" : "3px solid transparent",
                                  }}
                                >
                                  <div>{skill.label}</div>
                                  {skill.tradeLabel && (
                                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                                      {skill.tradeLabel}
                                    </div>
                                  )}
                                </td>

                                {isAdminOrAbove ? (
                                  <>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        borderTop: "1px solid #e5e7eb",
                                        whiteSpace: "nowrap",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(skill.selfLevel, 16)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.selfLevel != null ? `${skill.selfLevel}/5` : "—"}
                                        </span>
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        borderTop: "1px solid #e5e7eb",
                                        whiteSpace: "nowrap",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(skill.employerAvgLevel, 12)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.employerAvgLevel != null
                                            ? `${skill.employerAvgLevel.toFixed(1)}/5 (${skill.employerRatingCount ?? 0})`
                                            : "—"}
                                        </span>
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        borderTop: "1px solid #e5e7eb",
                                        whiteSpace: "nowrap",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(skill.clientAvgLevel, 12)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.clientAvgLevel != null
                                            ? `${skill.clientAvgLevel.toFixed(1)}/5 (${skill.clientRatingCount ?? 0})`
                                            : "—"}
                                        </span>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <td
                                    style={{
                                      padding: "8px 10px",
                                      borderTop: "1px solid #e5e7eb",
                                      whiteSpace: "nowrap",
                                      textAlign: "left",
                                    }}
                                  >
                                    {skill.aggregateAvgLevel == null ? (
                                      <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                                    ) : (
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(Math.round(skill.aggregateAvgLevel), 14)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.aggregateAvgLevel.toFixed(1)}/5 ({skill.aggregateRatingCount})
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}

                  {profile.skills.length === 0 && (
                    <tr>
                      <td
                        colSpan={isAdminOrAbove ? 4 : 2}
                        style={{ padding: "8px", fontSize: 12, color: "#6b7280" }}
                      >
                        No Data in records – personnel records incomplete.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: details panel (comments + future portfolio) */}
          <div style={{ flex: 1, minWidth: 260, minHeight: 0, display: "flex" }}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 12,
                background: "#ffffff",
              }}
            >
              {!selectedSkillId ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>Select a skill to view details.</div>
              ) : (() => {
                const skill = profile.skills.find(s => s.id === selectedSkillId) || null;
                const detailsLoading = !!detailsLoadingBySkillId[selectedSkillId];
                const detailsError = detailsErrorBySkillId[selectedSkillId];
                const details = detailsBySkillId[selectedSkillId];

                if (!skill) {
                  return <div style={{ fontSize: 12, color: "#6b7280" }}>Skill not found.</div>;
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{skill.label}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {(skill.categoryLabel || "Other") + (skill.tradeLabel ? ` · ${skill.tradeLabel}` : "")}
                      </div>
                    </div>

                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Ratings</div>
                      {isAdminOrAbove ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Self</div>
                            {renderStars(skill.selfLevel, 16)}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Peer</div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderStars(skill.employerAvgLevel, 14)}
                              <span style={{ fontSize: 11, color: "#6b7280" }}>
                                {skill.employerAvgLevel != null
                                  ? `${skill.employerAvgLevel.toFixed(1)}/5 (${skill.employerRatingCount ?? 0})`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Client</div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderStars(skill.clientAvgLevel, 14)}
                              <span style={{ fontSize: 11, color: "#6b7280" }}>
                                {skill.clientAvgLevel != null
                                  ? `${skill.clientAvgLevel.toFixed(1)}/5 (${skill.clientRatingCount ?? 0})`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {skill.aggregateAvgLevel == null ? (
                            <span style={{ color: "#6b7280" }}>No ratings yet.</span>
                          ) : (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              {renderStars(Math.round(skill.aggregateAvgLevel), 16)}
                              <span style={{ color: "#6b7280" }}>
                                {skill.aggregateAvgLevel.toFixed(1)}/5 ({skill.aggregateRatingCount})
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {canRate && (
                      <form onSubmit={handleAddEmployerRating} style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Add / update employer rating</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                          <select
                            value={employerLevel}
                            onChange={e => setEmployerLevel(e.target.value)}
                            style={{
                              padding: "4px 6px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                            }}
                          >
                            <option value="">Level…</option>
                            <option value="1">1 – Novice</option>
                            <option value="2">2 – Beginner</option>
                            <option value="3">3 – Competent</option>
                            <option value="4">4 – Proficient</option>
                            <option value="5">5 – Expert</option>
                          </select>
                          <textarea
                            placeholder="Comments / clarifications (optional)"
                            value={employerNotes}
                            onChange={e => setEmployerNotes(e.target.value)}
                            rows={4}
                            style={{
                              flex: 1,
                              minWidth: 220,
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              resize: "vertical",
                            }}
                          />
                          <button
                            type="submit"
                            disabled={employerSaving}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 4,
                              border: "1px solid #0f172a",
                              backgroundColor: employerSaving ? "#e5e7eb" : "#0f172a",
                              color: employerSaving ? "#4b5563" : "#f9fafb",
                              cursor: employerSaving ? "default" : "pointer",
                            }}
                          >
                            {employerSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                        {employerError && (
                          <div style={{ color: "#b91c1c", marginTop: 6 }}>{employerError}</div>
                        )}
                      </form>
                    )}

                    {canClientRate && (
                      <form onSubmit={handleAddClientRating} style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Add client rating</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                          <select
                            value={clientLevel}
                            onChange={e => setClientLevel(e.target.value)}
                            style={{
                              padding: "4px 6px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                            }}
                          >
                            <option value="">Level…</option>
                            <option value="1">1 – Novice</option>
                            <option value="2">2 – Beginner</option>
                            <option value="3">3 – Competent</option>
                            <option value="4">4 – Proficient</option>
                            <option value="5">5 – Expert</option>
                          </select>
                          <textarea
                            placeholder="Client comment (optional)"
                            value={clientComment}
                            onChange={e => setClientComment(e.target.value)}
                            rows={3}
                            style={{
                              flex: 1,
                              minWidth: 220,
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              resize: "vertical",
                            }}
                          />
                          <button
                            type="submit"
                            disabled={clientSaving}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 4,
                              border: "1px solid #0f172a",
                              backgroundColor: clientSaving ? "#e5e7eb" : "#0f172a",
                              color: clientSaving ? "#4b5563" : "#f9fafb",
                              cursor: clientSaving ? "default" : "pointer",
                            }}
                          >
                            {clientSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                        {clientError && (
                          <div style={{ color: "#b91c1c", marginTop: 6 }}>{clientError}</div>
                        )}
                      </form>
                    )}

                    {isAdminOrAbove && (
                      <div style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Peer / client comments</div>
                        {detailsLoading ? (
                          <div style={{ color: "#6b7280" }}>Loading comments…</div>
                        ) : detailsError ? (
                          <div style={{ color: "#b91c1c" }}>{detailsError}</div>
                        ) : (
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 220, flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Peer</div>
                              {details?.peerRatings?.filter((r: any) => r.comment)?.length ? (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {details.peerRatings
                                    .filter((r: any) => r.comment)
                                    .map((r: any) => (
                                      <li key={r.id} style={{ marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600 }}>{r.level}/5</span> — {r.comment}
                                      </li>
                                    ))}
                                </ul>
                              ) : (
                                <div style={{ color: "#6b7280" }}>No peer comments yet.</div>
                              )}
                            </div>
                            <div style={{ minWidth: 220, flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Client</div>
                              {details?.clientRatings?.filter((r: any) => r.comment)?.length ? (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {details.clientRatings
                                    .filter((r: any) => r.comment)
                                    .map((r: any) => (
                                      <li key={r.id} style={{ marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600 }}>{r.level}/5</span> — {r.comment}
                                      </li>
                                    ))}
                                </ul>
                              ) : (
                                <div style={{ color: "#6b7280" }}>No client comments yet.</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Portfolio (Line card / work deck)</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
                        Coming next: uploads + links curated by the tradesman per skill.
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          type="url"
                          placeholder="Add a link (e.g. portfolio page)"
                          disabled
                          style={{
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                          }}
                        />
                        <input type="file" multiple disabled />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
