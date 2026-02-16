"use client";

import Link from "next/link";

export default function WelcomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        color: "#f8fafc",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "24px 48px",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/nexconnect-logo.png"
            alt="Nexus Contractor Connect"
            style={{ height: 40, width: "auto" }}
          />
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            Nexus Contractor Connect
          </span>
        </div>
        <nav style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <a
            href="#features"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            Features
          </a>
          <a
            href="#about"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            About
          </a>
          <Link
            href="/login"
            style={{
              background: "#3b82f6",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Sign In
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "80px 48px 120px",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <img
            src="/ncc-login.gif"
            alt="Nexus Contractor Connect"
            style={{ maxWidth: 280, width: "100%", height: "auto" }}
          />
        </div>
        <div
          style={{
            display: "inline-block",
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: 50,
            padding: "8px 20px",
            fontSize: 13,
            color: "#60a5fa",
            marginBottom: 32,
          }}
        >
          ncc-nexus-contractor-connect.com
        </div>
        <h1
          style={{
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 700,
            lineHeight: 1.1,
            margin: "0 0 24px",
            background: "linear-gradient(135deg, #fff 0%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Build Smarter.
          <br />
          Connect Faster.
        </h1>
        <p
          style={{
            fontSize: 20,
            color: "#94a3b8",
            maxWidth: 640,
            margin: "0 auto 40px",
            lineHeight: 1.6,
          }}
        >
          Nexus Contractor Connect (NCC) is the all-in-one platform for
          construction companies to manage projects, workforce, documents, and
          client relationships — all in one place.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link
            href="/apply"
            style={{
              background: "#3b82f6",
              color: "#fff",
              padding: "14px 32px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            Get Started
          </Link>
          <Link
            href="/login"
            style={{
              background: "transparent",
              color: "#f8fafc",
              padding: "14px 32px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 16,
              border: "1px solid #475569",
            }}
          >
            Sign In →
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        style={{
          background: "rgba(15, 23, 42, 0.6)",
          padding: "80px 48px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            Everything You Need
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "#94a3b8",
              marginBottom: 56,
              fontSize: 16,
            }}
          >
            Powerful tools designed for modern construction management
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
            }}
          >
            {[
              {
                icon: "📋",
                title: "Project Management",
                desc: "Track projects from bid to completion with real-time status updates, scheduling, and milestone tracking.",
              },
              {
                icon: "👥",
                title: "Workforce Management",
                desc: "Manage your team, track certifications, handle onboarding, and coordinate across multiple job sites.",
              },
              {
                icon: "📄",
                title: "Document Control",
                desc: "Centralized document storage with version control, digital signatures, and secure sharing.",
              },
              {
                icon: "💰",
                title: "Financial Tracking",
                desc: "Budgeting, invoicing, expense tracking, and comprehensive financial reporting.",
              },
              {
                icon: "📊",
                title: "Reports & Analytics",
                desc: "Real-time dashboards and customizable reports to make data-driven decisions.",
              },
              {
                icon: "🔔",
                title: "Messaging & Alerts",
                desc: "Keep your team connected with integrated messaging and automated notifications.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid #334155",
                  borderRadius: 12,
                  padding: 28,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 16 }}>
                  {feature.icon}
                </div>
                <h3
                  style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}
                >
                  {feature.title}
                </h3>
                <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section
        id="about"
        style={{
          padding: "80px 48px",
          maxWidth: 900,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24 }}>
          About Nexus
        </h2>
        <p
          style={{
            color: "#94a3b8",
            fontSize: 18,
            lineHeight: 1.8,
            marginBottom: 24,
          }}
        >
          Nexus Contractor Connect was built by construction professionals who
          understand the unique challenges of managing complex building projects.
          Our platform brings together project management, workforce coordination,
          document control, and financial tracking into one unified system.
        </p>
        <p style={{ color: "#94a3b8", fontSize: 18, lineHeight: 1.8 }}>
          Whether you&apos;re a small specialty contractor or a large general
          contractor, NCC scales with your business and keeps your entire
          operation connected.
        </p>
      </section>

      {/* CTA Section */}
      <section
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
          padding: "64px 48px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
          Ready to streamline your operations?
        </h2>
        <p
          style={{
            color: "#bfdbfe",
            marginBottom: 32,
            fontSize: 16,
          }}
        >
          Join the contractors already using Nexus to build better.
        </p>
        <Link
          href="/apply"
          style={{
            background: "#fff",
            color: "#1e3a8a",
            padding: "14px 36px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          Get Started Free
        </Link>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: "40px 48px",
          borderTop: "1px solid #1e293b",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          <div style={{ color: "#64748b", fontSize: 14 }}>
            © {new Date().getFullYear()} Nexus Contractor Connect. All rights
            reserved.
            <span style={{ marginLeft: 16, color: "#94a3b8" }}>
              ncc-nexus-contractor-connect.com
            </span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Link
              href="/privacy"
              style={{ color: "#64748b", textDecoration: "none", fontSize: 14 }}
            >
              Privacy Policy
            </Link>
            <Link
              href="/support"
              style={{ color: "#64748b", textDecoration: "none", fontSize: 14 }}
            >
              Support
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
