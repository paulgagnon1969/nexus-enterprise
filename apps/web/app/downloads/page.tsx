"use client";

import React, { useEffect, useState } from "react";

// ── Platform detection ───────────────────────────────────────────────

type Platform = "macos" | "windows" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "unknown";
}

const DOWNLOAD_LINKS: Record<Platform, { url: string; label: string; file: string }> = {
  macos: {
    url: "/api/downloads/nexbridge-connect-latest.dmg",
    label: "Download for macOS",
    file: "NexBRIDGE-Connect.dmg",
  },
  windows: {
    url: "/api/downloads/nexbridge-connect-latest.msi",
    label: "Download for Windows",
    file: "NexBRIDGE-Connect.msi",
  },
  unknown: {
    url: "#",
    label: "Select your platform",
    file: "",
  },
};

const FEATURES = [
  {
    icon: "📹",
    title: "Video Assessment",
    desc: "Walk a property with your phone, upload the video, and get AI-powered damage analysis with frame-by-frame extraction.",
    module: "NEXBRIDGE_ASSESS",
    price: "$29/mo",
  },
  {
    icon: "📐",
    title: "NexPLAN Selections",
    desc: "AI-assisted material selections — upload floor plans, browse vendor catalogs, generate professional selection sheets.",
    module: "NEXBRIDGE_NEXPLAN",
    price: "$39/mo",
  },
  {
    icon: "🧠",
    title: "AI Features Pack",
    desc: "Local AI inference for dimension extraction, product fitting, and enhanced vision analysis across all modules.",
    module: "NEXBRIDGE_AI",
    price: "$19/mo",
  },
  {
    icon: "📄",
    title: "Document Scanning",
    desc: "Scan folders of DOCX, PDF, and Markdown files — auto-convert to HTML and upload directly to NCC Documents.",
    module: "NEXBRIDGE",
    price: "Included",
  },
  {
    icon: "👥",
    title: "Contact Sync",
    desc: "Sync your macOS contacts to NCC with one click. Keep your project contacts and vendor lists up to date.",
    module: "NEXBRIDGE",
    price: "Included",
  },
  {
    icon: "🏗️",
    title: "Asset Management",
    desc: "View and manage company equipment, upload photos and attachments, track rental pool inventory.",
    module: "NEXBRIDGE",
    price: "Included",
  },
];

// ── Main Page ────────────────────────────────────────────────────────

export default function DownloadsPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const dl = DOWNLOAD_LINKS[platform];
  const altPlatform: Platform = platform === "macos" ? "windows" : "macos";
  const altDl = DOWNLOAD_LINKS[altPlatform];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {/* Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
          padding: "64px 24px 56px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Logo */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#3b82f6",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 28,
              color: "#ffffff",
              marginBottom: 20,
            }}
          >
            N
          </div>

          <h1 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 800, color: "#ffffff" }}>
            NexBRIDGE Connect
          </h1>
          <p style={{ margin: "0 0 4px", fontSize: 15, color: "#94a3b8" }}>
            Desktop companion for NEXUS Construction Cloud
          </p>
          <p style={{ margin: "0 0 32px", fontSize: 13, color: "#64748b" }}>
            Native Rust performance · Local AI processing · Seamless cloud sync
          </p>

          {/* Primary download */}
          <a
            href={dl.url}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 36px",
              borderRadius: 10,
              background: "#3b82f6",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
              transition: "background 0.15s, transform 0.1s",
              boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#2563eb";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#3b82f6";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <span style={{ fontSize: 22 }}>&#8615;</span>
            {dl.label}
          </a>

          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>v1.0.0 · </span>
            {platform !== "unknown" && (
              <a
                href={altDl.url}
                style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none" }}
              >
                {altDl.label}
              </a>
            )}
          </div>

          {/* Pricing summary */}
          <div
            style={{
              marginTop: 32,
              display: "inline-flex",
              gap: 16,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <PricingPill label="Base" price="$29/mo" desc="Contacts, Docs, Assets" />
            <PricingPill label="+ Video Assess" price="$29/mo" desc="AI damage analysis" />
            <PricingPill label="+ NexPLAN" price="$39/mo" desc="Material selections" />
            <PricingPill label="+ AI Pack" price="$19/mo" desc="Local inference" />
          </div>
        </div>
      </div>

      {/* Features grid */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#0f172a", textAlign: "center" }}>
          What&apos;s inside NexBRIDGE
        </h2>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: "#6b7280", textAlign: "center" }}>
          Subscribe only to the modules you need. Toggle them on and off from{" "}
          <a href="/settings/billing" style={{ color: "#3b82f6", textDecoration: "none" }}>
            Settings → Billing
          </a>{" "}
          at any time.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 28 }}>{f.icon}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: f.price === "Included" ? "#f0fdf4" : "#eff6ff",
                    color: f.price === "Included" ? "#15803d" : "#1d4ed8",
                  }}
                >
                  {f.price}
                </span>
              </div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                {f.title}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5, flex: 1 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* System requirements */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 48px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
            🍎 macOS
          </h3>
          <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 13, color: "#475569", lineHeight: 1.8 }}>
            <li>macOS 12 (Monterey) or later</li>
            <li>Apple Silicon (M1+) or Intel x86_64</li>
            <li>4 GB RAM minimum (8 GB recommended for AI features)</li>
            <li>500 MB disk space</li>
          </ul>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
            🪟 Windows
          </h3>
          <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 13, color: "#475569", lineHeight: 1.8 }}>
            <li>Windows 10 (version 1803) or later</li>
            <li>x86_64 processor</li>
            <li>4 GB RAM minimum (8 GB recommended for AI features)</li>
            <li>500 MB disk space</li>
            <li>WebView2 Runtime (auto-installed if missing)</li>
          </ul>
        </div>
      </div>

      {/* Footer CTA */}
      <div
        style={{
          background: "#f1f5f9",
          borderTop: "1px solid #e2e8f0",
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#475569" }}>
          Already have NexBRIDGE installed? Manage your subscription from the web.
        </p>
        <a
          href="/settings/billing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 24px",
            borderRadius: 8,
            background: "#0f172a",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Go to Billing Settings →
        </a>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function PricingPill({ label, price, desc }: { label: string; price: string; desc: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "8px 14px",
        textAlign: "left",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff" }}>{price}</div>
      <div style={{ fontSize: 10, color: "#64748b" }}>{desc}</div>
    </div>
  );
}
