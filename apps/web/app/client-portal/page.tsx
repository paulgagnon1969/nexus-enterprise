"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface PortalProject {
  id: string;
  name: string;
  address: string | null;
  status: string;
  role: string;
  source: string; // "membership" | "collaboration"
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  projects: PortalProject[];
}

export default function ClientPortalPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = () => localStorage.getItem("accessToken") || "";

  const fetchProjects = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/projects/portal/my-projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(`Failed to load projects (${res.status}).`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const statusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return { bg: "#dcfce7", color: "#166534" };
      case "COMPLETE":
        return { bg: "#dbeafe", color: "#1e40af" };
      case "ON_HOLD":
        return { bg: "#fef9c3", color: "#854d0e" };
      default:
        return { bg: "#f3f4f6", color: "#374151" };
    }
  };

  const roleLabel = (role: string) => {
    const map: Record<string, string> = {
      CLIENT: "Client",
      SUB: "Subcontractor",
      PRIME_GC: "Prime GC",
      CONSULTANT: "Consultant",
      INSPECTOR: "Inspector",
    };
    return map[role] ?? role;
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          Client Portal
        </h1>
        <p style={{ color: "#6b7280" }}>Loading your projects…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          Client Portal
        </h1>
        <p style={{ color: "#dc2626" }}>{error}</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#f9fafb",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Go to Login
        </button>
      </div>
    );
  }

  const totalProjects = groups.reduce((n, g) => n + g.projects.length, 0);

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Client Portal</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {totalProjects} project{totalProjects !== 1 ? "s" : ""} across{" "}
            {groups.length} contractor{groups.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/client-portal/collaborations")}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #7c3aed",
            background: "#f5f3ff",
            color: "#5b21b6",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Pending Invites
        </button>
      </div>

      {groups.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        >
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            No projects shared with your organization yet.
          </p>
          <p style={{ margin: "8px 0 0", color: "#9ca3af", fontSize: 12 }}>
            When a contractor adds your organization to a project, it will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map((g) => (
            <div
              key={g.companyId}
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: "#f3f4f6",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                {g.companyName}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    fontWeight: 400,
                    color: "#6b7280",
                  }}
                >
                  {g.projects.length} project{g.projects.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div>
                {g.projects.map((p, i) => {
                  const sc = statusColor(p.status);
                  return (
                    <div
                      key={p.id}
                      onClick={() => router.push(`/client-portal/projects/${p.id}`)}
                      style={{
                        padding: "10px 14px",
                        borderBottom:
                          i < g.projects.length - 1
                            ? "1px solid #f3f4f6"
                            : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                      onMouseOver={(e) =>
                        ((e.currentTarget as HTMLDivElement).style.background =
                          "#f9fafb")
                      }
                      onMouseOut={(e) =>
                        ((e.currentTarget as HTMLDivElement).style.background =
                          "transparent")
                      }
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: "#111827",
                          }}
                        >
                          {p.name}
                        </div>
                        {p.address && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#6b7280",
                              marginTop: 2,
                            }}
                          >
                            {p.address}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: sc.bg,
                          color: sc.color,
                        }}
                      >
                        {p.status}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: "#dbeafe",
                          color: "#1e40af",
                        }}
                      >
                        {roleLabel(p.role)}
                      </span>
                      <span style={{ color: "#9ca3af", fontSize: 14 }}>→</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
