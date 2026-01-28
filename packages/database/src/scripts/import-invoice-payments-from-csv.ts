import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "../client";
import { ProjectInvoiceStatus, ProjectPaymentMethod, ProjectPaymentStatus } from "@prisma/client";

type AnyRow = Record<string, any>;

function normKey(k: string): string {
  return String(k)
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
    .replace(/[$,]/g, "")
    .trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseDate(raw: any): Date | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseMethod(raw: any): ProjectPaymentMethod {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();

  // Common aliases
  const normalized =
    t === "EFT" || t === "BANK" || t === "TRANSFER" ? "ACH" :
    t === "CHEQUE" ? "CHECK" :
    t;

  if (normalized in ProjectPaymentMethod) {
    return (ProjectPaymentMethod as any)[normalized] as ProjectPaymentMethod;
  }

  return ProjectPaymentMethod.OTHER;
}

async function recomputeInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.projectInvoice.findFirst({ where: { id: invoiceId } });
  if (!invoice) return;

  if (invoice.status === ProjectInvoiceStatus.DRAFT || invoice.status === ProjectInvoiceStatus.VOID) {
    return;
  }

  const legacyAgg = await prisma.projectPayment.aggregate({
    where: { invoiceId, status: ProjectPaymentStatus.RECORDED },
    _sum: { amount: true },
  });
  const legacyPaid = legacyAgg._sum.amount ?? 0;

  // Payment applications (best effort; table may not exist yet)
  let appliedPaid = 0;
  try {
    const p: any = prisma as any;
    if (typeof p?.projectPaymentApplication?.aggregate === "function") {
      const appAgg = await p.projectPaymentApplication.aggregate({
        where: { invoiceId },
        _sum: { amount: true },
      });
      appliedPaid = appAgg?._sum?.amount ?? 0;
    }
  } catch {
    // ignore
  }

  const paidTotal = legacyPaid + appliedPaid;

  let nextStatus: ProjectInvoiceStatus = invoice.status;
  if (paidTotal >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
    nextStatus = ProjectInvoiceStatus.PAID;
  } else if (paidTotal > 0) {
    nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
  } else {
    nextStatus = ProjectInvoiceStatus.ISSUED;
  }

  if (nextStatus !== invoice.status) {
    await prisma.projectInvoice.update({ where: { id: invoiceId }, data: { status: nextStatus } });
  }
}

