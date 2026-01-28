import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import prisma from "../client";
import { ProjectPaymentMethod, ProjectPaymentStatus } from "@prisma/client";

type AnyRow = Record<string, any>;

function normKey(k: string): string {
  return String(k ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRow(row: AnyRow): AnyRow {
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[normKey(k)] = v;
  }
  return out;
}

function parseMoney(raw: any): number | null {
  const t = String(raw ?? "")
    .replace(/[,$]/g, "")
    .trim();
  if (!t) return null;

  // Support "(123.45)" negative formatting.
  const isParensNeg = t.startsWith("(") && t.endsWith(")");
  const n = Number(isParensNeg ? t.slice(1, -1) : t);
  if (!Number.isFinite(n)) return null;
  return isParensNeg ? -n : n;
}

function parseUsShortDate(raw: any): Date | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;

  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  let year = Number(m[3]);

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  // Use midday to avoid timezone edge cases shifting date.
  return new Date(year, month, day, 12, 0, 0, 0);
}

function parseMethod(typeRaw: any, descriptionRaw: any): ProjectPaymentMethod {
  const text = `${String(typeRaw ?? "")} ${String(descriptionRaw ?? "")}`.toUpperCase();

  if (text.includes("WIRE") || text.includes("FEDWIRE") || text.includes("CHIPS")) {
    return ProjectPaymentMethod.WIRE;
  }

  if (text.includes("ACH") || text.includes("EFT")) {
    return ProjectPaymentMethod.ACH;
  }

  if (text.includes("CHECK") || text.includes("CHEQUE")) {
    return ProjectPaymentMethod.CHECK;
  }

  return ProjectPaymentMethod.OTHER;
}

function extractReferenceFromDescription(description: string): string | null {
  const desc = String(description ?? "");

  const m =
    desc.match(/\bTRN:\s*([^\s,"]+)/i) ??
    desc.match(/\bIMAD:\s*([^\s,"]+)/i) ??
    desc.match(/\bSSN:\s*([^\s,"]+)/i);

  return m?.[1]?.trim() || null;
}

export async function importProjectPaymentsFromCsv(options: {
  projectId: string;
  csvPath: string;
  dryRun?: boolean;
  /** Optional label to prefix into `note`, e.g. "bank:PWC:20260127" */
  tag?: string | null;
}) {
  const { projectId, csvPath, dryRun = false, tag = null } = options;

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const project = await prisma.project.findFirst({ where: { id: projectId } });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  let rowsSeen = 0;
  let created = 0;
  let skipped = 0;
  let updatedExisting = 0;
  let stoppedOnFooter = false;

  // Heuristic: most of the provided bank CSV exports contain a "total" footer line and/or
  // thousands of blank rows like ",,,,,,". Once we see a footer or a long blank streak,
  // we stop reading the file to avoid parsing huge no-op tails.
  let emptyStreak = 0;
  const maxEmptyStreak = 50;

  const parser = fs
    .createReadStream(csvPath)
    .pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true, trim: true }));

  for await (const rawRow of parser as any as AsyncIterable<AnyRow>) {
    rowsSeen += 1;
    const row = normalizeRow(rawRow);

    const details = String(row.details ?? "").trim().toUpperCase();
    const postingDateRaw = row.posting_date;
    const description = String(row.description ?? "").trim();
    const amount = parseMoney(row.amount);
    const type = String(row.type ?? "").trim();

    const hasAnyData =
      Boolean(details) || Boolean(postingDateRaw) || Boolean(description) || amount !== null || Boolean(type);

    if (!hasAnyData) {
      emptyStreak += 1;
      if (emptyStreak >= maxEmptyStreak && created + skipped > 0) {
        stoppedOnFooter = true;
        break;
      }
      continue;
    }

    emptyStreak = 0;

    // Footer/total row: sometimes has amount but no other fields.
    if (!postingDateRaw && !description && amount !== null && created + skipped > 0) {
      stoppedOnFooter = true;
      break;
    }

    // We only want deposits/credits.
    if (details && details !== "CREDIT") {
      skipped += 1;
      continue;
    }

    if (amount === null || amount <= 0) {
      skipped += 1;
      continue;
    }

    const paidAt = parseUsShortDate(postingDateRaw);
    if (!paidAt) {
      skipped += 1;
      continue;
    }

    const method = parseMethod(type, description);

    const explicitRef = String(row.check_or_slip ?? row.check_or_slip_no ?? row.check_no ?? "").trim();
    const reference = explicitRef || extractReferenceFromDescription(description);

    const noteParts = [description || null, type ? `BankType:${type}` : null].filter(Boolean);
    const baseNote = (noteParts.join(" | ") || null) as string | null;
    const note = tag
      ? ([tag, baseNote].filter(Boolean).join(" | ") as string)
      : baseNote;

    // Dedup heuristic: same paidAt + amount + method + reference for unapplied payments.
    const existing = await prisma.projectPayment.findFirst({
      where: {
        companyId: project.companyId,
        projectId,
        invoiceId: null,
        status: ProjectPaymentStatus.RECORDED,
        paidAt,
        amount,
        method,
        reference: reference || null,
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;

      // If requested, tag existing matching payments so future cleanups / auditing are easier.
      if (tag && !dryRun) {
        const existingRow = await prisma.projectPayment.findFirst({
          where: { id: existing.id },
          select: { note: true },
        });

        const existingNote = String(existingRow?.note ?? "").trim();
        const alreadyTagged = existingNote === tag || existingNote.startsWith(`${tag} |`);

        if (!alreadyTagged) {
          const nextNote = existingNote ? `${tag} | ${existingNote}` : tag;
          await prisma.projectPayment.update({ where: { id: existing.id }, data: { note: nextNote } });
          updatedExisting += 1;
        }
      }

      continue;
    }

    if (!dryRun) {
      await prisma.projectPayment.create({
        data: {
          companyId: project.companyId,
          projectId,
          invoiceId: null,
          status: ProjectPaymentStatus.RECORDED,
          method,
          paidAt,
          amount,
          reference: reference || null,
          note,
          createdByUserId: null,
        },
      });
    }

    created += 1;
  }

  return {
    projectId,
    csvPath,
    dryRun,
    tag,
    rowsSeen,
    created,
    skipped,
    updatedExisting,
    stoppedOnFooter,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: ts-node src/scripts/import-project-payments-from-csv.ts <projectId> <csvPath> [--dry-run] [--tag <label>]",
    );
    process.exit(1);
  }

  const projectId = String(args[0] ?? "").trim();
  const csvPathArg = String(args[1] ?? "").trim();

  const repoRoot = path.resolve(__dirname, "../../../..");
  const csvPath = path.isAbsolute(csvPathArg) ? csvPathArg : path.resolve(repoRoot, csvPathArg);

  const dryRun = args.includes("--dry-run");

  let tag: string | null = null;
  const tagIdx = args.indexOf("--tag");
  if (tagIdx >= 0) {
    tag = String(args[tagIdx + 1] ?? "").trim() || null;
    if (!tag) {
      // eslint-disable-next-line no-console
      console.error("--tag requires a non-empty value");
      process.exit(1);
    }
  }

  const result = await importProjectPaymentsFromCsv({
    projectId,
    csvPath,
    dryRun,
    tag,
  });

  // eslint-disable-next-line no-console
  console.log("Import result:", result);

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void prisma.$disconnect().finally(() => process.exit(1));
});
