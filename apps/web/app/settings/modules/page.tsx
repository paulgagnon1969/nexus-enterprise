"use client";

import React, { useEffect, useState } from "react";
import { loadStripe, Stripe, StripeElements } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

const stripePromise = loadStripe(STRIPE_PK);

// ── Types ────────────────────────────────────────────────────────────

interface PremiumModule {
  code: string;
  label: string;
  description: string;
  oneTimePurchasePrice: number;
  formattedPrice: string;
}

interface PurchasedModule {
  code: string;
  label: string;
  description: string;
  purchasedAt: string;
}

// ── Fetch Helper ─────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("accessToken")
      : null;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Purchase Form (Stripe Elements) ──────────────────────────────────

interface PurchaseFormProps {
  module: PremiumModule;
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function PurchaseForm({ module, clientSecret, onSuccess, onCancel }: PurchaseFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/settings/modules?success=true&module=${module.code}`,
        },
      });

      if (submitError) {
        setError(submitError.message || "Payment failed");
      } else {
        // User will be redirected to return_url
      }
    } catch (err: any) {
      setError(err.message || "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
    }}>
      <div style={{
        backgroundColor: "white",
        borderRadius: 12,
        padding: 32,
        maxWidth: 500,
        width: "90%",
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Purchase {module.label}
        </h2>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>
          One-time payment of {module.formattedPrice} for lifetime access
        </p>

        <form onSubmit={handleSubmit}>
          <PaymentElement />

          {error && (
            <div style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: "#fee",
              border: "1px solid #fcc",
              borderRadius: 6,
              fontSize: 13,
              color: "#b91c1c",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "white",
                color: "#374151",
                cursor: processing ? "not-allowed" : "pointer",
                opacity: processing ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!stripe || processing}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "#2563eb",
                color: "white",
                cursor: !stripe || processing ? "not-allowed" : "pointer",
                opacity: !stripe || processing ? 0.5 : 1,
              }}
            >
              {processing ? "Processing..." : `Pay ${module.formattedPrice}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function ModulesPage() {
  const [available, setAvailable] = useState<PremiumModule[]>([]);
  const [purchased, setPurchased] = useState<PurchasedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<{
    module: PremiumModule;
    clientSecret: string;
  } | null>(null);

  useEffect(() => {
    loadModules();
    // Check for success redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      const moduleCode = params.get("module");
      if (moduleCode) {
        // Poll for access (webhook may take a few seconds)
        const pollInterval = setInterval(async () => {
          try {
            const modules = await apiFetch("/billing/modules/company");
            setPurchased(modules);
            if (modules.some((m: any) => m.code === moduleCode)) {
              clearInterval(pollInterval);
              // Clear URL params
              window.history.replaceState({}, "", "/settings/modules");
            }
          } catch {
            // Ignore polling errors
          }
        }, 2000);

        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(pollInterval), 30000);
      }
    }
  }, []);

  const loadModules = async () => {
    try {
      const [availableModules, purchasedModules] = await Promise.all([
        apiFetch("/billing/modules/available"),
        apiFetch("/billing/modules/company"),
      ]);
      setAvailable(availableModules);
      setPurchased(purchasedModules);
    } catch (err: any) {
      setError(err.message || "Failed to load modules");
    } finally {
      setLoading(false);
    }
  };

  const startPurchase = async (module: PremiumModule) => {
    setError(null);
    try {
      const { clientSecret } = await apiFetch(`/billing/modules/${module.code}/purchase`, {
        method: "POST",
      });
      setPurchasing({ module, clientSecret });
    } catch (err: any) {
      setError(err.message || "Failed to initiate purchase");
    }
  };

  const cancelPurchase = () => {
    setPurchasing(null);
  };

  const onPurchaseSuccess = () => {
    setPurchasing(null);
    loadModules();
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: "#6b7280" }}>
        Loading modules…
      </div>
    );
  }

  const isPurchased = (code: string) => purchased.some((m) => m.code === code);

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
        Premium Modules
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 32 }}>
        One-time purchases for lifetime access to premium features
      </p>

      {error && (
        <div style={{
          marginBottom: 24,
          padding: 16,
          backgroundColor: "#fee",
          border: "1px solid #fcc",
          borderRadius: 8,
          fontSize: 14,
          color: "#b91c1c",
        }}>
          {error}
        </div>
      )}

      {/* Purchased Modules */}
      {purchased.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Your Modules
          </h2>
          <div style={{ display: "grid", gap: 16 }}>
            {purchased.map((module) => (
              <div
                key={module.code}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: 20,
                  backgroundColor: "#f9fafb",
                }}
              >
                <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between" }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                      {module.label}
                    </h3>
                    <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
                      {module.description}
                    </p>
                    <p style={{ fontSize: 13, color: "#059669", fontWeight: 500 }}>
                      ✓ Active • Purchased {new Date(module.purchasedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Modules */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        {purchased.length > 0 ? "Available Modules" : "Get Started"}
      </h2>
      <div style={{ display: "grid", gap: 16 }}>
        {available.map((module) => {
          const owned = isPurchased(module.code);
          return (
            <div
              key={module.code}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: 20,
                backgroundColor: "white",
                opacity: owned ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {module.label}
                  </h3>
                  <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
                    {module.description}
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>
                    {module.formattedPrice}
                    <span style={{ fontSize: 13, fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>
                      one-time
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => !owned && startPurchase(module)}
                  disabled={owned}
                  style={{
                    padding: "10px 20px",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    backgroundColor: owned ? "#d1d5db" : "#2563eb",
                    color: "white",
                    cursor: owned ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {owned ? "Purchased" : "Purchase"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {available.length === 0 && purchased.length === 0 && (
        <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", padding: 40 }}>
          No modules available at this time
        </p>
      )}

      {/* Purchase Modal */}
      {purchasing && (
        <Elements stripe={stripePromise} options={{ clientSecret: purchasing.clientSecret }}>
          <PurchaseForm
            module={purchasing.module}
            clientSecret={purchasing.clientSecret}
            onSuccess={onPurchaseSuccess}
            onCancel={cancelPurchase}
          />
        </Elements>
      )}
    </div>
  );
}
