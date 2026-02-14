import React from "react";

export const metadata = {
  title: "Privacy Policy - Nexus Mobile",
  description: "Privacy Policy for Nexus Mobile application",
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold", marginBottom: "8px" }}>
        Privacy Policy for Nexus Mobile
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "32px" }}>
        <strong>Effective Date:</strong> February 14, 2026
        <br />
        <strong>Last Updated:</strong> February 14, 2026
      </p>

      <p style={{ lineHeight: "1.6", marginBottom: "24px" }}>
        NFS Group ("we," "us," or "our") respects your privacy. This Privacy Policy
        explains how we handle information when you use our mobile application Nexus
        Mobile (the "App").
      </p>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Information We Collect
        </h2>
        <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>
          We collect <strong>location data</strong> (precise or approximate, depending on
          the feature) only when you actively use the App and only if you grant
          permission through iOS Location Services.
        </p>
        <ul style={{ lineHeight: "1.8", marginLeft: "20px", marginBottom: "12px" }}>
          <li>
            We request access to your device's location solely to provide the core
            functionality of the App (e.g., recording job site locations for daily logs
            and timecards).
          </li>
          <li>
            This data is processed <strong>on-device</strong> or transiently as needed
            for real-time functionality.
          </li>
          <li>
            We do <strong>not</strong> store your location data on our servers beyond
            what is necessary for your work records.
          </li>
          <li>
            We do <strong>not</strong> collect any other personal information, such as
            contacts, browsing history, or advertising identifiers.
          </li>
        </ul>
        <p style={{ lineHeight: "1.6" }}>
          No data is collected automatically in the background, and no data is
          transmitted to us or any third parties unless strictly required for the
          immediate App feature you're using.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          How We Use Your Information
        </h2>
        <p style={{ lineHeight: "1.6" }}>
          We use location data <strong>exclusively</strong> to deliver the App's intended
          features while you are using it. We do not use it for any other purpose,
          including advertising, analytics, marketing, profiling, or sharing with third
          parties.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Sharing and Disclosure
        </h2>
        <p style={{ lineHeight: "1.6" }}>
          We do <strong>not</strong> share, sell, rent, or disclose your location data
          (or any other information) with any third parties. We do not engage in tracking
          across apps or websites.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Your Controls and Choices
        </h2>
        <ul style={{ lineHeight: "1.8", marginLeft: "20px" }}>
          <li>
            You control location access entirely through your device's settings (Settings
            &gt; Privacy &amp; Security &gt; Location Services &gt; Nexus Mobile).
          </li>
          <li>
            You can choose "While Using the App," "Never," or adjust precision.
          </li>
          <li>
            If you deny or revoke permission, the App's location-dependent features may
            not function.
          </li>
          <li>
            Since we do not store or retain any data beyond your work records, there is
            no additional data to access, correct, delete, or export.
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Children's Privacy
        </h2>
        <p style={{ lineHeight: "1.6" }}>
          Our App is not directed to children under 13 (or the applicable age in your
          region). We do not knowingly collect data from children.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Changes to This Policy
        </h2>
        <p style={{ lineHeight: "1.6" }}>
          We may update this Privacy Policy occasionally. We will post the revised
          version here with an updated effective date.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>
          Contact Us
        </h2>
        <p style={{ lineHeight: "1.6" }}>
          If you have questions about this Privacy Policy, contact us at:{" "}
          <a href="mailto:support@nfsgrp.com" style={{ color: "#2563eb" }}>
            support@nfsgrp.com
          </a>
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
        <p>
          This policy complies with applicable privacy laws and Apple's App Store
          guidelines.
        </p>
        <p style={{ marginTop: "8px" }}>© 2026 NFS Group. All rights reserved.</p>
      </footer>
    </div>
  );
}
