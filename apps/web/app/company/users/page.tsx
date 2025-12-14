"use client";

import { FormEvent, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type CompanyRole = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT";

type GlobalRole = "SUPER_ADMIN" | "NONE" | string;

type UserType = "WORKER" | "CLIENT" | string;

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
  createdAt: string;
  user: {
    id: string;
    email: string;
    globalRole: GlobalRole;
    userType: UserType;
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
  const [me, setMe] = useState<MeResponse | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [actorCompanyRole, setActorCompanyRole] = useState<CompanyRole | null>(null);
  const [actorGlobalRole, setActorGlobalRole] = useState<GlobalRole | null>(null);

  const [members, setMembers] = useState<CompanyMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [invites, setInvites] = useState<CompanyInviteRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  const [singleEmail, setSingleEmail] = useState("");
  const [singleRole, setSingleRole] = useState<CompanyRole>("MEMBER");
  const [singleSaving, setSingleSaving] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSuccess, setSingleSuccess] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

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
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Company users &amp; invites</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        {companyName ? (
          <>
            Managing users for <strong>{companyName}</strong>
          </>
        ) : (
          "Managing users for current company"
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

      {/* Members section */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Members</h2>
        {membersLoading && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading members…</p>
        )}
        {membersError && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>{membersError}</p>
        )}
        {!membersLoading && !membersError && (
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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>User type</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Global role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Company role</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.userId}>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      <a
                        href={`/company/users/${m.user.id}`}
                        style={{ color: "#2563eb", textDecoration: "none" }}
                      >
                        {m.user.email}
                      </a>
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      {m.user.userType ?? "WORKER"}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      {m.user.globalRole ?? "NONE"}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      {canManageMembers ? (
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
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "8px",
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      No members found for this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invite single user */}
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

      {/* Bulk invite */}
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
                        {invite.role}
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
    </div>
  );
}
