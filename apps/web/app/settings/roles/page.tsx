"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface RoleProfileDto {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  isStandard: boolean;
  companyId?: string | null;
}

interface PermissionResourceDto {
  id: string;
  code: string;
  label: string;
  section: string;
}

export default function RolesSettingsPage() {
  const [profiles, setProfiles] = useState<RoleProfileDto[]>([]);
  const [resources, setResources] = useState<PermissionResourceDto[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [profilesRes, resourcesRes] = await Promise.all([
          fetch(`${API_BASE}/roles/profiles`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/roles/resources`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!profilesRes.ok) throw new Error("Failed to load roles");
        if (!resourcesRes.ok) throw new Error("Failed to load permission resources");
        const profilesJson = await profilesRes.json();
        const resourcesJson = await resourcesRes.json();
        setProfiles(Array.isArray(profilesJson) ? profilesJson : []);
        setResources(Array.isArray(resourcesJson) ? resourcesJson : []);
        if (Array.isArray(profilesJson) && profilesJson.length) {
          setSelectedProfileId(profilesJson[0].id);
        }
      } catch (e: any) {
        setError(e?.message ?? "Unable to load roles");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const selectedProfile = profiles.find(p => p.id === selectedProfileId) || null;

  const resourcesBySection = resources.reduce<Record<string, PermissionResourceDto[]>>(
    (acc, r) => {
      if (!acc[r.section]) acc[r.section] = [];
      acc[r.section].push(r);
      return acc;
    },
    {},
  );

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* Left: profiles list */}
      <div
        style={{
          width: 260,
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          padding: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Role profiles</div>
        {loading ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>Loading…</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>
        ) : profiles.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>No profiles yet.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {profiles.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedProfileId(p.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    marginBottom: 4,
                    borderRadius: 4,
                    border: "none",
                    background:
                      p.id === selectedProfileId ? "#e5e7eb" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: p.isStandard ? 600 : 400,
                  }}
                >
                  {p.label}
                  {p.isStandard && " (NCC Standard)"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: profile details */}
      <div style={{ flex: 1 }}>
        <div className="app-card">
          <h1 style={{ marginTop: 0, fontSize: 20 }}>Manage role</h1>

          {selectedProfile ? (
            <>
              <div style={{ marginTop: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Role name</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedProfile.label}</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Role description</div>
                <div style={{ fontSize: 13 }}>
                  {selectedProfile.description || "NCC standard role description coming soon."}
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Permissions (read-only stub)
              </div>
              {Object.keys(resourcesBySection).length === 0 ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  No permission resources defined yet.
                </div>
              ) : (
                Object.entries(resourcesBySection).map(([section, items]) => (
                  <div key={section} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        padding: "6px 8px",
                        background: "#f3f4f6",
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 4,
                      }}
                    >
                      {section}
                    </div>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        border: "1px solid #e5e7eb",
                        borderTop: "none",
                        borderRadius: "0 0 4px 4px",
                      }}
                    >
                      {items.map(r => (
                        <li
                          key={r.id}
                          style={{
                            padding: "6px 8px",
                            borderTop: "1px solid #e5e7eb",
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12,
                          }}
                        >
                          <span>{r.label}</span>
                          <span style={{ color: "#6b7280" }}>View, Add, Edit, Delete</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              Select a role profile on the left to view its permissions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
