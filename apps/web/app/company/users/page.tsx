"use client";

import { useEffect, useState } from "react";
import { useViewRole } from "../../view-as-role-context";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Member {
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

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export default function CompanyUsersPage() {
  const { viewAs } = useViewRole();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const companyId = localStorage.getItem("companyId");

    if (!token || !companyId) {
      setError("Missing access token or company id. Please login again.");
      return;
    }

    async function load() {
      try {
        const [membersRes, invitesRes] = await Promise.all([
          fetch(`${API_BASE}/companies/${companyId}/members`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE}/companies/${companyId}/invites`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        if (!membersRes.ok || !invitesRes.ok) {
          throw new Error("Failed to load company users");
        }

        setMembers(await membersRes.json());
        setInvites(await invitesRes.json());
      } catch (err: any) {
        setError(err.message || "Unknown error");
      }
    }

    load();
  }, []);

  const viewAsLabel =
    viewAs === "ACTUAL"
      ? "Actual"
      : viewAs === "OWNER"
      ? "Owner"
      : viewAs === "ADMIN"
      ? "Admin"
      : viewAs === "MEMBER"
      ? "Member"
      : viewAs === "CLIENT"
      ? "Client"
      : viewAs;

  return (
    <div className="app-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Company users</h1>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Viewing as: {viewAsLabel}
          </p>
        </div>
      </div>

      <section style={{ marginTop: "1.0rem" }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Members</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Email</th>
              <th align="left">Company Role</th>
              <th align="left">User Type</th>
              <th align="left">Global Role</th>
              <th align="left">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const userTypeLabel =
                m.user.userType === "CLIENT" ? "Client" : "Internal";
              return (
                <tr key={m.userId}>
                  <td>{m.user.email}</td>
                  <td>{m.role}</td>
                  <td>{userTypeLabel}</td>
                  <td>{m.user.globalRole}</td>
                  <td>{new Date(m.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Invites</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Email</th>
              <th align="left">Role</th>
              <th align="left">Status</th>
              <th align="left">Created</th>
              <th align="left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {invites.map(i => {
              const now = Date.now();
              const expired = new Date(i.expiresAt).getTime() < now && !i.acceptedAt;
              const status = i.acceptedAt
                ? "Accepted"
                : expired
                ? "Expired"
                : "Pending";
              return (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.role}</td>
                  <td>{status}</td>
                  <td>{new Date(i.createdAt).toLocaleString()}</td>
                  <td>{new Date(i.expiresAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
