"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavDropdown from "./components/nav-dropdown";
import { LanguageToggle } from "./components/language-toggle";
import { useLanguage } from "./language-context";
import { NttBadge } from "./components/ntt-badge";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface UserMeResponse {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  globalRole?: string;
  userType?: string;
  memberships: {
    companyId: string;
    role: string;
    company: {
      id: string;
      name: string;
      kind?: string; // SYSTEM vs ORGANIZATION (optional for backward compatibility)
    };
  }[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {messages} = useLanguage();
  const h = messages.header;
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [companyRole, setCompanyRole] = useState<string | null>(null); // OWNER, ADMIN, PM, MEMBER

  const path = pathname ?? "/";
  const isSystemRoute = path.startsWith("/system");
  const isAuthRoute = path === "/login" || path.startsWith("/accept-invite");
  const isPublicRoute =
    path === "/apply" ||
    path.startsWith("/apply/") ||
    path.startsWith("/onboarding/") ||
    path === "/reset-password" ||
    path.startsWith("/reset-password/") ||
    path === "/support";
  const isReferralRoute = path === "/referrals" || path.startsWith("/referrals/");

  // On first load in this browser tab, clear any stale tokens and send the
  // user to the login screen, so deep links don't silently use expired auth.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Public routes (recruiting / onboarding) should never force logout.
    if (isPublicRoute) return;

    // Only run the "initial forced logout" logic when landing on the root
    // path ("/") as an entry point. This avoids blowing away a valid session
    // when opening deep links like /projects in a new tab.
    const currentPath = window.location.pathname || "/";
    if (currentPath !== "/") return;

    const alreadyHandled = window.sessionStorage.getItem("nexusInitialLogoutDone");
    if (alreadyHandled === "1") return;

    // Mark as handled so we only do this once per tab session.
    window.sessionStorage.setItem("nexusInitialLogoutDone", "1");

    if (!isAuthRoute) {
      const currentCompanyId = window.localStorage.getItem("companyId");
      if (currentCompanyId) {
        window.localStorage.setItem("lastCompanyId", currentCompanyId);
      }
      window.localStorage.removeItem("accessToken");
      window.localStorage.removeItem("refreshToken");
      window.localStorage.removeItem("companyId");
      window.location.href = "/login";
    }
  }, [isAuthRoute, isPublicRoute]);

  const handleLogout = () => {
    if (typeof window === "undefined") return;
    const currentCompanyId = window.localStorage.getItem("companyId");
    if (currentCompanyId) {
      window.localStorage.setItem("lastCompanyId", currentCompanyId);
    }
    window.localStorage.removeItem("accessToken");
    window.localStorage.removeItem("refreshToken");
    window.localStorage.removeItem("companyId");
    window.location.href = "/login";
  };

  // Global fetch wrapper: transparently refresh access tokens on 401s for
  // authenticated API requests, using the stored refreshToken.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Debug: verify this effect is running in the browser and that we are
    // patching window.fetch as expected.
    // You should see this once per tab load in the DevTools console.
    try {
      // eslint-disable-next-line no-console
      console.log("[Nexus] AppShell fetch wrapper mounting", window.location?.pathname);
    } catch {}

    const nativeFetch = window.fetch.bind(window);

    const apiOrigin = (() => {
      try {
        return new URL(API_BASE).origin;
      } catch {
        return API_BASE;
      }
    })();

    // Ensure that only one refresh call is in flight at a time so we don't
    // invalidate the refresh token with concurrent /auth/refresh requests.
    let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;

    async function runRefresh(): Promise<{ accessToken: string; refreshToken: string }> {
      const refreshToken = window.localStorage.getItem("refreshToken");
      if (!refreshToken) {
        throw new Error("Missing refresh token");
      }

      const res = await nativeFetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        throw new Error(`Refresh failed with status ${res.status}`);
      }

      const json: any = await res.json();
      if (!json.accessToken || !json.refreshToken) {
        throw new Error("Refresh did not return tokens");
      }

      window.localStorage.setItem("accessToken", json.accessToken);
      window.localStorage.setItem("refreshToken", json.refreshToken);

      try {
        // eslint-disable-next-line no-console
        console.log("[Nexus] token refresh succeeded", {
          apiBase: API_BASE,
          path: "/auth/refresh",
        });
      } catch {}

      return { accessToken: json.accessToken, refreshToken: json.refreshToken };
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl =
        typeof input === "string" || input instanceof URL ? input.toString() : input.url;

      // Only intercept calls going to our API backend.
      if (!requestUrl.startsWith(API_BASE) && !requestUrl.startsWith(apiOrigin)) {
        return nativeFetch(input as any, init as any);
      }

      const firstResponse = await nativeFetch(input as any, init as any);

      // If not 401, or there is clearly no auth involved, just return.
      if (firstResponse.status !== 401) {
        return firstResponse;
      }

      // Avoid trying to refresh when the original request didn't carry auth
      // (e.g. /auth/login). Inspect headers for an Authorization bearer token.
      const hadAuthHeader = (() => {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined),
        );
        return headers.has("Authorization");
      })();

      if (!hadAuthHeader) {
        return firstResponse;
      }

      try {
        if (!refreshPromise) {
          refreshPromise = runRefresh();
        }
        const { accessToken: nextAccessToken } = await refreshPromise;

        // Retry the original request with the new Authorization header.
        const retryInit: RequestInit = { ...(init || {}) };
        const retryHeaders = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined),
        );
        retryHeaders.set("Authorization", `Bearer ${nextAccessToken}`);
        retryInit.headers = retryHeaders;

        return nativeFetch(input as any, retryInit as any);
      } catch {
        // On any unexpected failure during refresh, treat as logged out.
        handleLogout();
        return firstResponse;
      } finally {
        refreshPromise = null;
      }
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  // Bootstrap userType/globalRole from localStorage as early as possible to
  // avoid flicker of nav for APPLICANT users before /users/me returns.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedGlobalRole = window.localStorage.getItem("globalRole");
      const storedUserType = window.localStorage.getItem("userType");
      if (storedGlobalRole) setGlobalRole(storedGlobalRole);
      if (storedUserType) setUserType(storedUserType);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((json: UserMeResponse | null) => {
        if (!json) return;

        const nextGlobalRole = json.globalRole ?? null;
        const nextUserType = json.userType ?? null;

        setGlobalRole(nextGlobalRole);
        setUserType(nextUserType);

        // Determine company-level role for current company
        const currentCompanyId = window.localStorage.getItem("companyId");
        if (currentCompanyId && Array.isArray(json.memberships)) {
          const membership = json.memberships.find(m => m.companyId === currentCompanyId);
          setCompanyRole(membership?.role ?? null);
        }

        // Post-login sync: keep localStorage in sync so layouts that rely on
        // cached globalRole/userType (e.g. /system) behave correctly even
        // after hard reloads or alternate login flows.
        try {
          if (nextGlobalRole) {
            window.localStorage.setItem("globalRole", nextGlobalRole);
          } else {
            window.localStorage.removeItem("globalRole");
          }
          if (nextUserType) {
            window.localStorage.setItem("userType", nextUserType);
          } else {
            window.localStorage.removeItem("userType");
          }
        } catch {
          // best-effort only; ignore storage errors
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  // Poll for unread notifications to drive the header badge.
  // Uses visibility-aware polling to avoid INP attribution accumulation on idle tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    async function loadOnce() {
      // Skip polling when tab is hidden to avoid accumulating INP attribution
      if (document.hidden) return;

      try {
        const res = await fetch(`${API_BASE}/notifications?onlyUnread=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json: any[] = await res.json();
        if (cancelled) return;
        setUnreadCount(Array.isArray(json) ? json.length : 0);
      } catch {
        if (!cancelled) setUnreadCount(null);
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void loadOnce().finally(() => scheduleNext());
      }, 60_000);
    }

    // Initial load
    void loadOnce().finally(() => scheduleNext());

    // Re-poll immediately when tab becomes visible after being hidden
    function handleVisibilityChange() {
      if (!document.hidden && !cancelled) {
        void loadOnce();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // On first load after login, if we have a remembered lastCompanyId and the
  // user has access (or is SUPER_ADMIN), auto-switch company context once so
  // the dropdown and API context match their last selection.
  //
  // IMPORTANT: if we do switch companies, we must reload the page so any
  // already-mounted pages don't keep using a now-stale company context.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    const already = window.sessionStorage.getItem("nexusAutoCompanySwitchDone");
    if (already === "1") return;
    const lastCompanyId = window.localStorage.getItem("lastCompanyId");
    if (!lastCompanyId) return;

    const currentCompanyId = window.localStorage.getItem("companyId");
    if (currentCompanyId && currentCompanyId === lastCompanyId) {
      // Nothing to do; avoid switching + avoid re-running this effect on reload.
      window.sessionStorage.setItem("nexusAutoCompanySwitchDone", "1");
      return;
    }

    (async () => {
      try {
        const meRes = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok) return;
        const me: UserMeResponse = await meRes.json();
        const isSuperAdmin = (me.globalRole ?? null) === "SUPER_ADMIN";
        const hasMembership = Array.isArray(me.memberships)
          ? me.memberships.some(m => m.companyId === lastCompanyId)
          : false;
        if (!isSuperAdmin && !hasMembership) return;

        const switchRes = await fetch(`${API_BASE}/auth/switch-company`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ companyId: lastCompanyId }),
        });
        if (!switchRes.ok) return;
        const json: any = await switchRes.json();
        if (json.accessToken && json.refreshToken && json.company?.id) {
          const nextCompanyId = json.company.id;
          window.localStorage.setItem("accessToken", json.accessToken);
          window.localStorage.setItem("refreshToken", json.refreshToken);
          window.localStorage.setItem("companyId", nextCompanyId);
          window.localStorage.setItem("lastCompanyId", nextCompanyId);
          window.sessionStorage.setItem("nexusAutoCompanySwitchDone", "1");

          // Reload so in-memory app state + any already-mounted pages re-fetch
          // under the correct company context.
          window.location.reload();
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Load the current company name for the header so we can swap org branding
  // while keeping a permanent Nexus brand.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    const companyId = window.localStorage.getItem("companyId");
    if (!token || !companyId) return;

    fetch(`${API_BASE}/companies/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((json: any | null) => {
        if (!json) return;
        if (json.kind === "SYSTEM") {
          setCurrentCompanyName(json.name ?? "Nexus System");
        } else {
          setCurrentCompanyName(json.name ?? null);
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const noMainScroll =
    // Pages that manage their own internal scroll panes
    // NOTE: Previously this disabled scroll for all /company/users/* routes,
    // which caused detail views (e.g. candidate detail) to be clipped when
    // zoomed. We now only disable main scroll on the specific skills matrix
    // page, which manages its own scroll regions.
    path === "/settings/skills";

  // Hide the main app navigation on auth routes like /login so the global menu
  // doesn&apos;t distract first-time candidates during sign-in.
  //
  // On /referrals, show only the focused Nexus Marketplace nav (Learning + FAQs)
  // regardless of user role; on all other authenticated routes, show the full
  // nav.
  const hideNavOnThisPage = isAuthRoute;
  const useMarketplaceNavOnly = isReferralRoute;

  if (isPublicRoute) {
    return (
      <main style={{ minHeight: "100vh", background: "#ffffff" }}>{children}</main>
    );
  }

  const renderApplicantNav = () => (
    <nav className="app-nav">
      <Link
        href="/learning"
        className={
          "app-nav-link" + (isActive("/learning") ? " app-nav-link-active" : "")
        }
      >
        {h.learning}
      </Link>
      <Link
        href="/marketplace-faqs"
        className={
          "app-nav-link" +
          (isActive("/marketplace-faqs") ? " app-nav-link-active" : "")
        }
      >
        {h.marketplaceFaqs}
      </Link>
    </nav>
  );

  const renderStandardNav = () => (
    <nav className="app-nav">
      {globalRole === "SUPER_ADMIN" && !isSystemRoute && (
        <Link
          href="/system"
          className={
            "app-nav-link" +
            (isActive("/system") ? " app-nav-link-active" : "")
          }
        >
          {h.nexusSystem}
        </Link>
      )}

      {(!isSystemRoute || globalRole !== "SUPER_ADMIN") && (
        <>
          {/* Proj Overview = main project workspace (current /projects section) */}
          <Link
            href="/projects"
            className={
              "app-nav-link" +
              (isActive("/projects") ? " app-nav-link-active" : "")
            }
          >
            {h.projOverview}
          </Link>

          {/* Placeholder tabs matching Buildertrend-style menu (without Sales) */}
          <Link
            href="/project-management"
            className={
              "app-nav-link" +
              (isActive("/project-management")
                ? " app-nav-link-active"
                : "")
            }
          >
            {h.projectManagement}
          </Link>
          <Link
            href="/files"
            className={
              "app-nav-link" +
              (isActive("/files") ? " app-nav-link-active" : "")
            }
          >
            {h.files}
          </Link>
          {/* Documents dropdown: hidden for SUPER_ADMIN (they use /system sidebar instead) */}
          {globalRole !== "SUPER_ADMIN" && (
            <NavDropdown
              label="Documents"
              active={isActive("/documents") || isActive("/admin/documents")}
              items={
                companyRole === "OWNER" || companyRole === "ADMIN"
                  ? [
                      { label: "Unpublished eDocs", href: "/admin/documents" },
                      { label: "Published eDocs", href: "/documents" },
                      { label: "Templates", href: "/documents/templates" },
                    ]
                  : [
                      { label: "Published eDocs", href: "/documents" },
                      { label: "Templates", href: "/documents/templates" },
                    ]
              }
            />
          )}
          <Link
            href="/messaging"
            className={
              "app-nav-link" +
              (isActive("/messaging") ? " app-nav-link-active" : "")
            }
          >
            {h.messaging}
          </Link>
          <NavDropdown
            label={h.financial}
            active={path.startsWith("/financial")}
            items={[
              { label: "Overview", href: "/financial" },
              { label: "Logistics", href: "/financial?section=ASSET_LOGISTICS" },
            ]}
          />
          <Link
            href="/reports"
            className={
              "app-nav-link" +
              (isActive("/reports") ? " app-nav-link-active" : "")
            }
          >
            {h.reports}
          </Link>
          <NavDropdown
            label={h.people}
            active={
              path.startsWith("/company/") ||
              path.startsWith("/settings/roles") ||
              path.startsWith("/admin/security")
            }
            items={
              globalRole === "SUPER_ADMIN" || companyRole === "OWNER" || companyRole === "ADMIN"
                ? [
                    { label: h.workerProfiles, href: "/company/users" },
                    {
                      label: h.prospectiveCandidates,
                      href: "/company/users?tab=candidates",
                    },
                    { label: h.openTradesProfile, href: "/company/trades" },
                    { label: h.clientProfiles, href: "/company/clients" },
                    { label: "Roles & permissions", href: "/settings/roles" },
                    { label: "Field Security", href: "/admin/security" },
                  ]
                : [
                    { label: h.workerProfiles, href: "/company/users" },
                    {
                      label: h.prospectiveCandidates,
                      href: "/company/users?tab=candidates",
                    },
                    { label: h.openTradesProfile, href: "/company/trades" },
                    { label: h.clientProfiles, href: "/company/clients" },
                    { label: "Roles & permissions", href: "/settings/roles" },
                  ]
            }
          />
          <Link
            href="/learning"
            className={
              "app-nav-link" +
              (isActive("/learning") ? " app-nav-link-active" : "")
            }
          >
            {h.learning}
          </Link>
          <Link
            href="/marketplace-faqs"
            className={
              "app-nav-link" +
              (isActive("/marketplace-faqs") ? " app-nav-link-active" : "")
            }
          >
            {h.marketplaceFaqs}
          </Link>
        </>
      )}
    </nav>
  );

  const logoHref = isAuthRoute || isPublicRoute ? "/" : "/projects";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <Link href={logoHref} className="app-logo">
            {/* Permanent Nexus Deconstruct Hires brand (animated GIF) */}
            <img
              src="/nexus-deconstruct-hires.gif"
              alt="Nexus Deconstruct Hires"
              className="app-logo-img"
            />
            {/* Per-organization header driven by current company context (hidden on auth/referral routes) */}
            {!isAuthRoute && !isReferralRoute && (
              <div className="app-logo-text">
                <div className="app-logo-subtitle">
                  {currentCompanyName || h.selectOrganization}
                </div>
              </div>
            )}
          </Link>

          {/* Company switcher (hide for applicant pool accounts; hide on auth and /system routes for SUPER_ADMIN) */}
          {!isAuthRoute &&
            !isReferralRoute &&
            userType !== "APPLICANT" &&
            !(isSystemRoute && globalRole === "SUPER_ADMIN") && (
              <div style={{ marginLeft: 16, marginRight: 8 }}>
                <CompanySwitcher />
              </div>
            )}

          {/* Simple back arrow on referrals to return to org workspace */}
          {isReferralRoute && (
            <Link
              href="/projects"
              className="app-nav-link"
              style={{
                marginLeft: 16,
                marginRight: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span aria-hidden="true">←</span>
              <span>Back to your organization</span>
            </Link>
          )}

          {/* Primary app navigation.
              - On /login and /accept-invite, hide the nav entirely.
              - On /referrals, show a focused Nexus Marketplace nav (Learning + FAQs).
              - On all other authenticated routes, show the full workspace nav. */}
          {!hideNavOnThisPage && (useMarketplaceNavOnly ? renderApplicantNav() : renderStandardNav())}
        </div>
        {/* Inline Superuser menu strip moved into SystemLayout; header stays clean here */}

        <div className="app-header-right">
          <LanguageToggle />

          {/* Notifications bell */}
          <Link
            href="/activity"
            style={{
              position: "relative",
              marginLeft: 8,
              marginRight: 4,
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              color: "#111827",
              fontSize: 13,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              minWidth: 32,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>🔔</span>
            {typeof unreadCount === "number" && unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  backgroundColor: "#ef4444",
                  color: "#f9fafb",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          {/* Global referral CTA */}
          <Link
            href="/referrals"
            style={{
              marginLeft: 12,
              marginRight: 8,
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              backgroundColor: "#16a34a", // match green submit state
              color: "#f9fafb",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            Refer a Friend
          </Link>
          {/* User menu */}
          <div style={{ position: "relative" }}>
            <UserMenu onLogout={handleLogout} />
          </div>
        </div>
      </header>
      <main className="app-main" style={noMainScroll ? { overflow: "hidden" } : undefined}>
        {children}
      </main>

      {/* Global Nexus Trouble Ticket badge on authenticated, non-public routes */}
      {!isAuthRoute && !isPublicRoute && <NttBadge />}
    </div>
  );
}

export function PageCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={className ? `app-card ${className}` : "app-card"} style={style}>{children}</div>;
}

function CompanySwitcher() {
  const [memberships, setMemberships] = useState<UserMeResponse["memberships"]>([]);
  const [companies, setCompanies] = useState<
    { id: string; name: string; kind?: string }[]
  >([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    setCurrentCompanyId(window.localStorage.getItem("companyId"));

    setLoading(true);
    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(async (json: UserMeResponse | null) => {
        if (!json) return;

        const membershipCompanies = Array.isArray(json.memberships)
          ? json.memberships.map(m => ({
              id: m.companyId,
              name: m.company?.name ?? m.companyId,
              kind: (m.company as any)?.kind,
            }))
          : [];

        setMemberships(json.memberships ?? []);

        let visibleCompanies = membershipCompanies;

        // SUPER_ADMIN should see all organizations, even if they weren't the creator.
        if (json.globalRole === "SUPER_ADMIN") {
          try {
            const adminRes = await fetch(`${API_BASE}/admin/companies`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (adminRes.ok) {
              const all = await adminRes.json();
              if (Array.isArray(all) && all.length) {
                visibleCompanies = all.map((c: any) => ({
                  id: c.id,
                  name: c.name ?? c.id,
                  kind: c.kind,
                }));
              }
            }
          } catch {
            // fall back to membershipCompanies on error
          }
        }

        setCompanies(visibleCompanies);

        // If no companyId in localStorage, default to the first visible company.
        if (!window.localStorage.getItem("companyId") && visibleCompanies[0]) {
          const firstId = visibleCompanies[0].id;
          window.localStorage.setItem("companyId", firstId);
          setCurrentCompanyId(firstId);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading && !companies.length) {
    return (
      <span style={{ fontSize: 11, color: "#6b7280" }}>Loading companies…</span>
    );
  }

  if (!companies.length || !currentCompanyId) {
    return null;
  }

  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = async (e) => {
    const nextCompanyId = e.target.value;
    if (!nextCompanyId || nextCompanyId === currentCompanyId) return;
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setSwitching(true);
      const res = await fetch(`${API_BASE}/auth/switch-company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyId: nextCompanyId }),
      });
      if (!res.ok) {
        // Soft-fail; keep current company
        return;
      }
      const json: any = await res.json();
      if (json.accessToken && json.refreshToken && json.company?.id) {
        window.localStorage.setItem("accessToken", json.accessToken);
        window.localStorage.setItem("refreshToken", json.refreshToken);
        window.localStorage.setItem("companyId", json.company.id);
        window.localStorage.setItem("lastCompanyId", json.company.id);
        setCurrentCompanyId(json.company.id);
        // Reload app context under new company
        window.location.href = "/projects";
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
      <span style={{ color: "#6b7280" }}>Company:</span>
      <select
        value={currentCompanyId ?? ""}
        onChange={handleChange}
        disabled={switching}
        // Show the current company id on hover so tenants are easy to disambiguate
        title={currentCompanyId ?? undefined}
        style={{
          padding: "2px 6px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 11,
          backgroundColor: switching ? "#e5e7eb" : "#ffffff",
        }}
      >
        {(() => {
          const systemCompanies = companies.filter(c => c.kind === "SYSTEM");
          const orgCompanies = companies.filter(c => c.kind !== "SYSTEM");

          return (
            <>
              {systemCompanies.length > 0 && (
                <optgroup label="System">
                  {systemCompanies.map(c => (
                    <option key={c.id} value={c.id} title={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {orgCompanies.length > 0 && (
                <optgroup label="Organizations">
                  {orgCompanies.map(c => (
                    <option key={c.id} value={c.id} title={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          );
        })()}
      </select>
    </label>
  );
}

function getUserInitials(me: UserMeResponse | null) {
  const first = me?.firstName?.trim() ?? "";
  const last = me?.lastName?.trim() ?? "";

  const a = first[0];
  const b = last[0];
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();

  // Fallback: derive something stable from email.
  const localPart = (me?.email ?? "").split("@")[0] ?? "";
  const parts = localPart.split(/[._\s-]+/).filter(Boolean);
  const e1 = parts[0]?.[0];
  const e2 = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];

  const out = `${e1 ?? "U"}${e2 ?? ""}`.toUpperCase();
  return out.length >= 2 ? out.slice(0, 2) : out;
}

function getUserDisplayName(me: UserMeResponse | null) {
  const first = me?.firstName?.trim();
  const last = me?.lastName?.trim();
  const full = [first, last].filter(Boolean).join(" ");
  return full || me?.email || "Account";
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [me, setMe] = React.useState<UserMeResponse | null>(null);
  const [canManageCompany, setCanManageCompany] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [tokenVersion, setTokenVersion] = React.useState(0);

  // Listen for auth changes (same-tab custom event + cross-tab storage event).
  useEffect(() => {
    function handleAuthChange() {
      setTokenVersion(v => v + 1);
    }
    function handleStorage(e: StorageEvent) {
      if (e.key === "accessToken") {
        setTokenVersion(v => v + 1);
      }
    }
    window.addEventListener("nexus-auth-change", handleAuthChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("nexus-auth-change", handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    const currentCompanyId = window.localStorage.getItem("companyId");

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((json: UserMeResponse | null) => {
        if (!json) return;
        setMe(json);

        const memberships = Array.isArray(json.memberships) ? json.memberships : [];
        const isSuperAdmin = (json.globalRole ?? null) === "SUPER_ADMIN";
        let canManage = isSuperAdmin;

        // First, check for OWNER/ADMIN on the currently selected company, if any.
        if (currentCompanyId && memberships.length) {
          const membership = memberships.find(m => m.companyId === currentCompanyId);
          if (membership) {
            const role = membership.role;
            if (role === "OWNER" || role === "ADMIN") {
              canManage = true;
            }
          }
        }

        // Fallback: if the user is OWNER/ADMIN on any company at all, allow
        // access to Company settings so they can get to that configuration.
        if (!canManage && memberships.length) {
          canManage = memberships.some(
            m => m.role === "OWNER" || m.role === "ADMIN",
          );
        }

        setCanManageCompany(!!canManage);
      })
      .catch(() => {
        // ignore
      });
  }, [tokenVersion]);

  // Close menu when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      const node = containerRef.current;
      if (!node) return;
      if (!node.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const initials = getUserInitials(me);
  const displayName = getUserDisplayName(me);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          console.time('[PERF] UserMenu toggle');
          setOpen(o => !o);
          console.timeEnd('[PERF] UserMenu toggle');
        }}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {initials}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            marginTop: 8,
            minWidth: 200,
            background: "#ffffff",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(15,23,42,0.16)",
            border: "1px solid #e5e7eb",
            padding: 8,
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: "6px 8px",
              fontSize: 13,
              fontWeight: 600,
              borderBottom: "1px solid #e5e7eb",
              marginBottom: 4,
            }}
          >
            {displayName}
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/profile";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            See/Edit Profile
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/referrals";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Your referrals
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/roles";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Roles &amp; Permissions
          </button>

          {canManageCompany && (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/settings/company";
              }}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 13,
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Company settings
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/skills";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            My skills matrix
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/settings/personal-contacts";
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Personal contacts
          </button>
          <button
            type="button"
            onClick={onLogout}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 13,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
