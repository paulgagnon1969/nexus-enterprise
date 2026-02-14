/**
 * Seed Privacy Policy document into the database
 * 
 * Usage: npx ts-node src/seed-privacy-policy.ts
 * 
 * This script creates a published StagedDocument with the privacy policy
 * HTML content and the `public:privacy-policy` tag so it's accessible
 * via the public /privacy page.
 */

import prisma from "./client";
import { StagedDocumentStatus } from "@prisma/client";

const PRIVACY_POLICY_HTML = `
<h1>Privacy Policy for Nexus Mobile</h1>

<p><strong>Effective Date:</strong> February 14, 2026<br>
<strong>Last Updated:</strong> February 14, 2026</p>

<p>NFS Group ("we," "us," or "our") respects your privacy. This Privacy Policy explains how we handle information when you use our mobile application Nexus Mobile (the "App").</p>

<h2>Information We Collect</h2>
<p>We collect <strong>location data</strong> (precise or approximate, depending on the feature) only when you actively use the App and only if you grant permission through iOS Location Services.</p>

<ul>
    <li>We request access to your device's location solely to provide the core functionality of the App (e.g., recording job site locations for daily logs and timecards).</li>
    <li>This data is processed <strong>on-device</strong> or transiently as needed for real-time functionality.</li>
    <li>We do <strong>not</strong> store your location data on our servers.</li>
    <li>We do <strong>not</strong> collect any other personal information, such as name, email, device identifiers, contacts, photos, usage analytics, or any other data.</li>
</ul>

<p>No data is collected automatically in the background, and no data is transmitted to us or any third parties unless strictly required for the immediate App feature you're using.</p>

<h2>How We Use Your Information</h2>
<p>We use location data <strong>exclusively</strong> to deliver the App's intended features while you are using it. We do not use it for any other purpose, including advertising, analytics, marketing, profiling, or sharing with third parties.</p>

<h2>Sharing and Disclosure</h2>
<p>We do <strong>not</strong> share, sell, rent, or disclose your location data (or any other information) with any third parties. We do not engage in tracking across apps or websites.</p>

<h2>Your Controls and Choices</h2>
<ul>
    <li>You control location access entirely through your device's settings (Settings &gt; Privacy &amp; Security &gt; Location Services &gt; Nexus Mobile).</li>
    <li>You can choose "While Using the App," "Never," or adjust precision.</li>
    <li>If you deny or revoke permission, the App's location-dependent features may not function.</li>
    <li>Since we do not store or retain any data, there is no data to access, correct, delete, or export.</li>
</ul>

<h2>Children's Privacy</h2>
<p>Our App is not directed to children under 13 (or the applicable age in your region). We do not knowingly collect data from children.</p>

<h2>Changes to This Policy</h2>
<p>We may update this Privacy Policy occasionally. We will post the revised version here with an updated effective date.</p>

<h2>Contact Us</h2>
<p>If you have questions about this Privacy Policy, contact us at: <a href="mailto:support@nfsgrp.com">support@nfsgrp.com</a></p>

<p><em>This policy complies with applicable privacy laws and Apple's App Store guidelines.</em></p>
`.trim();

async function seedPrivacyPolicy() {
  console.log("🔍 Seeding Privacy Policy document...\n");

  // Get the first company to seed into (for dev purposes)
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!company) {
    console.error("❌ No company found in database. Please create one first.");
    process.exit(1);
  }

  // Find an admin/owner user to attribute the import to
  const user = await prisma.user.findFirst({
    where: {
      memberships: {
        some: {
          companyId: company.id,
          role: { in: ["OWNER", "ADMIN"] },
        },
      },
    },
  });

  if (!user) {
    console.error("❌ No admin/owner user found. Please create one first.");
    process.exit(1);
  }

  // Create or find a scan job for system documents
  let scanJob = await prisma.documentScanJob.findFirst({
    where: {
      companyId: company.id,
      scanPath: "system/public-documents",
    },
  });

  if (!scanJob) {
    scanJob = await prisma.documentScanJob.create({
      data: {
        company: { connect: { id: company.id } },
        createdBy: { connect: { id: user.id } },
        scanPath: "system/public-documents",
        status: "COMPLETED",
        documentsFound: 1,
        documentsProcessed: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    console.log(`📋 Created scan job: ${scanJob.id}`);
  } else {
    console.log(`📋 Using existing scan job: ${scanJob.id}`);
  }

  console.log(`🏢 Seeding into company: ${company.name} (${company.id})\n`);

  // Check if privacy policy already exists
  const existing = await prisma.stagedDocument.findFirst({
    where: {
      companyId: company.id,
      tags: { has: "public:privacy-policy" },
    },
  });

  if (existing) {
    console.log(`⏭️  Privacy policy already exists (ID: ${existing.id})`);
    console.log(`   Title: ${existing.displayTitle || existing.fileName}`);
    console.log(`   Status: ${existing.status}`);
    console.log(`   Tags: ${existing.tags?.join(", ") || "(none)"}`);
    
    // Update it if needed
    if (existing.status !== "PUBLISHED" || existing.htmlContent !== PRIVACY_POLICY_HTML) {
      await prisma.stagedDocument.update({
        where: { id: existing.id },
        data: {
          htmlContent: PRIVACY_POLICY_HTML,
          status: StagedDocumentStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedBy: { connect: { id: user.id } },
        },
      });
      console.log(`\n✅ Updated privacy policy to PUBLISHED status with latest content`);
    }
    return;
  }

  // Create the privacy policy document
  const doc = await prisma.stagedDocument.create({
    data: {
      company: { connect: { id: company.id } },
      scanJob: { connect: { id: scanJob.id } },
      scannedBy: { connect: { id: user.id } },
      fileName: "privacy-policy.html",
      filePath: "system/public-documents/privacy-policy.html",
      fileType: "html",
      fileSize: BigInt(Buffer.byteLength(PRIVACY_POLICY_HTML, "utf-8")),
      mimeType: "text/html",
      breadcrumb: ["system", "public-documents", "privacy-policy.html"],
      status: StagedDocumentStatus.PUBLISHED,
      scannedAt: new Date(),
      publishedAt: new Date(),
      publishedBy: { connect: { id: user.id } },
      // Document metadata
      displayTitle: "Privacy Policy",
      displayDescription: "Privacy Policy for Nexus Mobile app - explains how we handle user data and location information.",
      tags: ["public:privacy-policy", "legal", "app-store", "mobile"],
      category: "Legal",
      // HTML content
      htmlContent: PRIVACY_POLICY_HTML,
      conversionStatus: "COMPLETED",
      convertedAt: new Date(),
    },
  });

  console.log(`✅ Created Privacy Policy document:`);
  console.log(`   ID: ${doc.id}`);
  console.log(`   Title: ${doc.displayTitle}`);
  console.log(`   Status: ${doc.status}`);
  console.log(`   Tags: ${doc.tags?.join(", ")}`);
  console.log(`\n🌐 The privacy policy is now available at /privacy`);
  console.log(`📝 Edit it in Admin → Documents (search for "Privacy Policy")`);
}

seedPrivacyPolicy()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
