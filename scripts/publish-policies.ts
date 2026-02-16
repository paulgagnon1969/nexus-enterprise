/**
 * Publish Privacy Policy and Information Security Policy to NEXUS SYSTEM
 * Run with: npx ts-node scripts/publish-policies.ts
 */

const API_BASE = process.env.API_BASE || "https://ncc-nexus-contractor-connect.com";

// You'll need a SUPER_ADMIN token - get it from localStorage after logging in
const TOKEN = process.env.ADMIN_TOKEN || "";

const privacyPolicyHtml = `
<h1>Privacy Policy</h1>
<p><strong>Nexus Contractor Connect (NCC)</strong><br>
<strong>NFS Group</strong></p>
<p><strong>Effective Date:</strong> February 14, 2026<br>
<strong>Last Updated:</strong> February 14, 2026</p>

<hr>

<h2>Introduction</h2>
<p>NFS Group ("we," "us," or "our") respects your privacy. This Privacy Policy explains how we handle information when you use Nexus Contractor Connect and our mobile application Nexus Mobile (the "App").</p>

<hr>

<h2>Information We Collect</h2>
<p>We collect <strong>location data</strong> (precise or approximate, depending on the feature) only when you actively use the App and only if you grant permission through iOS Location Services.</p>
<ul>
  <li>We request access to your device's location solely to provide the core functionality of the App (e.g., recording job site locations for daily logs and timecards).</li>
  <li>This data is processed <strong>on-device</strong> or transiently as needed for real-time functionality.</li>
  <li>We do <strong>not</strong> store your location data on our servers.</li>
  <li>We do <strong>not</strong> collect any other personal information, such as name, email, device identifiers, contacts, photos, usage analytics, or any other data.</li>
</ul>
<p>No data is collected automatically in the background, and no data is transmitted to us or any third parties unless strictly required for the immediate App feature you're using.</p>

<hr>

<h2>How We Use Your Information</h2>
<p>We use location data <strong>exclusively</strong> to deliver the App's intended features while you are using it. We do not use it for any other purpose, including advertising, analytics, marketing, profiling, or sharing with third parties.</p>

<hr>

<h2>Sharing and Disclosure</h2>
<p>We do <strong>not</strong> share, sell, rent, or disclose your location data (or any other information) with any third parties. We do not engage in tracking across apps or websites.</p>

<hr>

<h2>Your Controls and Choices</h2>
<ul>
  <li>You control location access entirely through your device's settings (Settings &gt; Privacy &amp; Security &gt; Location Services &gt; Nexus Mobile).</li>
  <li>You can choose "While Using the App," "Never," or adjust precision.</li>
  <li>If you deny or revoke permission, the App's location-dependent features may not function.</li>
  <li>Since we do not store or retain any data, there is no data to access, correct, delete, or export.</li>
</ul>

<hr>

<h2>Children's Privacy</h2>
<p>Our App is not directed to children under 13 (or the applicable age in your region). We do not knowingly collect data from children.</p>

<hr>

<h2>Changes to This Policy</h2>
<p>We may update this Privacy Policy occasionally. We will post the revised version here with an updated effective date.</p>

<hr>

<h2>Contact Us</h2>
<p>If you have questions about this Privacy Policy, contact us at:<br>
<strong>Email:</strong> <a href="mailto:support@nfsgrp.com">support@nfsgrp.com</a></p>

<hr>

<p><em>This policy complies with applicable privacy laws and Apple's App Store guidelines.</em></p>

<p><strong>Document Owner:</strong> NFS Group<br>
<strong>Classification:</strong> Public</p>

<p>© 2026 NFS Group. All rights reserved.</p>
`;

