"use client";

import { useEffect, useCallback, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * Plaid OAuth redirect page.
 *
 * After a user authenticates with their bank via OAuth, Plaid redirects them
 * here. This page retrieves the stored link_token from sessionStorage,
 * reinitializes Plaid Link with `receivedRedirectUri`, and lets Link finish
 * the flow. On success it posts the public_token back to the API, then
 * redirects to the billing settings page.
 */
export default function PlaidOAuthPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Retrieve the link_token that was stored before launching Plaid Link.
  useEffect(() => {
    const storedToken = window.sessionStorage.getItem("plaid_link_token");
    if (!storedToken) {
      setError("Missing Plaid link token. Please return to billing settings and try again.");
      return;
    }
    setLinkToken(storedToken);
  }, []);

  const onSuccess = useCallback(async (publicToken: string, metadata: any) => {
    try {
      const accessToken = window.localStorage.getItem("accessToken");
      const accountId = metadata?.accounts?.[0]?.id;

      if (!accountId) {
        setError("No account was selected. Please try again.");
        return;
      }

      await fetch(`${API_BASE}/billing/plaid/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ publicToken, accountId }),
      });

      // Clean up and redirect back to billing
      window.sessionStorage.removeItem("plaid_link_token");
      window.location.href = "/settings/company?tab=billing";
    } catch {
      setError("Failed to link bank account. Please try again.");
    }
  }, []);

  const onExit = useCallback(() => {
    window.sessionStorage.removeItem("plaid_link_token");
    window.location.href = "/settings/company?tab=billing";
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: typeof window !== "undefined" ? window.location.href : undefined,
    onSuccess,
    onExit,
  });

  // Auto-open Link as soon as it's ready
  useEffect(() => {
    if (ready && linkToken) {
      open();
    }
  }, [ready, linkToken, open]);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p>
        <a href="/settings/company?tab=billing" style={{ color: "#2563eb" }}>
          ← Return to billing settings
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <p>Completing bank connection…</p>
    </div>
  );
}