export async function importInvoicePaymentsFromCsv(options: {
  projectId: string;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  csvPath: string;
  dryRun?: boolean;
  asApplications?: boolean;
}) {
  const {
    projectId,
    invoiceId: invoiceIdArg,
    invoiceNo: invoiceNoArg,
    csvPath,
    dryRun = false,
    asApplications = true,
  } = options;

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csv = fs.readFileSync(csvPath, "utf8");
  const rawRows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as AnyRow[];
  const rows = rawRows.map(normalizeRow);

  const project = await prisma.project.findFirst({ where: { id: projectId } });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Resolve invoice target once (unless per-row invoice is provided).
  const resolveInvoice = async (row: AnyRow) => {
    const invId = String(row.invoice_id ?? row.project_invoice_id ?? invoiceIdArg ?? "").trim();
    const invNo = String(row.invoice_no ?? row.invoice ?? invoiceNoArg ?? "").trim();

    if (invId) {
      const inv = await prisma.projectInvoice.findFirst({ where: { id: invId, projectId } });
      if (!inv) throw new Error(`Invoice not found for project: invoiceId=${invId}`);
      return inv;
    }

    if (invNo) {
      const inv = await prisma.projectInvoice.findFirst({ where: { invoiceNo: invNo, projectId } });
      if (!inv) throw new Error(`Invoice not found for project: invoiceNo=${invNo}`);
      return inv;
    }

    throw new Error("Missing invoiceId/invoiceNo (pass args or include invoice_id/invoice_no columns)");
  };

  let created = 0;
  let skipped = 0;
  let updatedApps = 0;

  const touchedInvoiceIds = new Set<string>();

  for (const [idx, row] of rows.entries()) {
    const line = idx + 2;

    const amount =
      parseMoney(row.amount ?? row.payment_amount ?? row.paid_amount ?? row.total ?? row.value);

    const paidAt = parseDate(row.paid_at ?? row.paidat ?? row.date ?? row.payment_date);

    if (!amount || amount <= 0) {
      console.warn(`Line ${line}: missing/invalid amount; skipping`);
      skipped += 1;
      continue;
    }

    if (!paidAt) {
      console.warn(`Line ${line}: missing/invalid paid_at; skipping`);
      skipped += 1;
      continue;
    }

    const method = parseMethod(row.method ?? row.payment_method ?? row.type);
    const reference = String(row.reference ?? row.ref ?? row.check_no ?? row.check ?? "").trim() || null;
    const note = String(row.note ?? row.memo ?? row.description ?? "").trim() || null;

    const invoice = await resolveInvoice(row);

    if (invoice.companyId !== project.companyId) {
      throw new Error(`Line ${line}: invoice companyId mismatch (invoice.companyId=${invoice.companyId}, project.companyId=${project.companyId})`);
    }

    // Dedup heuristic: same paidAt + amount + method + reference + invoice target.
    const existing = await prisma.projectPayment.findFirst({
      where: {
        companyId: project.companyId,
        projectId,
        status: ProjectPaymentStatus.RECORDED,
        paidAt,
        amount,
        method,
        reference,
        ...(asApplications ? { invoiceId: null } : { invoiceId: invoice.id }),
      },
    });

    if (existing) {
      skipped += 1;
      if (asApplications) {
        const pAny: any = prisma as any;
        if (typeof pAny?.projectPaymentApplication?.upsert === "function") {
          if (!dryRun) {
            await pAny.projectPaymentApplication.upsert({
              where: { paymentId_invoiceId: { paymentId: existing.id, invoiceId: invoice.id } },
              create: {
                companyId: project.companyId,
                projectId,
                paymentId: existing.id,
                invoiceId: invoice.id,
                amount,
                appliedAt: new Date(),
                createdByUserId: null,
              },
              update: {
                // idempotent: set to the greater of existing and incoming
                amount: amount,
                appliedAt: new Date(),
              },
            });
          }
          updatedApps += 1;
        }
      }

      touchedInvoiceIds.add(invoice.id);
      continue;
    }

    if (!dryRun) {
      const payment = await prisma.projectPayment.create({
        data: {
          companyId: project.companyId,
          projectId,
          invoiceId: asApplications ? null : invoice.id,
          status: ProjectPaymentStatus.RECORDED,
          method,
          paidAt,
          amount,
          reference,
          note,
          createdByUserId: null,
        },
      });

      if (asApplications) {
        const pAny: any = prisma as any;
        if (typeof pAny?.projectPaymentApplication?.create === "function") {
          await pAny.projectPaymentApplication.create({
            data: {
              companyId: project.companyId,
              projectId,
              paymentId: payment.id,
              invoiceId: invoice.id,
              amount,
              appliedAt: new Date(),
              createdByUserId: null,
            },
          });
        } else {
          throw new Error(
            "ProjectPaymentApplication model is not available. Run prisma migrate/generate, or re-run with --legacy",
          );
        }
      }
    }

    touchedInvoiceIds.add(invoice.id);
    created += 1;
  }

  if (!dryRun) {
    for (const invId of touchedInvoiceIds) {
      await recomputeInvoiceStatus(invId);
    }
  }

  return {
    projectId,
    csvPath,
    dryRun,
    asApplications,
    parsedRows: rows.length,
    created,
    updatedApps,
    skipped,
    touchedInvoices: touchedInvoiceIds.size,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: ts-node src/scripts/import-invoice-payments-from-csv.ts <projectId> <invoiceId|invoiceNo> <csvPath> [--invoice-no] [--legacy] [--dry-run]",
    );
    process.exit(1);
  }

  const projectId = String(args[0] ?? "").trim();
  const invoiceKey = String(args[1] ?? "").trim();
  const csvPathArg = String(args[2] ?? "").trim();

  const repoRoot = path.resolve(__dirname, "../../../..");
  const csvPath = path.isAbsolute(csvPathArg) ? csvPathArg : path.resolve(repoRoot, csvPathArg);

  const invoiceNoMode = args.includes("--invoice-no");
  const legacy = args.includes("--legacy");
  const dryRun = args.includes("--dry-run");

  const result = await importInvoicePaymentsFromCsv({
    projectId,
    invoiceId: invoiceNoMode ? null : invoiceKey,
    invoiceNo: invoiceNoMode ? invoiceKey : null,
    csvPath,
    dryRun,
    asApplications: !legacy,
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
