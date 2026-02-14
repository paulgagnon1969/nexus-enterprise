"use client";

import React, { useEffect, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Default/fallback privacy policy content
const DEFAULT_CONTENT = `
<h1>Privacy Policy for Nexus Mobile</h1>
<p><strong>Effective Date:</strong> February 14, 2026<br/>
<strong>Last Updated:</strong> February 14, 2026</p>

<p>NFS Group ("we," "us," or "our") respects your privacy. This Privacy Policy
explains how we handle information when you use our mobile application Nexus
Mobile (the "App").</p>

<h2>Information We Collect</h2>
<p>We collect <strong>location data</strong> (precise or approximate, depending on
the feature) only when you actively use the App and only if you grant
permission through iOS Location Services.</p>
<ul>
<li>We request access to your device's location solely to provide the core
functionality of the App (e.g., recording job site locations for daily logs
and timecards).</li>
<li>This data is processed <strong>on-device</strong> or transiently as needed
for real-time functionality.</li>
<li>We do <strong>not</strong> store your location data on our servers beyond
what is necessary for your work records.</li>
<li>We do <strong>not</strong> collect any other personal information, such as
contacts, browsing history, or advertising identifiers.</li>
</ul>
<p>No data is collected automatically in the background, and no data is
transmitted to us or any third parties unless strictly required for the
immediate App feature you're using.</p>

<h2>How We Use Your Information</h2>
<p>We use location data <strong>exclusively</strong> to deliver the App's intended
features while you are using it. We do not use it for any other purpose,
including advertising, analytics, marketing, profiling, or sharing with third
parties.</p>

<h2>Sharing and Disclosure</h2>
<p>We do <strong>not</strong> share, sell, rent, or disclose your location data
(or any other information) with any third parties. We do not engage in tracking
across apps or websites.</p>

<h2>Your Controls and Choices</h2>
<ul>
<li>You control location access entirely through your device's settings (Settings
&gt; Privacy &amp; Security &gt; Location Services &gt; Nexus Mobile).</li>
<li>You can choose "While Using the App," "Never," or adjust precision.</li>
<li>If you deny or revoke permission, the App's location-dependent features may
not function.</li>
<li>Since we do not store or retain any data beyond your work records, there is
no additional data to access, correct, delete, or export.</li>
</ul>

<h2>Children's Privacy</h2>
<p>Our App is not directed to children under 13 (or the applicable age in your
region). We do not knowingly collect data from children.</p>

<h2>Changes to This Policy</h2>
<p>We may update this Privacy Policy occasionally. We will post the revised
version here with an updated effective date.</p>

<h2>Contact Us</h2>
<p>If you have questions about this Privacy Policy, contact us at:
<a href="mailto:support@nfsgrp.com">support@nfsgrp.com</a></p>
`;

export default function PrivacyPolicyPage() {
  const [content, setContent] = useState<string>(DEFAULT_CONTENT);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPolicy() {
      try {
        const res = await fetch(`${API_BASE}/document-import/public/privacy-policy`);
        if (res.ok) {
          const data = await res.json();
          if (data.htmlContent) {
            setContent(data.htmlContent);
            setLastUpdated(data.updatedAt);
          }
        }
      } catch {
        // Fall back to default content
      } finally {
        setLoading(false);
      }
    }
    fetchPolicy();
  }, []);

  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "b", "em", "i", "u",
      "a",
      "div", "span",
    ],
    ALLOWED_ATTR: ["href", "class", "style"],
  });

  if (loading) {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
      <div
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          lineHeight: "1.6",
          color: "#1f2937",
        }}
      />

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
        {lastUpdated && (
          <p style={{ marginTop: "8px" }}>
            Last updated: {new Date(lastUpdated).toLocaleDateString()}
          </p>
        )}
        <p style={{ marginTop: "8px" }}>© 2026 NFS Group. All rights reserved.</p>
      </footer>

      <style jsx global>{`
        .privacy-content h1 { font-size: 32px; font-weight: bold; margin-bottom: 8px; }
        .privacy-content h2 { font-size: 24px; font-weight: 600; margin: 32px 0 16px; }
        .privacy-content p { margin-bottom: 12px; }
        .privacy-content ul { margin-left: 20px; margin-bottom: 12px; }
        .privacy-content li { margin-bottom: 8px; }
        .privacy-content a { color: #2563eb; }
      `}</style>
    </div>
  );
}
