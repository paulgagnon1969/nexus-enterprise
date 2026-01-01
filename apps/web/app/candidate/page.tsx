"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface MyOnboardingSession {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  checklist: {
    profileComplete?: boolean;
    photoUploaded?: boolean;
    govIdUploaded?: boolean;
    skillsComplete?: boolean;
    [key: string]: any;
  };
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  documents?: {
    id: string;
    type: "PHOTO" | "GOV_ID" | "OTHER" | string;
    fileUrl: string;
    createdAt: string;
  }[];
  token: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "SUBMITTED":
      return "Submitted";
    case "UNDER_REVIEW":
      return "Under review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return status || "Unknown";
  }
}

export default function CandidateHomePage() {
  const [session, setSession] = useState<MyOnboardingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingProfile, setMissingProfile] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/onboarding/my-session`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 404) {
          // No Nexis profile yet for this user; show CTA to create one.
          setMissingProfile(true);
          setSession(null);
          return;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load your Nexis profile (${res.status}).`);
        }

        const json: MyOnboardingSession = await res.json();
        setSession(json);
        setMissingProfile(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load your Nexis profile.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const photoUploaded = !!session?.documents?.some(d => d.type === "PHOTO");
  const govIdUploaded = !!session?.documents?.some(d => d.type === "GOV_ID");

  async function handleCreateProfile() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      return;
    }

    try {
      setCreatingProfile(true);
      setError(null);

      const res = await fetch(`${API_BASE}/onboarding/start-self`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to create your Nexis profile (${res.status}).`);
      }

      const json: MyOnboardingSession = await res.json();
      setSession(json);
      setMissingProfile(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create your Nexis profile.");
    } finally {
      setCreatingProfile(false);
    }
  }

  return (
    <PageCard>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Candidate Portal</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        This account is part of the national applicant pool for Nexus System. You can
        review your Nexis profile status and see what&apos;s completed versus what is still
        pending.
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>Loading your Nexis profile…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: "#b91c1c", marginTop: 12 }}>{error}</p>
      ) : missingProfile ? (
        <>
          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />
          <section>
            <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Create your Nexis profile</h3>
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 0 }}>
              We couldn&apos;t find a Nexis profile for this account yet. Create one to
              start building your personal portfolio and checklist.
            </p>
            <button
              type="button"
              onClick={() => void handleCreateProfile()}
              disabled={creatingProfile}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: creatingProfile ? "#e5e7eb" : "#0f172a",
                color: creatingProfile ? "#4b5563" : "#f9fafb",
                fontSize: 13,
                cursor: creatingProfile ? "default" : "pointer",
              }}
            >
              {creatingProfile ? "Creating…" : "Create my Nexis profile"}
            </button>
          </section>
        </>
      ) : session ? (
        <>
          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

          <section>
            <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Nexis profile overview</h3>
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 0 }}>
              Status: <strong>{statusLabel(session.status)}</strong>
            </p>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Submitted email: <strong>{session.email}</strong>
            </p>
            {session.profile && (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Name: <strong>{`${session.profile.firstName ?? ""} ${session.profile.lastName ?? ""}`.trim() || "(not set yet)"}</strong>
                {" · "}
                Location: <strong>{(session.profile.city || session.profile.state) ? `${session.profile.city ?? ""}${session.profile.city && session.profile.state ? ", " : ""}${session.profile.state ?? ""}` : "(not set yet)"}</strong>
              </p>
            )}
          </section>

          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Checklist</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
              Each item below shows whether it has been completed in your Nexis profile.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
              <ChecklistItem
                label="Basic profile information"
                completed={!!session.checklist.profileComplete}
              />
              <ChecklistItem
                label="Profile photo uploaded"
                completed={photoUploaded || !!session.checklist.photoUploaded}
              />
              <ChecklistItem
                label="Government ID uploaded"
                completed={govIdUploaded || !!session.checklist.govIdUploaded}
              />
              <ChecklistItem
                label="Trade skills self-assessment"
                completed={!!session.checklist.skillsComplete}
              />
              <ChecklistItem
                label="Nexis profile submitted for review"
                completed={
                  session.status === "SUBMITTED" ||
                  session.status === "UNDER_REVIEW" ||
                  session.status === "APPROVED"
                }
              />
            </ul>
          </section>

          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Update or review your details</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
              You can open your onboarding link to review or update your information
              (where allowed) and see the full details you have provided.
            </p>
            <a
              href={`/onboarding/${session.token}`}
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              Open onboarding details
            </a>
          </section>
        </>
      ) : (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
          We could not find an onboarding session linked to this account yet.
        </p>
      )}
    </PageCard>
  );
}

function ChecklistItem({
  label,
  completed,
}: {
  label: string;
  completed: boolean;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        padding: "4px 0",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: completed ? "none" : "1px solid #d1d5db",
          backgroundColor: completed ? "#16a34a" : "#ffffff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#f9fafb",
        }}
      >
        {completed ? "✓" : ""}
      </span>
      <span style={{ color: completed ? "#111827" : "#4b5563" }}>{label}</span>
    </li>
  );
}
