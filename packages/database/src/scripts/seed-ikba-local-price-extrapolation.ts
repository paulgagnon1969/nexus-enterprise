import prisma from '../client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Seeds the Local Price Extrapolation IKBA as an unpublished PnP document
 * in the Nexus system.
 * 
 * This creates a NEXUS-owned master document that can be:
 * 1. Seeded to tenant companies who subscribe to documentation package
 * 2. Viewed by internal teams (Engineering, Support, Operations)
 * 3. Customized by tenants if needed (creates a fork)
 */
async function seedLocalPriceExtrapolationIKBA() {
  console.log('📚 Seeding Local Price Extrapolation IKBA...\n');

  // Read the markdown IKBA file
  const ikbaPath = path.join(
    __dirname,
    '../../../../docs/internal/ikba-local-price-extrapolation.md'
  );

  if (!fs.existsSync(ikbaPath)) {
    throw new Error(`IKBA file not found at: ${ikbaPath}`);
  }

  const markdownContent = fs.readFileSync(ikbaPath, 'utf-8');

  // Convert markdown to HTML (basic conversion)
  // For production, you'd use a proper markdown-to-HTML library like 'marked'
  const htmlContent = convertMarkdownToHtml(markdownContent);

  // Check if document already exists
  const existing = await prisma.pnpDocument.findUnique({
    where: { code: 'OPERATIONS-LOCAL-PRICE-EXTRAPOLATION' },
    include: { currentVersion: true },
  });

  if (existing) {
    console.log(`⚠️  Document already exists: ${existing.title}`);
    console.log(`   Current version: ${existing.currentVersion?.versionNo || 'None'}`);
    console.log(`   Updating to version ${(existing.currentVersion?.versionNo || 0) + 1}...\n`);

    // Create new version
    const newVersion = await prisma.pnpDocumentVersion.create({
      data: {
        documentId: existing.id,
        versionNo: (existing.currentVersion?.versionNo || 0) + 1,
        versionLabel: `v${(existing.currentVersion?.versionNo || 0) + 1} - Updated ${new Date().toISOString().split('T')[0]}`,
        releaseNotes: 'Updated IKBA with Phase 2 completion details and smoke test guide',
        htmlContent,
        contentHash: generateContentHash(htmlContent),
        effectiveDate: new Date(),
        createdByUserId: null, // System-created
      },
    });

    // Update current version pointer
    await prisma.pnpDocument.update({
      where: { id: existing.id },
      data: { currentVersionId: newVersion.id },
    });

    console.log(`✅ Updated document to version ${newVersion.versionNo}`);
    console.log(`   Document ID: ${existing.id}`);
    console.log(`   Version ID: ${newVersion.id}\n`);

    return existing;
  }

  // Create new document
  const document = await prisma.pnpDocument.create({
    data: {
      code: 'OPERATIONS-LOCAL-PRICE-EXTRAPOLATION',
      title: 'Local Price Extrapolation System (IKBA)',
      category: 'OPERATIONS',
      description:
        'Internal Knowledge Base Article explaining how the Local Price Extrapolation system works. ' +
        'Educational guide for Engineering, Support, Product, and Operations teams. ' +
        'Covers learning from PETL imports, regional pricing intelligence, and API integration.',
      active: true,
      sortOrder: 100,
    },
  });

  console.log(`✅ Created master document: ${document.title}`);
  console.log(`   Document ID: ${document.id}`);
  console.log(`   Code: ${document.code}\n`);

  // Create initial version
  const version = await prisma.pnpDocumentVersion.create({
    data: {
      documentId: document.id,
      versionNo: 1,
      versionLabel: 'v1.0 - Initial Release',
      releaseNotes:
        'Initial IKBA release covering Phase 1 (database schema) and Phase 2 (core functions). ' +
        'Includes learning algorithm, extrapolation logic, troubleshooting, and FAQ.',
      htmlContent,
      contentHash: generateContentHash(htmlContent),
      effectiveDate: new Date(),
      createdByUserId: null, // System-created
    },
  });

  // Set as current version
  await prisma.pnpDocument.update({
    where: { id: document.id },
    data: { currentVersionId: version.id },
  });

  console.log(`✅ Created version 1.0`);
  console.log(`   Version ID: ${version.id}\n`);

  console.log('📋 Document Status: UNPUBLISHED (Master Only)');
  console.log('   - Available for internal viewing');
  console.log('   - Can be seeded to tenant companies via subscription');
  console.log('   - Tenants can customize (creates a fork)\n');

  return document;
}

