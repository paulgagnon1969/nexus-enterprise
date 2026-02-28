"use client";

import React from "react";

interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleCode: "MASTER_COSTBOOK" | "GOLDEN_PETL" | "GOLDEN_BOM";
  moduleName: string;
  price: string;
  features: string[];
  onPurchase?: () => void;
}

const MODULE_DETAILS = {
  MASTER_COSTBOOK: {
    icon: "📚",
    tagline: "Never build a cost book from scratch again",
    benefit: "Access 50,000+ pre-priced line items instantly",
  },
  GOLDEN_PETL: {
    icon: "⚡",
    tagline: "Create estimates in minutes, not hours",
    benefit: "Import pre-built templates for common project types",
  },
  GOLDEN_BOM: {
    icon: "📋",
    tagline: "Drag and drop perfect BOMs",
    benefit: "Pre-configured material lists for every scope",
  },
};

export default function UpsellModal({
  isOpen,
  onClose,
  moduleCode,
  moduleName,
  price,
  features,
  onPurchase,
}: UpsellModalProps) {
  if (!isOpen) return null;

  const details = MODULE_DETAILS[moduleCode];

  const handlePurchase = () => {
    if (onPurchase) {
      onPurchase();
    } else {
      // Default: Navigate to modules page
      window.location.href = "/settings/modules";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          padding: 40,
          maxWidth: 500,
          width: "90%",
          boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon & Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{details.icon}</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#111827" }}>
            Unlock {moduleName}
          </h2>
          <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 4 }}>
            {details.tagline}
          </p>
          <p style={{ fontSize: 14, color: "#2563eb", fontWeight: 600 }}>
            {details.benefit}
          </p>
        </div>

        {/* Features List */}
        <div
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#374151" }}>
            What's included:
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {features.map((feature, idx) => (
              <li
                key={idx}
                style={{
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Price & CTA */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
            {price}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            One-time payment • Lifetime access
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 20px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              backgroundColor: "white",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Maybe Later
          </button>
          <button
            onClick={handlePurchase}
            style={{
              flex: 1,
              padding: "12px 20px",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              backgroundColor: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            Purchase Now
          </button>
        </div>

        {/* Trust Signals */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#9ca3af" }}>
            🔒 Secure payment via Stripe • ✓ Instant access • 💳 All major cards accepted
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Hook for managing upsell modal state ────────────────────────────

export function useUpsellModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [moduleConfig, setModuleConfig] = React.useState<{
    moduleCode: "MASTER_COSTBOOK" | "GOLDEN_PETL" | "GOLDEN_BOM";
    moduleName: string;
    price: string;
    features: string[];
  } | null>(null);

  const showUpsell = (
    moduleCode: "MASTER_COSTBOOK" | "GOLDEN_PETL" | "GOLDEN_BOM",
    moduleName: string,
    price: string,
    features: string[]
  ) => {
    setModuleConfig({ moduleCode, moduleName, price, features });
    setIsOpen(true);
  };

  const hideUpsell = () => {
    setIsOpen(false);
    // Clear config after animation completes
    setTimeout(() => setModuleConfig(null), 300);
  };

  return {
    isOpen,
    moduleConfig,
    showUpsell,
    hideUpsell,
  };
}