const securityPolicyHtml = `
<h1>Information Security Policy</h1>
<p><strong>Nexus Contractor Connect (NCC)</strong><br>
<strong>NFS Group</strong></p>
<p><strong>Effective Date:</strong> February 16, 2026<br>
<strong>Last Updated:</strong> February 16, 2026<br>
<strong>Version:</strong> 1.0</p>

<hr>

<h2>1. Purpose</h2>
<p>This Information Security Policy establishes the security framework for Nexus Contractor Connect (NCC), ensuring the confidentiality, integrity, and availability of all information assets. This policy applies to all users, administrators, and systems that access or process data within the NCC platform.</p>

<hr>

<h2>2. Scope</h2>
<p>This policy covers:</p>
<ul>
  <li>All data stored, processed, or transmitted by NCC</li>
  <li>All users including employees, contractors, and third-party integrations</li>
  <li>All systems including web applications, mobile applications, APIs, and databases</li>
  <li>All environments including production, staging, and development</li>
</ul>

<hr>

<h2>3. Authentication &amp; Access Control</h2>

<h3>3.1 Password Security</h3>
<ul>
  <li><strong>Hashing Algorithm:</strong> All passwords are hashed using Argon2id, a memory-hard algorithm resistant to GPU and ASIC attacks</li>
  <li><strong>Legacy Migration:</strong> Bcrypt hashes from legacy systems are automatically upgraded to Argon2 upon successful login</li>
  <li><strong>Password Reset:</strong> Reset tokens expire after 15 minutes and are single-use</li>
</ul>

<h3>3.2 Token-Based Authentication</h3>
<ul>
  <li><strong>Access Tokens:</strong> Short-lived JWT tokens used for API authentication</li>
  <li><strong>Refresh Tokens:</strong> 30-day TTL, stored securely in Redis, rotated on each use</li>
  <li><strong>Token Revocation:</strong> Tokens are invalidated upon logout or password change</li>
  <li><strong>Device Sync Tokens:</strong> Permanent tokens for mobile offline-first synchronization, scoped to user and company</li>
</ul>

<h3>3.3 Role-Based Access Control (RBAC)</h3>
<p>NCC implements a hierarchical role system with Global Roles (SUPER_ADMIN, SUPPORT), Company Roles (OWNER, ADMIN, MEMBER, CLIENT), and Profile-Based Permissions (EXECUTIVE, PM, SUPERINTENDENT, HR, FINANCE, FOREMAN, CREW).</p>

<h3>3.4 Field-Level Security</h3>
<p>NCC provides granular permission control at the field level with View, Edit, and Export permissions configurable per resource type per role.</p>

<h3>3.5 Multi-Tenant Isolation</h3>
<ul>
  <li>All data is scoped to a specific company (tenant)</li>
  <li>Users can only access data within companies they have active memberships</li>
  <li>Cross-tenant data access is prevented at the database query level</li>
</ul>

<hr>

<h2>4. Data Protection</h2>

<h3>4.1 Encryption at Rest</h3>
<ul>
  <li><strong>Sensitive HR Data:</strong> Encrypted using AES-256-GCM with authenticated encryption</li>
  <li><strong>Encryption Keys:</strong> Derived from environment-configured secrets using SHA-256</li>
  <li><strong>Database:</strong> PostgreSQL with encryption at rest (managed database provider)</li>
</ul>

<h3>4.2 Encryption in Transit</h3>
<ul>
  <li><strong>HTTPS/TLS:</strong> All communications encrypted via TLS 1.2+</li>
  <li><strong>API Communications:</strong> All API endpoints require HTTPS</li>
  <li><strong>Mobile Sync:</strong> Device-to-server communication encrypted</li>
</ul>

<h3>4.3 Data Retention</h3>
<ul>
  <li><strong>Soft Deletes:</strong> Company and user records use soft deletion for data retention</li>
  <li><strong>Audit Logs:</strong> Retained indefinitely for compliance purposes</li>
  <li><strong>Backup Retention:</strong> Per database provider SLA (typically 30 days point-in-time recovery)</li>
</ul>

<hr>

<h2>5. Audit &amp; Logging</h2>
<p>All administrative actions are logged with actor identification, action performed, target entities, metadata, and timestamps. Logged actions include company creation/modification, user management, role changes, permission modifications, data exports, and configuration changes.</p>
<ul>
  <li>Logs are write-only (no deletion capability for standard users)</li>
  <li>Access to audit logs restricted to authorized personnel</li>
  <li>Logs include sufficient detail for forensic investigation</li>
</ul>

<hr>

<h2>6. Infrastructure Security</h2>
<ul>
  <li><strong>Input Validation:</strong> All inputs validated and sanitized</li>
  <li><strong>Whitelist Mode:</strong> Only explicitly allowed fields are processed</li>
  <li><strong>File Upload Limits:</strong> Maximum 10MB per file upload with type validation</li>
  <li><strong>Environment Variables:</strong> Secrets stored in environment configuration, never in code</li>
  <li><strong>CI/CD:</strong> Automated deployments with security checks</li>
</ul>

<hr>

<h2>7. Mobile Application Security</h2>
<ul>
  <li><strong>Offline-First Architecture:</strong> Data synced securely when connectivity available</li>
  <li><strong>Local Storage:</strong> Sensitive data encrypted on device</li>
  <li><strong>Location Data:</strong> Collected only when actively using the app with user permission</li>
  <li><strong>No Background Collection:</strong> Location tracking stops when app is not in use</li>
  <li><strong>Token Revocation:</strong> Supported for lost/stolen devices</li>
</ul>

<hr>

<h2>8. Incident Response</h2>
<p>Security incidents are classified by severity (Critical, High, Medium, Low) with appropriate response times. Our incident response procedure includes:</p>
<ol>
  <li><strong>Detection:</strong> Identify and classify the incident</li>
  <li><strong>Containment:</strong> Isolate affected systems/accounts</li>
  <li><strong>Investigation:</strong> Determine scope and impact</li>
  <li><strong>Remediation:</strong> Fix vulnerabilities, restore services</li>
  <li><strong>Communication:</strong> Notify affected parties as required</li>
  <li><strong>Documentation:</strong> Record incident details and lessons learned</li>
</ol>

<hr>

<h2>9. Compliance</h2>
<p>This security implementation aligns with:</p>
<ul>
  <li>SOC 2 Type II principles</li>
  <li>OWASP Top 10 security practices</li>
  <li>Apple App Store privacy guidelines</li>
</ul>

<hr>

<h2>10. User Responsibilities</h2>
<p>All users of NCC are expected to:</p>
<ol>
  <li><strong>Protect Credentials:</strong> Never share passwords or tokens</li>
  <li><strong>Report Incidents:</strong> Immediately report suspicious activity</li>
  <li><strong>Secure Devices:</strong> Maintain device security (screen locks, encryption)</li>
  <li><strong>Follow Policy:</strong> Adhere to this security policy and company guidelines</li>
</ol>

<hr>

<h2>Contact</h2>
<p>For questions about this policy or to report security concerns, contact us at:<br>
<a href="mailto:support@nfsgrp.com">support@nfsgrp.com</a></p>

<hr>

<p><em>This policy is reviewed annually and updated as needed.</em></p>

<p><strong>Document Owner:</strong> NFS Group Security Team<br>
<strong>Approved By:</strong> NFS Group Leadership<br>
<strong>Classification:</strong> Internal</p>
`;

