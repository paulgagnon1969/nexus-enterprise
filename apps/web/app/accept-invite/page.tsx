"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type InvitePreviewMode = "NO_ACTIVE_MEMBERSHIP" | "ALREADY_IN_COMPANY" | "DIFFERENT_COMPANY";

interface InvitePreview {
  mode: InvitePreviewMode;
  currentCompany: { id: string; name: string } | null;
  invitedCompany: { id: string; name: string };
  invite: { id: string; email: string; role: string };
}

function AcceptInviteForm() {
  const search = useSearchParams();
  const token = search.get("token") || "";

  // Flow for first-time (not logged in) users: password + /auth/accept-invite
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Flow for already-logged-in users following an invite link.
  const [sessionAccessToken, setSessionAccessToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [orgModalOpen, setOrgModalOpen] = useState(false);

  const hasSession = !!sessionAccessToken;

  // On mount, detect existing access token and, if present, preview the invite
  // so we can decide whether this is an org-switch scenario.
  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined") return;
    const at = window.localStorage.getItem("accessToken");
    if (!at) return;
    setSessionAccessToken(at);

    const run = async () => {
      try {
        setPreviewLoading(true);
        setPreviewError(null);
        const res = await fetch(`${API_BASE}/auth/company-invites/preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${at}`,
          },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Preview failed (${res.status})`);
        }
        const json = await res.json();
        setPreview(json as InvitePreview);
      } catch (e: any) {
        setPreviewError(e?.message ?? "Failed to preview invite.");
      } finally {
        setPreviewLoading(false);
      }
    };

    void run();
  }, [token]);

  async function handleConfirmLoggedIn(choice: "stay" | "switch") {
    if (!sessionAccessToken) return;
    try {
      setConfirmLoading(true);
      setConfirmError(null);
      const res = await fetch(`${API_BASE}/auth/company-invites/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionAccessToken}`,
        },
        body: JSON.stringify({ token, choice }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Invite confirmation failed (${res.status})`);
      }
      const data: any = await res.json();

      // "stay" outcome does not rotate tokens; "switch" returns new tokens.
      if (data?.outcome === "STAY") {
        // Nothing structural changed; just navigate into the app.
        window.location.href = "/projects";
        return;
      }

      if (data?.accessToken && data?.refreshToken && data?.company?.id) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("accessToken", data.accessToken);
          window.localStorage.setItem("refreshToken", data.refreshToken);
          window.localStorage.setItem("companyId", data.company.id);
        }
      }

      window.location.href = "/projects";
    } catch (e: any) {
      setConfirmError(e?.message ?? "Failed to confirm invite.");
    } finally {
      setConfirmLoading(false);
      setOrgModalOpen(false);
    }
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`${API_BASE}/auth/accept-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      setError("Invite acceptance failed");
      return;
    }

    const data = await res.json();
    if (typeof window !== "undefined") {
      window.localStorage.setItem("accessToken", data.accessToken);
      window.localStorage.setItem("refreshToken", data.refreshToken);
      window.localStorage.setItem("companyId", data.company.id);
    }

    window.location.href = "/projects";
  }

  const showPasswordFlow = !hasSession;

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Accept Invite</h1>
      {!token && <p>Missing invite token in URL.</p>}

      {hasSession ? (
        <section style={{ marginTop: "1rem", maxWidth: 520 }}>
          {previewLoading && <p>Checking your company invite…</p>}
          {previewError && !previewLoading && (
            <p style={{ color: "salmon", fontSize: 13 }}>{previewError}</p>
          )}

          {preview && !previewLoading && (
            <>
              {preview.mode === "DIFFERENT_COMPANY" && preview.currentCompany ? (
                <p style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
                  You are currently assigned to <strong>{preview.currentCompany.name}</strong>. You&apos;ve been invited to
                  join <strong>{preview.invitedCompany.name}</strong>. This will change which organization you are
                  assigned to.
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
                  This invite grants you access to <strong>{preview.invitedCompany.name}</strong>.
                </p>
              )}

              {confirmError && (
                <p style={{ color: "salmon", fontSize: 13, marginBottom: 8 }}>{confirmError}</p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {preview.mode === "DIFFERENT_COMPANY" && preview.currentCompany ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleConfirmLoggedIn("stay")}
                      disabled={confirmLoading}
                      style={{
                        padding: "0.4rem 0.75rem",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        fontSize: 12,
                        cursor: confirmLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      Stay with {preview.currentCompany.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrgModalOpen(true)}
                      disabled={confirmLoading}
                      style={{
                        padding: "0.4rem 0.75rem",
                        borderRadius: 6,
                        border: "1px solid #b91c1c",
                        background: "#b91c1c",
                        color: "#f9fafb",
                        fontSize: 12,
                        cursor: confirmLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      Switch organizations
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleConfirmLoggedIn("switch")}
                    disabled={confirmLoading}
                    style={{
                      padding: "0.4rem 0.75rem",
                      borderRadius: 6,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#f9fafb",
                      fontSize: 12,
                      cursor: confirmLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    Accept company invite
                  </button>
                )}
              </div>

              {orgModalOpen && preview.currentCompany && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(15,23,42,0.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 50,
                  }}
                >
                  <div
                    style={{
                      width: "min(420px, 100% - 32px)",
                      background: "#ffffff",
                      borderRadius: 12,
                      padding: 16,
                      boxShadow: "0 24px 60px rgba(15,23,42,0.45)",
                    }}
                  >
                    <h2 style={{ margin: 0, marginBottom: 8, fontSize: 15 }}>Confirm organization change</h2>
                    <p
                      style={{
                        margin: 0,
                        marginBottom: 8,
                        fontSize: 11,
                        color: "#b91c1c",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        letterSpacing: 0.04,
                      }}
                    >
                      This change will remove you from your {preview.currentCompany.name} and deactivate you as a user in
                      that company.
                    </p>
                    <p style={{ margin: 0, marginBottom: 12, fontSize: 12, color: "#2563eb" }}>
                      This does not remove you from the Nex-Net Marketplace and your Nex-Net personal profile will
                      remain intact.
                    </p>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setOrgModalOpen(false)}
                        disabled={confirmLoading}
                        style={{
                          padding: "0.35rem 0.7rem",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          fontSize: 12,
                          cursor: confirmLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmLoggedIn("switch")}
                        disabled={confirmLoading}
                        style={{
                          padding: "0.35rem 0.7rem",
                          borderRadius: 6,
                          border: "1px solid #b91c1c",
                          background: "#b91c1c",
                          color: "#f9fafb",
                          fontSize: 12,
                          cursor: confirmLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        Confirm change and switch
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {showPasswordFlow && (
        <section style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: 13, color: "#4b5563", maxWidth: 420 }}>
            Set a password to finish accepting this invite. You&apos;ll be able to manage your profile and company access
            after logging in.
          </p>
          <form
            onSubmit={onSubmitPassword}
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 320 }}
          >
            <label htmlFor="accept-password">
              Password
              <input
                id="accept-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            {error && <p style={{ color: "salmon", fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={!token}>
              Accept Invite
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main style={{ padding: "2rem" }}>Loading…</main>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
