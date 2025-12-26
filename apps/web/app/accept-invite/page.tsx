"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function AcceptInviteForm() {
  const search = useSearchParams();
  const token = search.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`${API_BASE}/auth/accept-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });

    if (!res.ok) {
      setError("Invite acceptance failed");
      return;
    }

    const data = await res.json();
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("companyId", data.company.id);

    window.location.href = "/projects";
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Accept Invite</h1>
      {!token && <p>Missing invite token in URL.</p>}
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 320 }}>
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
        {error && <p style={{ color: "salmon" }}>{error}</p>}
        <button type="submit" disabled={!token}>
          Accept Invite
        </button>
      </form>
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
