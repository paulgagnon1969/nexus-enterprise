"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function CamAccessLanding() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Check for a saved token and redirect if found
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nexus_cam_token");
      if (saved) {
        router.replace(`/cam-access/${saved}`);
        return;
      }
    } catch {}
    setChecking(false);
  }, [router]);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/cam-access/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      setSent(true); // Show success anyway — no email enumeration
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Checking access...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
          Nexus CAM Library
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: "#475569", maxWidth: 480, marginInline: "auto", lineHeight: 1.5 }}>
          The Competitive Advantage Manual — a curated collection of modules that define how Nexus transforms construction operations.
        </p>
      </div>

      <div style={cardStyle}>
        {!sent ? (
          <>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>
              Recover Your Access Link
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              Already been invited? Enter your email and we'll re-send your personal access link.
            </p>

            <form onSubmit={handleRecover}>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}
                >
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="jane@company.com"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!email.trim() || submitting}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  borderRadius: 6,
                  border: "none",
                  background: submitting ? "#6b7280" : "#0f172a",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: !email.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? "Sending..." : "Send My Access Link"}
              </button>
            </form>

            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid #e5e7eb",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>
                Don't have an invitation yet?{" "}
                <a
                  href="https://staging-ncc.nfsgrp.com"
                  style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                >
                  Learn more about Nexus
                </a>
              </p>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "#065f46" }}>
              Check Your Email
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280", lineHeight: 1.5, maxWidth: 400, marginInline: "auto" }}>
              If an invitation exists for <strong>{email}</strong>, we've sent a fresh access link.
              Check your inbox (and spam folder) for an email from Nexus.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try a different email
            </button>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "#9ca3af" }}>
        © {new Date().getFullYear()} Nexus Group LLC. All rights reserved.
        <br />
        The CAM Library contains confidential and proprietary information.
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
  padding: "60px 16px 40px",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 460,
  margin: "0 auto",
  background: "#ffffff",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  padding: 28,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
};
