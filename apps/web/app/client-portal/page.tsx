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
  source: string;
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  projects: PortalProject[];
}

const PAGE: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  color: "#0f172a",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const statusStyle = (status: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    ACTIVE:    { bg: "rgba(34,197,94,0.15)",  color: "#16a34a" },
    COMPLETE:  { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
    ON_HOLD:   { bg: "rgba(234,179,8,0.15)",  color: "#ca8a04" },
  };
  const s = map[status] ?? { bg: "rgba(100,116,139,0.15)", color: "#6b7280" };
  return { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: "0.5px" };
};

const statusLabel = (status: string) =>
  ({ ACTIVE: "Active", COMPLETE: "Complete", ON_HOLD: "On Hold" }[status] ?? status);

export default function ClientPortalPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";

  const handleSignOut = () => {
    try {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("companyId");
      localStorage.removeItem("userType");
    } catch { /* ignore */ }
    router.push("/welcome");
  };

  const fetchProjects = useCallback(async () => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const [projRes, meRes] = await Promise.all([
        fetch(`${API_BASE}/projects/portal/my-projects`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (projRes.status === 401 || projRes.status === 403) { router.push("/login"); return; }
      if (projRes.ok) {
        const data = await projRes.json();
        setGroups(Array.isArray(data) ? data : []);
      } else {
        setError(`Failed to load projects (${projRes.status}).`);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email || null;
        setUserName(name);
      }
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const totalProjects = groups.reduce((n, g) => n + g.projects.length, 0);

  return (
    <div style={PAGE}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "18px 32px", borderBottom: "1px solid #e5e7eb",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 32, width: "auto" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Project Portal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {userName && (
            <span style={{ fontSize: 13, color: "#6b7280" }}>{userName}</span>
          )}
          <button onClick={handleSignOut} style={{
            padding: "7px 14px", borderRadius: 6,
            border: "1px solid #d1d5db", background: "transparent",
            color: "#6b7280", fontSize: 13, cursor: "pointer",
          }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Tab Nav */}
      <nav style={{
        maxWidth: 1100, margin: "0 auto", padding: "0 32px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex", gap: 0,
      }}>
        <button
          style={{
            padding: "12px 20px", fontSize: 13, fontWeight: 600,
            color: "#0f172a", background: "transparent", border: "none",
            borderBottom: "2px solid #3b82f6",
            cursor: "pointer",
          }}
        >
          Projects
        </button>
        <button
          onClick={() => router.push("/client-portal/finance")}
          style={{
            padding: "12px 20px", fontSize: 13, fontWeight: 500,
            color: "#6b7280", background: "transparent", border: "none",
            borderBottom: "2px solid transparent",
            cursor: "pointer",
          }}
        >
          Finance
        </button>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <p style={{ color: "#6b7280", fontSize: 14 }}>Loading your projects…</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <p style={{ color: "#dc2626", fontSize: 14, marginBottom: 16 }}>{error}</p>
            <button onClick={() => router.push("/login")} style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: "#3b82f6", color: "#fff", fontSize: 14, cursor: "pointer",
            }}>Sign In Again</button>
          </div>
        ) : groups.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "80px 32px",
            background: "#f8fafc", borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏗️</div>
            <h2 style={{ color: "#0f172a", fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>No projects yet</h2>
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
              When a contractor invites you to a project, it will appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px", color: "#0f172a" }}>Your Projects</h1>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                {totalProjects} project{totalProjects !== 1 ? "s" : ""} across {groups.length} contractor{groups.length !== 1 ? "s" : ""}
              </p>
            </div>

            {groups.map((g) => (
              <div key={g.companyId}>
                {/* Contractor section header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>
                    {(g.companyName || "?").charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{g.companyName || "Unknown"}</span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>• {g.projects.length} project{g.projects.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Project cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                  {g.projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => router.push(`/client-portal/projects/${p.id}`)}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "20px 22px",
                        cursor: "pointer",
                        transition: "border-color 0.15s, transform 0.1s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#2563eb";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                        (e.currentTarget as HTMLElement).style.transform = "none";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <span style={statusStyle(p.status)}>{statusLabel(p.status)}</span>
                        <span style={{ color: "#9ca3af", fontSize: 18 }}>→</span>
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", margin: "0 0 4px" }}>{p.name}</h3>
                      {p.address && (
                        <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.4 }}>{p.address}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0, textAlign: "center" }}>
          © {new Date().getFullYear()} Nexus Contractor Connect
          <span style={{ margin: "0 12px" }}>•</span>
          <a href="/welcome#privacy" style={{ color: "#9ca3af", textDecoration: "none" }}>Privacy Policy</a>
        </p>
      </footer>
    </div>
  );
}
