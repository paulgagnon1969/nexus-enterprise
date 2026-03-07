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
          <a
            href="#privacy"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            Privacy
          </a>
          <Link
            href="/security"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            Security
          </Link>
          <Link
            href="/downloads"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            Desktop App
          </Link>
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
            src="/ncc-login.webp"
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
          ncc.nfsgrp.com
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

        {/* Client access entry point */}
        <div style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: 13, color: "#475569" }}>
            Invited to view a project?
          </span>
          <Link
            href="/login"
            style={{
              fontSize: 13,
              color: "#60a5fa",
              textDecoration: "none",
              fontWeight: 500,
              padding: "5px 14px",
              borderRadius: 20,
              border: "1px solid rgba(96,165,250,0.3)",
              background: "rgba(96,165,250,0.08)",
            }}
          >
            Client Sign In →
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              gap: 32,
              alignItems: "end",
            }}
          >
            {/* Left: NCC Web App — heading + 3x2 grid */}
            <div>
              <h2
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Everything You Need
              </h2>
              <p
                style={{
                  color: "#94a3b8",
                  marginBottom: 32,
                  fontSize: 16,
                }}
              >
                Powerful tools designed for modern construction management
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 20,
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
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>
                    {feature.icon}
                  </div>
                  <h3
                    style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}
                  >
                    {feature.title}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                    {feature.desc}
                  </p>
                </div>
              ))}
              </div>
            </div>

            {/* Right: NexBRIDGE Desktop Companion */}
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>
                  Nexus Power Add Companion
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  Desktop computing leveraged for your business
                </p>
              </div>

              <Link
                href="/downloads"
                style={{
                  background: "linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%)",
                  border: "1px solid #3b82f6",
                  borderRadius: 12,
                  padding: 24,
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  transition: "border-color 0.15s, transform 0.15s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#60a5fa";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 11,
                      background: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 18,
                      color: "#ffffff",
                      flexShrink: 0,
                    }}
                  >
                    N
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(59, 130, 246, 0.2)",
                      color: "#60a5fa",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
                    }}
                  >
                    Desktop App
                  </span>
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#f8fafc" }}>
                  NexBRIDGE Connect
                </h3>
                <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, margin: "0 0 20px" }}>
                  Local AI processing, video assessment, document scanning, and
                  material selections — running natively on macOS &amp; Windows.
                </p>

                {/* Feature mini-list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {[
                    { icon: "📹", label: "Video AI Assessment", price: "$29/mo" },
                    { icon: "📐", label: "NexPLAN Selections", price: "$39/mo" },
                    { icon: "🧠", label: "AI Features Pack", price: "$19/mo" },
                    { icon: "📄", label: "Document Scanning", price: "Included" },
                    { icon: "👥", label: "Contact Sync", price: "Included" },
                    { icon: "🏗️", label: "Asset Management", price: "Included" },
                  ].map((f) => (
                    <div
                      key={f.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: "#cbd5e1" }}>
                        <span style={{ marginRight: 6 }}>{f.icon}</span>
                        {f.label}
                      </span>
                      <span
                        style={{
                          color: f.price === "Included" ? "#4ade80" : "#60a5fa",
                          fontWeight: 500,
                        }}
                      >
                        {f.price}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid rgba(59, 130, 246, 0.2)", paddingTop: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>
                    ↓ Learn more &amp; download
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    Base starts at $29/mo · macOS &amp; Windows
                  </div>
                </div>
              </Link>
            </div>
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

      {/* Privacy Section */}
      <section
        id="privacy"
        style={{
          background: "rgba(15, 23, 42, 0.6)",
          padding: "80px 48px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            Privacy Policy
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "#94a3b8",
              marginBottom: 40,
              fontSize: 14,
            }}
          >
            Effective Date: February 14, 2026 • Last Updated: February 14, 2026
          </p>

          <div
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 32,
              textAlign: "left",
            }}
          >
            <p style={{ color: "#e2e8f0", marginBottom: 24, lineHeight: 1.7 }}>
              NFS Group ("we," "us," or "our") respects your privacy. This Privacy
              Policy explains how we handle information when you use Nexus
              Contractor Connect and our mobile application Nexus Mobile.
            </p>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#f1f5f9" }}>
              Information We Collect
            </h3>
            <p style={{ color: "#94a3b8", marginBottom: 16, lineHeight: 1.7 }}>
              We collect <strong style={{ color: "#e2e8f0" }}>location data</strong> (precise
              or approximate) only when you actively use the App and only if you
              grant permission through your device&apos;s Location Services.
            </p>
            <ul style={{ color: "#94a3b8", marginBottom: 24, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Location access is used solely to provide core functionality (e.g., recording job site locations for daily logs and timecards)</li>
              <li>Data is processed on-device or transiently for real-time functionality</li>
              <li>We do <strong style={{ color: "#e2e8f0" }}>not</strong> store your location data on our servers</li>
              <li>We do <strong style={{ color: "#e2e8f0" }}>not</strong> collect other personal information like device identifiers, contacts, photos, or usage analytics</li>
            </ul>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#f1f5f9" }}>
              How We Use Your Information
            </h3>
            <p style={{ color: "#94a3b8", marginBottom: 24, lineHeight: 1.7 }}>
              We use location data <strong style={{ color: "#e2e8f0" }}>exclusively</strong> to
              deliver the App&apos;s intended features while you are using it. We do
              not use it for advertising, analytics, marketing, profiling, or
              sharing with third parties.
            </p>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#f1f5f9" }}>
              Sharing and Disclosure
            </h3>
            <p style={{ color: "#94a3b8", marginBottom: 24, lineHeight: 1.7 }}>
              We do <strong style={{ color: "#e2e8f0" }}>not</strong> share, sell, rent, or
              disclose your location data (or any other information) with any
              third parties. We do not engage in tracking across apps or websites.
            </p>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#f1f5f9" }}>
              Your Controls and Choices
            </h3>
            <ul style={{ color: "#94a3b8", marginBottom: 24, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>You control location access entirely through your device&apos;s settings</li>
              <li>You can choose "While Using the App," "Never," or adjust precision</li>
              <li>If you deny or revoke permission, location-dependent features may not function</li>
              <li>Since we do not store or retain any data, there is no data to access, correct, delete, or export</li>
            </ul>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#f1f5f9" }}>
              Children&apos;s Privacy
            </h3>
            <p style={{ color: "#94a3b8", marginBottom: 24, lineHeight: 1.7 }}>
              Our App is not directed to children under 13 (or the applicable age
              in your region). We do not knowingly collect data from children.
            </p>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "#f1f5f9" }}>
              Contact Us
            </h3>
            <p style={{ color: "#94a3b8", marginBottom: 0, lineHeight: 1.7 }}>
              If you have questions about this Privacy Policy, contact us at:{" "}
              <a
                href="mailto:support@nfsgrp.com"
                style={{ color: "#60a5fa", textDecoration: "none" }}
              >
                support@nfsgrp.com
              </a>
            </p>
          </div>

          <p
            style={{
              textAlign: "center",
              color: "#64748b",
              marginTop: 24,
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            This policy complies with applicable privacy laws and Apple&apos;s App Store guidelines.
          </p>
        </div>
      </section>

      {/* Security Section */}
      <section
        id="security"
        style={{
          padding: "80px 48px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: 32,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Security & Compliance
        </h2>
        <p
          style={{
            textAlign: "center",
            color: "#94a3b8",
            marginBottom: 48,
            fontSize: 16,
          }}
        >
          Enterprise-grade security protecting your data
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
              icon: "🔐",
              title: "Argon2 Password Hashing",
              desc: "Industry-leading memory-hard algorithm resistant to GPU and ASIC attacks.",
            },
            {
              icon: "🔒",
              title: "AES-256 Encryption",
              desc: "Sensitive data encrypted at rest using authenticated AES-256-GCM encryption.",
            },
            {
              icon: "🛡️",
              title: "Role-Based Access Control",
              desc: "Granular permissions with field-level security controls per role.",
            },
            {
              icon: "🏢",
              title: "Multi-Tenant Isolation",
              desc: "Complete data separation between organizations at the database level.",
            },
            {
              icon: "📋",
              title: "Audit Logging",
              desc: "Comprehensive logging of all administrative actions for compliance.",
            },
            {
              icon: "✅",
              title: "SOC 2 Aligned",
              desc: "Security practices aligned with SOC 2 Type II and OWASP Top 10.",
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid #334155",
                borderRadius: 12,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                {item.title}
              </h3>
              <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Link
            href="/security"
            style={{
              color: "#60a5fa",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Read our full Information Security Policy →
          </Link>
        </div>
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
              ncc.nfsgrp.com
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
              href="/security"
              style={{ color: "#64748b", textDecoration: "none", fontSize: 14 }}
            >
              Security
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
