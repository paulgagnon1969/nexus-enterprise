"use client";

import { useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Hard-coded IDs for Nexus System and Nexus Fortified Structures tenants.
const NEXUS_SYSTEM_COMPANY_ID = "cmjr7o4zs000101s6z1rt1ssz";
const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

export default function HomePage() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((me: any) => {
        if (me) {
          try {
            const memberships = Array.isArray(me.memberships) ? me.memberships : [];
            const isNexusSystemAdminOrAbove = memberships.some(
              (m: any) =>
                m?.companyId === NEXUS_SYSTEM_COMPANY_ID &&
                (m?.role === "OWNER" || m?.role === "ADMIN"),
            );
            const hasLastCompany = !!window.localStorage.getItem("lastCompanyId");
            if (isNexusSystemAdminOrAbove && !hasLastCompany) {
              window.localStorage.setItem("lastCompanyId", FORTIFIED_COMPANY_ID);
            }
          } catch {
            // best-effort only
          }
        }

        if (me?.userType === "APPLICANT") {
          window.location.href = "/candidate";
        } else {
          // All internal users (including SUPER_ADMIN) land in the project workspace.
          window.location.href = "/projects";
        }
      })
      .catch(() => {
        window.location.href = "/projects";
      });
  }, []);

  return null;
}
