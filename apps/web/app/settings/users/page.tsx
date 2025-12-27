"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CompanyMember {
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    globalRole: string;
    userType: string;
  };
}

interface CompanyInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export default function CompanyUsersPage() {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [invites, setInvites] = useState<CompanyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        // First, figure out the current companyId from the token context via companies/me
        const meRes = await fetch(`${API_BASE}/companies/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok) {
          throw new Error(`Failed to load current company (${meRes.status})`);
        }
        const company: any = await meRes.json();
        const companyId = company.id as string;

        const [membersRes, invitesRes] = await Promise.all([
          fetch(`${API_BASE}/companies/${companyId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/companies/${companyId}/invites`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (membersRes.ok) {
          const mJson: CompanyMember[] = await membersRes.json();
          setMembers(mJson || []);
        }
        if (invitesRes.ok) {
          const iJson: CompanyInvite[] = await invitesRes.json();
          setInvites(iJson || []);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load company users.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMessage(null);

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setInviteMessage("Missing access token.");
      return;
    }

    if (!inviteEmail.trim()) {
      setInviteMessage("Enter an email address.");
      return;
    }

    try {
      setInviteSaving(true);

      // Get current companyId again (cheap and keeps logic simple)
      const meRes = await fetch(`${API_BASE}/companies/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) {
        setInviteMessage(`Failed to load company context (${meRes.status}).`);
        return;
      }
      const company: any = await meRes.json();
      const companyId = company.id as string;

      const res = await fetch(`${API_BASE}/companies/${companyId}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setInviteMessage(`Invite failed (${res.status}): ${text}`);
        return;
      }

      setInviteMessage("Invite created.");
      setInviteEmail("");

      // Refresh invites list
      const invitesRes = await fetch(`${API_BASE}/companies/${companyId}/invites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (invitesRes.ok) {
        const iJson: CompanyInvite[] = await invitesRes.json();
        setInvites(iJson || []);
      }
    } catch (err: any) {
      setInviteMessage(err.message || "Invite failed.");
    } finally {
      setInviteSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading company users…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Company users</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Company users &amp; invites</h1>
      <p style={{ fontSize: 13, color: " #6b7280", marginTop: 4 }}>
        Manage users for your current Nexus company.
      </p>

      {/* Members table */}
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Members</h2>
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>No members found.</p>
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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Company role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Global role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>User type</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {m.user.email}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {m.role}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {m.user.globalRole}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {m.user.userType}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite form */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Invite user</h2>
        <form
          onSubmit={handleInviteSubmit}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <input
            id="company-invite-email"
            name="inviteEmail"
            type="email"
            placeholder="user@example.com"
            autoComplete="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{
              minWidth: 260,
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />
          <select
            id="company-invite-role"
            name="inviteRole"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          >
            <option value="OWNER">OWNER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MEMBER">MEMBER</option>
            <option value="CLIENT">CLIENT</option>
          </select>
          <button
            type="submit"
            disabled={inviteSaving}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              backgroundColor: inviteSaving ? "#e5e7eb" : "#0f172a",
              color: inviteSaving ? "#4b5563" : "#f9fafb",
              fontSize: 13,
              cursor: inviteSaving ? "default" : "pointer",
            }}
          >
            {inviteSaving ? "Sending…" : "Send invite"}
          </button>
        </form>
        {inviteMessage && (
          <p style={{ marginTop: 8, fontSize: 12, color: "#4b5563" }}>{inviteMessage}</p>
        )}
      </div>

      {/* Invites table */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Pending &amp; recent invites</h2>
        {invites.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>No invites yet.</p>
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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Created</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => {
                  const accepted = !!i.acceptedAt;
                  return (
                    <tr key={i.id}>
                      <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                        {i.email}
                      </td>
                      <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                        {i.role}
                      </td>
                      <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                        {accepted ? "Accepted" : "Pending"}
                      </td>
                      <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                        {new Date(i.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                        {new Date(i.expiresAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}