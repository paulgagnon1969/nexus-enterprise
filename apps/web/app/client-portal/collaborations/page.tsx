"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface PendingCollaboration {
  id: string;
  project: { id: string; name: string; address?: string | null };
  company: { id: string; name: string }; // The collaborating company (ours)
  invitingCompany: { id: string; name: string }; // The contractor who invited
  role: string;
  visibility: string;
  invitedAt: string;
  notes: string | null;
}

export default function ClientPortalCollaborationsPage() {
  const router = useRouter();
  const [collabs, setCollabs] = useState<PendingCollaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const getToken = () => localStorage.getItem("accessToken") || "";

  const fetchCollaborations = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/portal/collaborations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(`Failed to load collaborations (${res.status}).`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCollabs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollaborations();
  }, [fetchCollaborations]);

  const handleAction = async (
    collabId: string,
    action: "accept" | "decline"
  ) => {
    const token = getToken();
    if (!token) return;
    setActionInFlight(collabId);
    try {
      const res = await fetch(
        `${API_BASE}/portal/collaborations/${collabId}/${action}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        // Remove from list
        setCollabs((prev) => prev.filter((c) => c.id !== collabId));
      }
    } catch {
      // ignore
    } finally {
      setActionInFlight(null);
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

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 700, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          Pending Invitations
        </h1>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 700, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          Pending Invitations
        </h1>
        <p style={{ color: "#dc2626" }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 700, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Pending Invitations
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {collabs.length} pending invite{collabs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/client-portal")}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#374151",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          ← Back to Projects
        </button>
      </div>

      {collabs.length === 0 ? (
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
            No pending invitations.
          </p>
          <p style={{ margin: "8px 0 0", color: "#9ca3af", fontSize: 12 }}>
            You&apos;re all caught up! Check back later for new project invitations.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {collabs.map((c) => {
            const busy = actionInFlight === c.id;
            return (
              <div
                key={c.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}
                    >
                      {c.project.name}
                    </div>
                    {c.project.address && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        {c.project.address}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      <span>
                        From:{" "}
                        <strong style={{ color: "#374151" }}>
                          {c.invitingCompany.name}
                        </strong>
                      </span>
                      <span>•</span>
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: "#dbeafe",
                          color: "#1e40af",
                          fontWeight: 500,
                        }}
                      >
                        {roleLabel(c.role)}
                      </span>
                      <span>•</span>
                      <span>Invited {formatDate(c.invitedAt)}</span>
                    </div>
                    {c.notes && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: "#4b5563",
                          fontStyle: "italic",
                        }}
                      >
                        &ldquo;{c.notes}&rdquo;
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAction(c.id, "accept")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: busy ? "#e5e7eb" : "#059669",
                        color: busy ? "#6b7280" : "#ffffff",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: busy ? "default" : "pointer",
                      }}
                    >
                      {busy ? "…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAction(c.id, "decline")}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "1px solid #fecaca",
                        background: busy ? "#e5e7eb" : "#fef2f2",
                        color: busy ? "#6b7280" : "#dc2626",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: busy ? "default" : "pointer",
                      }}
                    >
                      {busy ? "…" : "Decline"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
