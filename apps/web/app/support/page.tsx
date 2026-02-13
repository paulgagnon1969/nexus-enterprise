import React from "react";

export const metadata = {
  title: "App Support - Nexus Connect",
  description: "Support and help for Nexus Connect mobile and web applications",
};

export default function SupportPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold", marginBottom: "24px" }}>
        Nexus Connect Support
      </h1>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          About Nexus Connect
        </h2>
        <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>
          Nexus Connect is a comprehensive workforce management platform designed for
          construction and field service operations. Our platform enables seamless
          coordination between office teams and field workers with real-time project
          tracking, timecard management, and offline-first mobile capabilities.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Contact Support
        </h2>
        <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>
          For assistance with Nexus Connect, please contact our support team:
        </p>
        <ul style={{ lineHeight: "1.8", marginLeft: "20px" }}>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:support@nfsgrp.com" style={{ color: "#2563eb" }}>
              support@nfsgrp.com
            </a>
          </li>
          <li>
            <strong>Web:</strong>{" "}
            <a
              href="https://ncc.nfsgrp.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563eb" }}
            >
              ncc.nfsgrp.com
            </a>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Getting Help
        </h2>
        <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>
          Our support team is here to help you with:
        </p>
        <ul style={{ lineHeight: "1.8", marginLeft: "20px" }}>
          <li>Account setup and login issues</li>
          <li>Mobile app installation and configuration</li>
          <li>Project and timecard management</li>
          <li>Offline sync troubleshooting</li>
          <li>Feature requests and feedback</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          System Requirements
        </h2>
        <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>
          <strong>Mobile App:</strong>
        </p>
        <ul style={{ lineHeight: "1.8", marginLeft: "20px" }}>
          <li>iOS 13.0 or later (iPhone and iPad)</li>
          <li>Android 6.0 or later</li>
        </ul>
        <p style={{ lineHeight: "1.6", marginTop: "16px", marginBottom: "12px" }}>
          <strong>Web App:</strong>
        </p>
        <ul style={{ lineHeight: "1.8", marginLeft: "20px" }}>
          <li>Modern web browsers (Chrome, Safari, Firefox, Edge)</li>
          <li>Internet connection required for real-time sync</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Privacy & Terms
        </h2>
        <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>
          Nexus Connect is committed to protecting your privacy and data security.
          For more information about how we handle your data, please contact us at{" "}
          <a href="mailto:support@nfsgrp.com" style={{ color: "#2563eb" }}>
            support@nfsgrp.com
          </a>
          .
        </p>
      </section>

      <footer
        style={{
          marginTop: "48px",
          paddingTop: "24px",
          borderTop: "1px solid #e5e7eb",
          color: "#6b7280",
          fontSize: "14px",
        }}
      >
        <p>© 2026 NFS Group. All rights reserved.</p>
        <p style={{ marginTop: "8px" }}>
          Nexus Connect v1.1.0 | Last updated: February 2026
        </p>
      </footer>
    </div>
  );
}
