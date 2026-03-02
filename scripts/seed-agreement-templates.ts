/**
 * Seed system-level agreement templates into the AgreementTemplate table.
 *
 * Creates templates with companyId = null so they are visible to all tenants.
 * Idempotent: skips templates whose code already exists (system-level).
 *
 * Usage:
 *   npx ts-node scripts/seed-agreement-templates.ts
 *
 * Requires DATABASE_URL in env (or packages/database/.env).
 */

import * as path from "node:path";
import * as fs from "node:fs";
require("dotenv").config({ path: path.resolve(__dirname, "../packages/database/.env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

interface TemplateVariableDef {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "date" | "number" | "textarea";
  required?: boolean;
  group?: string;
  defaultValue?: string;
}

interface SystemTemplate {
  code: string;
  title: string;
  description: string;
  jurisdiction: string;
  category: "CONTINGENCY" | "SUBCONTRACT" | "CHANGE_ORDER" | "SERVICE" | "NDA" | "WORK_AUTHORIZATION" | "OTHER";
  htmlFilePath: string; // relative to repo root
  variables: TemplateVariableDef[];
}

const TEMPLATES: SystemTemplate[] = [
  {
    code: "FL-CONTINGENCY-001",
    title: "Florida Contingency Agreement",
    description:
      "Florida residential property insurance contingency agreement package " +
      "with Exhibits A (Terms & Conditions), B (Mechanics Lien Notice), " +
      "and C (Irrevocable Direction To Pay & Equitable Lien).",
    jurisdiction: "FL",
    category: "CONTINGENCY",
    htmlFilePath: "docs/agreement-templates/fl-contingency-agreement.html",
    variables: [
      // Company
      { key: "COMPANY_NAME",       label: "Company Legal Name",        type: "text",  required: true,  group: "Company" },
      { key: "COMPANY_ADDRESS",    label: "Company Address",           type: "text",  required: true,  group: "Company" },
      { key: "CGC_LICENSE_NO",     label: "CGC License Number",        type: "text",  required: true,  group: "Company" },
      { key: "CEO_NAME",           label: "CEO / License Holder Name", type: "text",  required: true,  group: "Company" },
      { key: "COMPANY_LOGO",       label: "Company Logo URL",          type: "text",  required: false, group: "Company" },
      // Property Owner
      { key: "PROPERTY_ADDRESS",   label: "Property Address",          type: "text",  required: true,  group: "Property Owner" },
      { key: "PROPERTY_OWNER_1",   label: "Primary Owner Name",        type: "text",  required: true,  group: "Property Owner" },
      { key: "PROPERTY_OWNER_2",   label: "Secondary Owner Name",      type: "text",  required: false, group: "Property Owner" },
      { key: "OWNER_HOME_PHONE",   label: "Owner Home Phone",          type: "phone", required: false, group: "Property Owner" },
      { key: "OWNER_MOBILE",       label: "Owner Mobile",              type: "phone", required: false, group: "Property Owner" },
      { key: "OWNER_ADDRESS",      label: "Owner Mailing Address",     type: "text",  required: false, group: "Property Owner" },
      { key: "AUTH_REP_NAME",      label: "Authorized Rep Name",       type: "text",  required: false, group: "Property Owner" },
      { key: "AUTH_REP_PHONE",     label: "Authorized Rep Phone",      type: "phone", required: false, group: "Property Owner" },
      // Insurance / Claim
      { key: "INS_COMPANY",        label: "Insurance Company / Agent", type: "text",  required: false, group: "Insurance" },
      { key: "INS_AGENT_PHONE",    label: "Agent Phone",               type: "phone", required: false, group: "Insurance" },
      { key: "INS_AGENT_EMAIL",    label: "Agent Email",               type: "email", required: false, group: "Insurance" },
      { key: "POLICY_NUMBER",      label: "Policy Number",             type: "text",  required: false, group: "Insurance" },
      { key: "CLAIM_NUMBER",       label: "Claim Number",              type: "text",  required: false, group: "Insurance" },
      { key: "LOSS_DATE",          label: "Date of Loss",              type: "date",  required: false, group: "Insurance" },
      { key: "LOSS_DAMAGE",        label: "Description of Loss/Damage", type: "text", required: false, group: "Insurance" },
      // Adjuster
      { key: "ADJUSTER_NAME",      label: "Adjuster Name",             type: "text",  required: false, group: "Adjuster" },
      { key: "ADJUSTER_EMAIL",     label: "Adjuster Email",            type: "email", required: false, group: "Adjuster" },
      { key: "ADJUSTER_PHONE",     label: "Adjuster Phone",            type: "phone", required: false, group: "Adjuster" },
      { key: "ADJUSTER_APPT_DATE", label: "Adjuster Appointment Date", type: "date",  required: false, group: "Adjuster" },
      // Agreement
      { key: "AGREEMENT_DATE",     label: "Agreement Date",            type: "date",  required: false, group: "Agreement" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const repoRoot = path.resolve(__dirname, "..");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    let created = 0;
    let skipped = 0;

    for (const tmpl of TEMPLATES) {
      // Check if this system-level template already exists
      const existing = await prisma.agreementTemplate.findFirst({
        where: { companyId: null, code: tmpl.code },
      });

      if (existing) {
        console.log(`  SKIP "${tmpl.code}" — already exists (id: ${existing.id})`);
        skipped++;
        continue;
      }

      // Read HTML content from file
      const htmlPath = path.join(repoRoot, tmpl.htmlFilePath);
      if (!fs.existsSync(htmlPath)) {
        console.error(`  ERROR: HTML file not found: ${htmlPath}`);
        continue;
      }
      const htmlContent = fs.readFileSync(htmlPath, "utf-8");

      await prisma.agreementTemplate.create({
        data: {
          companyId: null,
          code: tmpl.code,
          title: tmpl.title,
          description: tmpl.description,
          jurisdiction: tmpl.jurisdiction,
          category: tmpl.category,
          htmlContent,
          variables: tmpl.variables as any,
          currentVersion: 1,
          isActive: true,
        },
      });

      console.log(`  CREATED "${tmpl.code}" — ${tmpl.title}`);
      created++;
    }

    console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Total templates: ${TEMPLATES.length}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