async function publishPolicies() {
  if (!TOKEN) {
    console.error("ERROR: Set ADMIN_TOKEN environment variable with a SUPER_ADMIN JWT token");
    console.log("\nTo get a token:");
    console.log("1. Log in as SUPER_ADMIN at https://ncc-nexus-contractor-connect.com/login");
    console.log("2. Open browser DevTools → Application → Local Storage");
    console.log("3. Copy the 'accessToken' value");
    console.log("4. Run: ADMIN_TOKEN='your-token' npx ts-node scripts/publish-policies.ts");
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${TOKEN}`,
  };

  // Create Privacy Policy
  console.log("Creating Privacy Policy...");
  const privacyRes = await fetch(`${API_BASE}/system-documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      code: "POL-PRIVACY",
      title: "Privacy Policy",
      description: "NFS Group Privacy Policy for Nexus Contractor Connect and Nexus Mobile",
      category: "Policies",
      tags: ["privacy", "compliance", "legal"],
      htmlContent: privacyPolicyHtml,
    }),
  });

  if (!privacyRes.ok) {
    const err = await privacyRes.text();
    console.error("Failed to create Privacy Policy:", err);
  } else {
    const privacy = await privacyRes.json();
    console.log("✓ Privacy Policy created:", privacy.id);

    // Publish to all tenants
    console.log("Publishing Privacy Policy to all tenants...");
    const pubRes = await fetch(`${API_BASE}/system-documents/${privacy.id}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ targetType: "ALL_TENANTS" }),
    });
    if (pubRes.ok) {
      console.log("✓ Privacy Policy published to all tenants");
    } else {
      console.error("Failed to publish:", await pubRes.text());
    }
  }

  // Create Security Policy
  console.log("\nCreating Information Security Policy...");
  const securityRes = await fetch(`${API_BASE}/system-documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      code: "POL-SECURITY",
      title: "Information Security Policy",
      description: "NFS Group Information Security Policy for Nexus Contractor Connect",
      category: "Policies",
      tags: ["security", "compliance", "infosec"],
      htmlContent: securityPolicyHtml,
    }),
  });

  if (!securityRes.ok) {
    const err = await securityRes.text();
    console.error("Failed to create Security Policy:", err);
  } else {
    const security = await securityRes.json();
    console.log("✓ Security Policy created:", security.id);

    // Publish to all tenants
    console.log("Publishing Security Policy to all tenants...");
    const pubRes = await fetch(`${API_BASE}/system-documents/${security.id}/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify({ targetType: "ALL_TENANTS" }),
    });
    if (pubRes.ok) {
      console.log("✓ Security Policy published to all tenants");
    } else {
      console.error("Failed to publish:", await pubRes.text());
    }
  }

  console.log("\n========================================");
  console.log("DONE! View the policies at:");
  console.log("- https://ncc-nexus-contractor-connect.com/documents/system");
  console.log("========================================");
}

publishPolicies().catch(console.error);
