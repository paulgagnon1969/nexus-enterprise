"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface TenantClient {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  active: boolean;
  projectCount: number;
  hasPortalAccess: boolean;
  portalUserId: string | null;
}

interface ClientDetail extends TenantClient {
  notes: string | null;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    addressLine1: string;
    city: string;
    state: string;
  }>;
  portalUser: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Client detail modal
  const [selectedClient, setSelectedClient] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Invite state
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<{ clientId: string; message: string; isError: boolean } | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load clients (${res.status})`);
      }
      const data: TenantClient[] = await res.json();
      setClients(data);
    } catch (err: any) {
      setError(err.message || "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }

  async function loadClientDetail(clientId: string) {
    if (!token) return;

    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load client details (${res.status})`);
      }
      const data: ClientDetail = await res.json();
      setSelectedClient(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function inviteToPortal(clientId: string) {
    if (!token) return;

    setInviting(clientId);
    setInviteMessage(null);

    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ visibility: "LIMITED" }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Invite failed (${res.status})`;
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          message = text || message;
        }
        setInviteMessage({ clientId, message, isError: true });
        return;
      }

      const result = await res.json();
      setInviteMessage({
        clientId,
        message: `Portal access granted! ${result.projectsGranted?.length || 0} project(s) shared.`,
        isError: false,
      });

      // Refresh the clients list
      await loadClients();

      // If we have the detail open, refresh it too
      if (selectedClient?.id === clientId) {
        await loadClientDetail(clientId);
      }
    } catch (err: any) {
      setInviteMessage({ clientId, message: err.message || "Invite failed.", isError: true });
    } finally {
      setInviting(null);
    }
  }

  async function revokePortalAccess(clientId: string) {
    if (!token) return;
    if (!confirm("Are you sure you want to revoke this client's portal access?")) return;

    setInviting(clientId);
    setInviteMessage(null);

    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}/portal-access`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        setInviteMessage({ clientId, message: `Revoke failed: ${text}`, isError: true });
        return;
      }

      setInviteMessage({ clientId, message: "Portal access revoked.", isError: false });
      await loadClients();

      if (selectedClient?.id === clientId) {
        await loadClientDetail(clientId);
      }
    } catch (err: any) {
      setInviteMessage({ clientId, message: err.message, isError: true });
    } finally {
      setInviting(null);
    }
  }

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading clients…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Clients</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Client Portal Management</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Manage client portal access. Clients with portal access can log in and view their projects.
      </p>

      {/* Clients table */}
      <div style={{ marginTop: 16 }}>
        {clients.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            No clients found. Link a client to a project to see them here.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Company</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>Projects</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>Portal Access</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb" }}>
                      <button
                        onClick={() => loadClientDetail(client.id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#2563eb",
                          cursor: "pointer",
                          fontSize: 13,
                          textDecoration: "underline",
                        }}
                      >
                        {client.displayName}
                      </button>
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb" }}>
                      {client.email ? (
                        <a
                          href={`mailto:${client.email}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          {client.email}
                        </a>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb" }}>
                      {client.company || <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                      {client.projectCount}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                      {client.hasPortalAccess ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 12,
                            backgroundColor: "#dcfce7",
                            color: "#166534",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 12,
                            backgroundColor: "#f3f4f6",
                            color: "#6b7280",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          Not Invited
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                      {client.hasPortalAccess ? (
                        <button
                          onClick={() => revokePortalAccess(client.id)}
                          disabled={inviting === client.id}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: "1px solid #dc2626",
                            backgroundColor: "#fff",
                            color: "#dc2626",
                            fontSize: 12,
                            cursor: inviting === client.id ? "default" : "pointer",
                            opacity: inviting === client.id ? 0.6 : 1,
                          }}
                        >
                          {inviting === client.id ? "..." : "Revoke"}
                        </button>
                      ) : client.email ? (
                        <button
                          onClick={() => inviteToPortal(client.id)}
                          disabled={inviting === client.id}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: "1px solid #2563eb",
                            backgroundColor: "#2563eb",
                            color: "#fff",
                            fontSize: 12,
                            cursor: inviting === client.id ? "default" : "pointer",
                            opacity: inviting === client.id ? 0.6 : 1,
                          }}
                        >
                          {inviting === client.id ? "Inviting..." : "Invite to Portal"}
                        </button>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 11 }}>No email</span>
                      )}
                      {inviteMessage?.clientId === client.id && (
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: inviteMessage.isError ? "#dc2626" : "#166534",
                          }}
                        >
                          {inviteMessage.message}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client detail modal */}
      {selectedClient && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setSelectedClient(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 8,
              padding: 24,
              maxWidth: 600,
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{selectedClient.displayName}</h2>
                {selectedClient.company && (
                  <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                    {selectedClient.company}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ×
              </button>
            </div>

            {/* Contact info */}
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Contact</h3>
              <p style={{ fontSize: 13, margin: "4px 0" }}>
                <strong>Email:</strong>{" "}
                {selectedClient.email ? (
                  <a href={`mailto:${selectedClient.email}`} style={{ color: "#2563eb" }}>
                    {selectedClient.email}
                  </a>
                ) : (
                  <span style={{ color: "#9ca3af" }}>Not provided</span>
                )}
              </p>
              <p style={{ fontSize: 13, margin: "4px 0" }}>
                <strong>Phone:</strong>{" "}
                {selectedClient.phone || <span style={{ color: "#9ca3af" }}>Not provided</span>}
              </p>
            </div>

            {/* Portal access */}
            <div style={{ marginTop: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 6 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Portal Access</h3>
              {selectedClient.hasPortalAccess ? (
                <div>
                  <p style={{ fontSize: 13, margin: 0, color: "#166534" }}>
                    ✓ Client has portal access
                  </p>
                  {selectedClient.portalUser && (
                    <p style={{ fontSize: 12, margin: "4px 0 0", color: "#6b7280" }}>
                      Logged in as: {selectedClient.portalUser.email}
                    </p>
                  )}
                  <button
                    onClick={() => revokePortalAccess(selectedClient.id)}
                    disabled={inviting === selectedClient.id}
                    style={{
                      marginTop: 8,
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid #dc2626",
                      backgroundColor: "#fff",
                      color: "#dc2626",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Revoke Access
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, margin: 0, color: "#6b7280" }}>
                    Client does not have portal access
                  </p>
                  {selectedClient.email ? (
                    <button
                      onClick={() => inviteToPortal(selectedClient.id)}
                      disabled={inviting === selectedClient.id}
                      style={{
                        marginTop: 8,
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "1px solid #2563eb",
                        backgroundColor: "#2563eb",
                        color: "#fff",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {inviting === selectedClient.id ? "Inviting..." : "Invite to Portal"}
                    </button>
                  ) : (
                    <p style={{ fontSize: 12, margin: "8px 0 0", color: "#dc2626" }}>
                      Add an email address to invite this client
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Projects */}
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Linked Projects ({selectedClient.projects.length})
              </h3>
              {selectedClient.projects.length === 0 ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}>No projects linked to this client.</p>
              ) : (
                <div style={{ fontSize: 13 }}>
                  {selectedClient.projects.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <a
                        href={`/projects/${p.id}`}
                        style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                      >
                        {p.name}
                      </a>
                      <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>
                        {p.addressLine1}, {p.city}, {p.state} · {p.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {selectedClient.notes && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Notes</h3>
                <p style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
                  {selectedClient.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
