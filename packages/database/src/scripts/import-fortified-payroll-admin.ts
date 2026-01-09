import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import argon2 from "argon2";
import prisma from "../client";
import { Role } from "@prisma/client";

interface PayrollAdminRow {
  Active?: string; // YES / NO
  "1099 First Name"?: string;
  "1099 Last Name"?: string;
  "Combined Name LN / FN"?: string;
  "Pay Rate / HR"?: string;
  SSN?: string;
  email?: string;
  "Phone Number"?: string;
  "Bank Name"?: string;
  "Bank Routing"?: string;
  "Bank Acct"?: string;
  "Real Time ACH"?: string;
}

const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";
const DEFAULT_PASSWORD = "Nexus2026.01";

function parseCurrency(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function last4(raw?: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

function parseRealTimeAch(raw?: string): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "y" || v === "yes" || v === "true" || v === "1";
}

function normalizeEmail(email: string | undefined | null): string | null {
  const e = (email ?? "").trim();
  if (!e) return null;
  return e.toLowerCase();
}

async function main() {
  // __dirname = packages/database/src/scripts → repo root is four levels up
  const repoRoot = path.resolve(__dirname, "../../../..");
  const csvPath = path.join(
    repoRoot,
    "docs",
    "NEXUS TIME ACCOUNTING",
    "Payroll_Admin.csv",
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Payroll_Admin.csv not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as PayrollAdminRow[];

  console.log(`Loaded ${rows.length} rows from Payroll_Admin.csv`);
 
  const passwordHash = await argon2.hash(DEFAULT_PASSWORD);
  // In prod, we assume the Nexus Fortified Structures company already exists.
  // We intentionally do NOT upsert Company here, to avoid permission issues on locked-down schemas.
 
  let workerCreated = 0;
  let workerUpdated = 0;
  let usersCreated = 0;
  let membershipsCreated = 0;
 
  for (const row of rows) {
    const firstNameRaw = (row["1099 First Name"] ?? "").trim();
    const lastNameRaw = (row["1099 Last Name"] ?? "").trim();
    const combinedRaw = (row["Combined Name LN / FN"] ?? "").trim();

    let firstName = firstNameRaw;
    let lastName = lastNameRaw;

    if ((!firstName || !lastName) && combinedRaw) {
      // Expect "Last, First ..." pattern.
      const [lastPart, firstPart] = combinedRaw.split(",").map((s) => s.trim());
      if (!firstName && firstPart) firstName = firstPart.split(/\s+/)[0] ?? firstPart;
      if (!lastName && lastPart) lastName = lastPart;
    }

    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName) {
      continue; // skip nameless rows
    }

    const email = normalizeEmail(row.email);
    const phone = (row["Phone Number"] ?? "").trim() || null;
    const ssnRaw = (row.SSN ?? "").trim();
    const ssnHash = ssnRaw ? `last4:${last4(ssnRaw)}` : null;
    const defaultPayRate = parseCurrency(row["Pay Rate / HR"]);

    const activeRaw = (row.Active ?? "").trim().toUpperCase();
    const status = activeRaw === "YES" ? "ACTIVE" : activeRaw === "NO" ? "INACTIVE" : null;

    const bankName = (row["Bank Name"] ?? "").trim() || null;
    const bankRoutingLast4 = last4(row["Bank Routing"] ?? undefined);
    const bankAccountLast4 = last4(row["Bank Acct"] ?? undefined);
    const realTimeAch = parseRealTimeAch(row["Real Time ACH"]);

    const payoutMeta = {
      bankName,
      bankRoutingLast4,
      bankAccountLast4,
      realTimeAch,
    };

    const existingWorker = await prisma.worker.findUnique({
      where: { fullName },
    });

    if (!existingWorker) {
      await prisma.worker.create({
        data: {
          firstName: firstName || fullName.split(" ")[0] || "",
          lastName:
            lastName ||
            fullName.split(" ").slice(1).join(" ") ||
            firstName ||
            "",
          fullName,
          ssnHash,
          email,
          phone,
          defaultPayRate: defaultPayRate ?? null,
          status,
          notes: JSON.stringify({ payrollAdminPayout: payoutMeta }),
        },
      });
      workerCreated += 1;
    } else {
      await prisma.worker.update({
        where: { id: existingWorker.id },
        data: {
          ...(ssnHash ? { ssnHash } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(defaultPayRate != null ? { defaultPayRate } : {}),
          ...(status ? { status } : {}),
          notes: JSON.stringify({ payrollAdminPayout: payoutMeta }),
        },
      });
      workerUpdated += 1;
    }

    // Create User + CompanyMembership when we have an email.
    if (!email) {
      continue;
    }

    let user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: firstName || null,
          lastName: lastName || null,
        },
      });
      usersCreated += 1;
    }

    // Ensure membership in Nexus Fortified Structures.
    const membership = await prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: FORTIFIED_COMPANY_ID,
        },
      },
    });

    if (!membership) {
      await prisma.companyMembership.create({
        data: {
          userId: user.id,
          companyId: FORTIFIED_COMPANY_ID,
          role: Role.MEMBER,
        },
      });
      membershipsCreated += 1;
    }
  }

  console.log("Import complete.");
  console.log(`Workers created:   ${workerCreated}`);
  console.log(`Workers updated:   ${workerUpdated}`);
  console.log(`Users created:     ${usersCreated}`);
  console.log(`Memberships added: ${membershipsCreated}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
