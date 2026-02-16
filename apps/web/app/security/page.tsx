"use client";

import Link from "next/link";

export default function SecurityPage() {
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
        <Link
          href="/welcome"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            textDecoration: "none",
            color: "#f8fafc",
          }}
        >
          <img
            src="/nexconnect-logo.png"
            alt="Nexus Contractor Connect"
            style={{ height: 40, width: "auto" }}
          />
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            Nexus Contractor Connect
          </span>
        </Link>
        <nav style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link
            href="/welcome"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            Home
          </Link>
          <Link
            href="/welcome#privacy"
            style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}
          >
            Privacy
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

      {/* Main Content */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 48px 80px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>
          Information Security Policy
        </h1>
        <p style={{ color: "#94a3b8", marginBottom: 40 }}>
          Effective Date: February 16, 2026 • Version 1.0
        </p>

        {/* Policy Content */}
        <div
          style={{
            background: "rgba(30, 41, 59, 0.5)",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 40,
          }}
        >
          {/* Section 1 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              1. Purpose
            </h2>
            <p style={{ color: "#cbd5e1", lineHeight: 1.8 }}>
              This Information Security Policy establishes the security framework for Nexus
              Contractor Connect (NCC), ensuring the confidentiality, integrity, and
              availability of all information assets. This policy applies to all users,
              administrators, and systems that access or process data within the NCC platform.
            </p>
          </section>

          {/* Section 2 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              2. Scope
            </h2>
            <ul style={{ color: "#cbd5e1", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>All data stored, processed, or transmitted by NCC</li>
              <li>All users including employees, contractors, and third-party integrations</li>
              <li>All systems including web applications, mobile applications, APIs, and databases</li>
              <li>All environments including production, staging, and development</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              3. Authentication & Access Control
            </h2>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              3.1 Password Security
            </h3>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Hashing Algorithm:</strong> All passwords are hashed using Argon2id, a memory-hard algorithm resistant to GPU and ASIC attacks</li>
              <li><strong style={{ color: "#e2e8f0" }}>Legacy Migration:</strong> Bcrypt hashes from legacy systems are automatically upgraded to Argon2 upon successful login</li>
              <li><strong style={{ color: "#e2e8f0" }}>Password Reset:</strong> Reset tokens expire after 15 minutes and are single-use</li>
            </ul>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              3.2 Token-Based Authentication
            </h3>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Access Tokens:</strong> Short-lived JWT tokens used for API authentication</li>
              <li><strong style={{ color: "#e2e8f0" }}>Refresh Tokens:</strong> 30-day TTL, stored securely in Redis, rotated on each use</li>
              <li><strong style={{ color: "#e2e8f0" }}>Token Revocation:</strong> Tokens are invalidated upon logout or password change</li>
              <li><strong style={{ color: "#e2e8f0" }}>Device Sync Tokens:</strong> Permanent tokens for mobile offline-first synchronization, scoped to user and company</li>
            </ul>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              3.3 Role-Based Access Control (RBAC)
            </h3>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              NCC implements a hierarchical role system with Global Roles (SUPER_ADMIN, SUPPORT),
              Company Roles (OWNER, ADMIN, MEMBER, CLIENT), and Profile-Based Permissions
              (EXECUTIVE, PM, SUPERINTENDENT, HR, FINANCE, FOREMAN, CREW).
            </p>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              3.4 Field-Level Security
            </h3>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              NCC provides granular permission control at the field level with View, Edit, and
              Export permissions configurable per resource type per role.
            </p>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              3.5 Multi-Tenant Isolation
            </h3>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>All data is scoped to a specific company (tenant)</li>
              <li>Users can only access data within companies they have active memberships</li>
              <li>Cross-tenant data access is prevented at the database query level</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              4. Data Protection
            </h2>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              4.1 Encryption at Rest
            </h3>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Sensitive HR Data:</strong> Encrypted using AES-256-GCM with authenticated encryption</li>
              <li><strong style={{ color: "#e2e8f0" }}>Encryption Keys:</strong> Derived from environment-configured secrets using SHA-256</li>
              <li><strong style={{ color: "#e2e8f0" }}>Database:</strong> PostgreSQL with encryption at rest (managed database provider)</li>
            </ul>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              4.2 Encryption in Transit
            </h3>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
              <li><strong style={{ color: "#e2e8f0" }}>HTTPS/TLS:</strong> All communications encrypted via TLS 1.2+</li>
              <li><strong style={{ color: "#e2e8f0" }}>API Communications:</strong> All API endpoints require HTTPS</li>
              <li><strong style={{ color: "#e2e8f0" }}>Mobile Sync:</strong> Device-to-server communication encrypted</li>
            </ul>

            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: 24, color: "#e2e8f0" }}>
              4.3 Data Retention
            </h3>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Soft Deletes:</strong> Company and user records use soft deletion for data retention</li>
              <li><strong style={{ color: "#e2e8f0" }}>Audit Logs:</strong> Retained indefinitely for compliance purposes</li>
              <li><strong style={{ color: "#e2e8f0" }}>Backup Retention:</strong> Per database provider SLA (typically 30 days point-in-time recovery)</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              5. Audit & Logging
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              All administrative actions are logged with actor identification, action performed,
              target entities, metadata, and timestamps. Logged actions include company
              creation/modification, user management, role changes, permission modifications,
              data exports, and configuration changes.
            </p>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>Logs are write-only (no deletion capability for standard users)</li>
              <li>Access to audit logs restricted to authorized personnel</li>
              <li>Logs include sufficient detail for forensic investigation</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              6. Infrastructure Security
            </h2>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Input Validation:</strong> All inputs validated and sanitized</li>
              <li><strong style={{ color: "#e2e8f0" }}>Whitelist Mode:</strong> Only explicitly allowed fields are processed</li>
              <li><strong style={{ color: "#e2e8f0" }}>File Upload Limits:</strong> Maximum 10MB per file upload with type validation</li>
              <li><strong style={{ color: "#e2e8f0" }}>Environment Variables:</strong> Secrets stored in environment configuration, never in code</li>
              <li><strong style={{ color: "#e2e8f0" }}>CI/CD:</strong> Automated deployments with security checks</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              7. Mobile Application Security
            </h2>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Offline-First Architecture:</strong> Data synced securely when connectivity available</li>
              <li><strong style={{ color: "#e2e8f0" }}>Local Storage:</strong> Sensitive data encrypted on device</li>
              <li><strong style={{ color: "#e2e8f0" }}>Location Data:</strong> Collected only when actively using the app with user permission</li>
              <li><strong style={{ color: "#e2e8f0" }}>No Background Collection:</strong> Location tracking stops when app is not in use</li>
              <li><strong style={{ color: "#e2e8f0" }}>Token Revocation:</strong> Supported for lost/stolen devices</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              8. Incident Response
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              Security incidents are classified by severity (Critical, High, Medium, Low) with
              appropriate response times. Our incident response procedure includes:
            </p>
            <ol style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Detection:</strong> Identify and classify the incident</li>
              <li><strong style={{ color: "#e2e8f0" }}>Containment:</strong> Isolate affected systems/accounts</li>
              <li><strong style={{ color: "#e2e8f0" }}>Investigation:</strong> Determine scope and impact</li>
              <li><strong style={{ color: "#e2e8f0" }}>Remediation:</strong> Fix vulnerabilities, restore services</li>
              <li><strong style={{ color: "#e2e8f0" }}>Communication:</strong> Notify affected parties as required</li>
              <li><strong style={{ color: "#e2e8f0" }}>Documentation:</strong> Record incident details and lessons learned</li>
            </ol>
          </section>

          {/* Section 9 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              9. Data Retention & Deletion
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              NCC maintains a defined Data Retention and Deletion Policy in compliance with applicable
              data privacy laws. Key retention periods:
            </p>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 }}>
              <li><strong style={{ color: "#e2e8f0" }}>User accounts:</strong> Duration of engagement + 3 years; inactive accounts archived after 2 years</li>
              <li><strong style={{ color: "#e2e8f0" }}>Project & financial records:</strong> 7 years (IRS/tax compliance)</li>
              <li><strong style={{ color: "#e2e8f0" }}>Audit logs:</strong> 7 years (compliance and forensics)</li>
              <li><strong style={{ color: "#e2e8f0" }}>Session tokens:</strong> 30 days (automatic expiration)</li>
            </ul>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              <strong style={{ color: "#e2e8f0" }}>Data subject requests:</strong> Users may request deletion of their personal data.
              Requests are processed within 30 days per GDPR requirements.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              This policy is reviewed annually. Next review: February 2027.
            </p>
          </section>

          {/* Section 10 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              10. Compliance
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              This security implementation aligns with:
            </p>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li>SOC 2 Type II principles</li>
              <li>OWASP Top 10 security practices</li>
              <li>GDPR (EU General Data Protection Regulation)</li>
              <li>CCPA (California Consumer Privacy Act)</li>
              <li>Apple App Store privacy guidelines</li>
              <li>OSHA record retention requirements</li>
            </ul>
          </section>

          {/* Section 11 */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              11. User Responsibilities
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: 16 }}>
              All users of NCC are expected to:
            </p>
            <ol style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: "#e2e8f0" }}>Protect Credentials:</strong> Never share passwords or tokens</li>
              <li><strong style={{ color: "#e2e8f0" }}>Report Incidents:</strong> Immediately report suspicious activity</li>
              <li><strong style={{ color: "#e2e8f0" }}>Secure Devices:</strong> Maintain device security (screen locks, encryption)</li>
              <li><strong style={{ color: "#e2e8f0" }}>Follow Policy:</strong> Adhere to this security policy and company guidelines</li>
            </ol>
          </section>

          {/* Contact */}
          <section>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: "#f1f5f9" }}>
              Contact
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              For questions about this policy or to report security concerns, contact us at:{" "}
              <a
                href="mailto:support@nfsgrp.com"
                style={{ color: "#60a5fa", textDecoration: "none" }}
              >
                support@nfsgrp.com
              </a>
            </p>
          </section>
        </div>

        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            marginTop: 32,
            fontSize: 13,
          }}
        >
          This policy is reviewed annually and updated as needed. Last updated: February 16, 2026.
        </p>
      </main>

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
            © {new Date().getFullYear()} Nexus Contractor Connect. All rights reserved.
            <span style={{ marginLeft: 16, color: "#94a3b8" }}>
              ncc-nexus-contractor-connect.com
            </span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Link
              href="/welcome#privacy"
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