/**
 * Basic markdown to HTML conversion
 * For production, use a proper library like 'marked' or 'markdown-it'
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;

  // Convert headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Convert bold
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

  // Convert italic
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Convert code blocks
  html = html.replace(/```([a-z]*)\n([\s\S]*?)```/gim, '<pre><code class="language-$1">$2</code></pre>');

  // Convert inline code
  html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>');

  // Convert lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');

  // Convert paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Convert horizontal rules
  html = html.replace(/^---$/gim, '<hr>');

  // Add basic styling
  html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Local Price Extrapolation System (IKBA)</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; border-bottom: 2px solid #ecf0f1; padding-bottom: 8px; }
    h3 { color: #7f8c8d; margin-top: 20px; }
    code {
      background: #f8f9fa;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
    }
    pre {
      background: #2d3748;
      color: #e2e8f0;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    ul { margin-left: 20px; }
    li { margin: 5px 0; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
    blockquote {
      border-left: 4px solid #3498db;
      margin: 10px 0;
      padding-left: 15px;
      color: #555;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #3498db;
      color: white;
    }
    hr {
      border: none;
      border-top: 2px solid #ecf0f1;
      margin: 30px 0;
    }
  </style>
</head>
<body>
${html}
</body>
</html>
  `.trim();

  return html;
}

/**
 * Generate a simple content hash for change detection
 */
function generateContentHash(content: string): string {
  // Simple hash for demonstration
  // In production, use a proper hashing library like 'crypto'
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Seed this IKBA to a specific tenant company
 * Creates a TenantPnpDocument in PENDING_REVIEW status
 */
export async function seedIKBAToTenant(companyId: string) {
  console.log(`\n📤 Seeding IKBA to tenant company: ${companyId}`);

  // Get the master document
  const masterDoc = await prisma.pnpDocument.findUnique({
    where: { code: 'OPERATIONS-LOCAL-PRICE-EXTRAPOLATION' },
    include: { currentVersion: true },
  });

  if (!masterDoc || !masterDoc.currentVersion) {
    throw new Error('Master IKBA document not found. Run seed script first.');
  }

  // Check if tenant already has this document
  const existingTenantDoc = await prisma.tenantPnpDocument.findUnique({
    where: {
      TenantPnpDocument_company_code_key: {
        companyId,
        code: 'OPERATIONS-LOCAL-PRICE-EXTRAPOLATION',
      },
    },
  });

  if (existingTenantDoc) {
    console.log(`⚠️  Tenant already has this document (ID: ${existingTenantDoc.id})`);
    return existingTenantDoc;
  }

  // Create tenant copy
  const tenantDoc = await prisma.tenantPnpDocument.create({
    data: {
      companyId,
      code: 'OPERATIONS-LOCAL-PRICE-EXTRAPOLATION',
      title: masterDoc.title,
      category: masterDoc.category,
      description: masterDoc.description,
      active: true,
      sourcePnpDocumentId: masterDoc.id,
      sourceVersionId: masterDoc.currentVersionId,
      isFork: false,
      reviewStatus: 'PENDING_REVIEW',
    },
  });

  // Create tenant version
  const tenantVersion = await prisma.tenantPnpDocumentVersion.create({
    data: {
      documentId: tenantDoc.id,
      versionNo: 1,
      versionLabel: 'v1.0 - Seeded from NEXUS',
      notes: `Seeded from NEXUS master document on ${new Date().toISOString().split('T')[0]}`,
      htmlContent: masterDoc.currentVersion.htmlContent,
      contentHash: masterDoc.currentVersion.contentHash,
      disclaimerHtml:
        '<p><em>This document is provided as-is from the NEXUS system library. ' +
        'Review and approve or customize it for your organization.</em></p>',
      createdByUserId: null, // System-seeded
    },
  });

  // Set as current version
  await prisma.tenantPnpDocument.update({
    where: { id: tenantDoc.id },
    data: { currentVersionId: tenantVersion.id },
  });

  console.log(`✅ Seeded to tenant`);
  console.log(`   Tenant Document ID: ${tenantDoc.id}`);
  console.log(`   Status: PENDING_REVIEW (awaiting admin approval)\n`);

  return tenantDoc;
}

// Run seeding
async function main() {
  try {
    await seedLocalPriceExtrapolationIKBA();

    console.log('✅ Seeding complete!\n');
    console.log('To seed this document to a tenant company:');
    console.log('   import { seedIKBAToTenant } from "./seed-ikba-local-price-extrapolation";');
    console.log('   await seedIKBAToTenant("COMPANY_ID");\n');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { seedLocalPriceExtrapolationIKBA };
