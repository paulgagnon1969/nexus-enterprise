/**
 * bt-import.service.ts
 *
 * Orchestrator for Buildertrend → NCC migration.
 * Scans a BT export folder, parses all data, and creates NCC records.
 */

import { PrismaClient } from "@prisma/client";
import { scanBtFolder } from "./folder-scanner";
import { parseAllDailyLogPdfs } from "./parsers/daily-log-pdf.parser";
import { parseBillsCsv } from "./parsers/bills-csv.parser";
import { parseInvoiceXls } from "./parsers/invoice-xls.parser";
import type {
  BtImportConfig,
  BtImportResult,
  BtDailyLogEntry,
  BtBill,
  BtInvoice,
  BtFolderScanResult,
} from "./bt-import.types";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Normalize BT job name → a short project label. */
function jobNameToProjectLabel(jobName: string): string {
  // Strip common prefixes like "NEX - TAP - ", "SUN- "
  return jobName
    .replace(/^(NEX\s*-\s*TAP\s*-\s*|SUN-\s*)/i, "")
    .trim();
}

/** Map BT bill status to NCC ProjectBillStatus. */
function mapBillStatus(btStatus: string): "DRAFT" | "POSTED" | "PAID" {
  const s = btStatus.toLowerCase();
  if (s.includes("paid")) return "PAID";
  if (s.includes("ready") || s.includes("approved") || s.includes("posted")) return "POSTED";
  return "DRAFT";
}

// ── Main import function ────────────────────────────────────────────────

export async function runBtImport(
  prisma: PrismaClient,
  config: BtImportConfig,
): Promise<BtImportResult> {
  const result: BtImportResult = {
    projectGroupId: null,
    projects: [],
    counts: { dailyLogs: 0, bills: 0, invoices: 0, payments: 0, files: 0, filesDeduped: 0 },
    errors: [],
  };

  const log = (msg: string) => console.log(`[bt-import] ${msg}`);
  const warn = (msg: string) => {
    console.warn(`[bt-import] ⚠ ${msg}`);
    result.errors.push(msg);
  };

  // ── Step 1: Scan folder ───────────────────────────────────────────
  log(`Scanning: ${config.sourceDir}`);
  const scan = scanBtFolder(config.sourceDir, {
    includeParentMedia: config.includeParentMedia,
  });

  log(`Topology: ${scan.topology}`);
  log(`Job names: ${scan.jobNames.join(", ")}`);
  log(`Daily Log PDFs: ${scan.dailyLogPdfs.length}`);
  log(`Invoice XLS: ${scan.invoiceXlsPaths.length}`);
  log(`Bills CSV: ${scan.billsCsvPath ? "yes" : "no"}`);
  log(`ZIPs: ${scan.zipPaths.length}`);
  log(`Loose media: ${scan.looseMediaPaths.length}`);

  // ── Step 2: Parse all data ────────────────────────────────────────
  log("Parsing daily log PDFs...");
  const dailyLogEntries = await parseAllDailyLogPdfs(scan.dailyLogPdfs);
  log(`  → ${dailyLogEntries.length} daily log entries parsed`);

  let bills: BtBill[] = [];
  if (scan.billsCsvPath) {
    log("Parsing BT Bills CSV...");
    bills = parseBillsCsv(scan.billsCsvPath);
    log(`  → ${bills.length} bills parsed`);
  }

  let invoices: BtInvoice[] = [];
  for (const xlsPath of scan.invoiceXlsPaths) {
    log(`Parsing Invoice XLS: ${xlsPath}`);
    const parsed = parseInvoiceXls(xlsPath);
    invoices.push(...parsed);
  }
  log(`  → ${invoices.length} invoices parsed`);

  if (config.dryRun) {
    log("=== DRY RUN — no records will be created ===");
    printDryRunSummary(scan, dailyLogEntries, bills, invoices);
    result.counts.dailyLogs = dailyLogEntries.length;
    result.counts.bills = bills.length;
    result.counts.invoices = invoices.length;
    return result;
  }

  // ── Step 3: Create ProjectGroup ───────────────────────────────────
  const groupLabel = config.projectGroupLabel || deriveGroupLabel(scan, config.sourceDir);
  log(`Creating ProjectGroup: "${groupLabel}"`);

  const group = await prisma.projectGroup.create({
    data: {
      companyId: config.companyId,
      label: groupLabel,
      notes: `Imported from Buildertrend export. Source: ${config.sourceDir}`,
    },
  });
  result.projectGroupId = group.id;

  // ── Step 4: Create Projects ───────────────────────────────────────
  // Collect unique project names from daily logs + bills + invoices
  const allJobNames = new Set<string>();
  for (const e of dailyLogEntries) allJobNames.add(e.jobName);
  for (const b of bills) allJobNames.add(b.jobName);
  for (const inv of invoices) allJobNames.add(inv.jobName);

  // Deduplicate job names that are really the same project
  // (e.g., sub-phases like QP1, QP2 for the same site)
  const projectMap = new Map<string, string>(); // jobName → projectId
  const uniqueProjects = deduplicateToProjects([...allJobNames], scan.topology);

  for (const proj of uniqueProjects) {
    log(`Creating Project: "${proj.name}" (jobs: ${proj.btJobNames.join(", ")})`);

    const project = await prisma.project.create({
      data: {
        companyId: config.companyId,
        name: proj.name,
        status: "completed",
        addressLine1: "Imported from Buildertrend",
        city: "Unknown",
        state: "Unknown",
        groupId: group.id,
        externalId: `bt-import-${Date.now()}-${proj.name.slice(0, 20).replace(/\s/g, "-")}`,
      },
    });

    result.projects.push({ id: project.id, name: proj.name, btJobNames: proj.btJobNames });
    for (const jn of proj.btJobNames) {
      projectMap.set(jn, project.id);
    }
  }

  // ── Step 5: Import Daily Logs ─────────────────────────────────────
  log(`Importing ${dailyLogEntries.length} daily logs...`);
  let logCount = 0;
  for (const entry of dailyLogEntries) {
    const projectId = resolveProjectId(entry.jobName, projectMap);
    if (!projectId) {
      warn(`No project match for job: ${entry.jobName}`);
      continue;
    }

    const userId = config.authorMap[entry.addedBy] || config.fallbackUserId;

    try {
      await prisma.dailyLog.create({
        data: {
          projectId,
          createdById: userId,
          logDate: entry.logDate,
          title: entry.title,
          workPerformed: entry.logNotes || null,
          weatherJson: entry.weatherJson || undefined,
          tagsJson: entry.tags.length > 0 ? JSON.stringify(entry.tags) : null,
          status: "SUBMITTED",
          type: "PUDL",
          shareInternal: true,
        },
      });
      logCount++;
    } catch (err: any) {
      warn(`Failed to create daily log (${entry.dateRaw}): ${err.message}`);
    }
  }
  result.counts.dailyLogs = logCount;
  log(`  → ${logCount} daily logs created`);

  // ── Step 6: Import Bills ──────────────────────────────────────────
  log(`Importing ${bills.length} bills...`);
  let billCount = 0;
  for (const bill of bills) {
    const projectId = resolveProjectId(bill.jobName, projectMap);
    if (!projectId) {
      warn(`No project match for bill job: ${bill.jobName}`);
      continue;
    }

    try {
      await prisma.projectBill.create({
        data: {
          companyId: config.companyId,
          projectId,
          vendorName: bill.vendorName,
          billNumber: bill.billNumber,
          billDate: bill.createdDate || bill.invoiceDate || new Date(),
          dueAt: bill.dueDate,
          status: mapBillStatus(bill.status),
          memo: bill.billTitle,
          totalAmount: bill.totalAmount,
        },
      });
      billCount++;
    } catch (err: any) {
      warn(`Failed to create bill (${bill.billTitle}): ${err.message}`);
    }
  }
  result.counts.bills = billCount;
  log(`  → ${billCount} bills created`);

  // ── Step 7: Import Invoices ───────────────────────────────────────
  log(`Importing ${invoices.length} invoices...`);
  let invCount = 0;
  for (const inv of invoices) {
    const projectId = resolveProjectId(inv.jobName, projectMap);
    if (!projectId) {
      warn(`No project match for invoice job: ${inv.jobName}`);
      continue;
    }

    try {
      const invoice = await prisma.projectInvoice.create({
        data: {
          companyId: config.companyId,
          projectId,
          status: "ISSUED",
          category: "PETL",
          invoiceNo: inv.invoiceNumber,
          memo: inv.description,
          totalAmount: inv.amount,
          issuedAt: inv.date || new Date(),
        },
      });
      invCount++;
    } catch (err: any) {
      warn(`Failed to create invoice (${inv.invoiceNumber}): ${err.message}`);
    }
  }
  result.counts.invoices = invCount;
  log(`  → ${invCount} invoices created`);

  log("=== Import complete ===");
  log(`  Projects: ${result.projects.length}`);
  log(`  Daily Logs: ${result.counts.dailyLogs}`);
  log(`  Bills: ${result.counts.bills}`);
  log(`  Invoices: ${result.counts.invoices}`);
  if (result.errors.length > 0) {
    log(`  Errors: ${result.errors.length}`);
  }

  return result;
}

// ── Project deduplication ───────────────────────────────────────────────

interface ProjectDef {
  name: string;
  btJobNames: string[];
}

function deduplicateToProjects(
  jobNames: string[],
  topology: string,
): ProjectDef[] {
  if (topology === "single-job") {
    const name = jobNameToProjectLabel(jobNames[0] || "BT Import");
    return [{ name, btJobNames: jobNames }];
  }

  if (topology === "per-unit") {
    // For per-unit (like Points West), group all units under one project
    // Extract the base project name (everything before "Unit NN")
    const baseNames = new Set<string>();
    for (const jn of jobNames) {
      const base = jn.replace(/\s*unit\s*\d+\s*/i, "").replace(/\s*hoa\s*/i, "").trim();
      baseNames.add(jobNameToProjectLabel(base || jn));
    }
    // Use the most common base name
    const baseName = [...baseNames][0] || "BT Import";
    return [{ name: baseName, btJobNames: jobNames }];
  }

  // Multi-site: group by site code pattern
  // E.g., CBS jobs, CCT jobs, SR jobs
  const groups = new Map<string, string[]>();
  for (const jn of jobNames) {
    const label = jobNameToProjectLabel(jn);
    // Try to extract site code: first token after stripping prefix
    const siteCode = label.split(/\s*-\s*/)[0]?.trim() || label;
    if (!groups.has(siteCode)) groups.set(siteCode, []);
    groups.get(siteCode)!.push(jn);
  }

  return [...groups.entries()].map(([siteCode, btJobNames]) => ({
    name: jobNameToProjectLabel(btJobNames[0] || siteCode),
    btJobNames,
  }));
}

/** Resolve a BT job name to a project ID (fuzzy match). */
function resolveProjectId(
  jobName: string,
  projectMap: Map<string, string>,
): string | null {
  // Exact match
  if (projectMap.has(jobName)) return projectMap.get(jobName)!;

  // Fuzzy: find a project whose btJobNames include this one as a substring
  const lowerJob = jobName.toLowerCase();
  for (const [key, id] of projectMap) {
    if (lowerJob.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerJob)) {
      return id;
    }
  }

  // Last resort: first project
  const firstId = [...projectMap.values()][0];
  return firstId || null;
}

function deriveGroupLabel(scan: BtFolderScanResult, sourceDir: string): string {
  // Try to derive from the folder name
  const parts = sourceDir.split("/");
  const folder = parts[parts.length - 1] || parts[parts.length - 2] || "BT Import";
  return folder.replace(/buildertrend|bt\s*bu|files?/gi, "").trim() || "BT Import";
}

function printDryRunSummary(
  scan: BtFolderScanResult,
  dailyLogs: BtDailyLogEntry[],
  bills: BtBill[],
  invoices: BtInvoice[],
) {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║        DRY RUN SUMMARY                   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  console.log(`Topology: ${scan.topology}`);
  console.log(`Job names (${scan.jobNames.length}):`);
  for (const jn of scan.jobNames) console.log(`  • ${jn}`);

  console.log(`\nDaily Logs: ${dailyLogs.length} entries`);
  const byJob = new Map<string, number>();
  for (const e of dailyLogs) byJob.set(e.jobName, (byJob.get(e.jobName) || 0) + 1);
  for (const [job, count] of byJob) console.log(`  • ${job}: ${count}`);

  const authors = new Set(dailyLogs.map((e) => e.addedBy));
  console.log(`\nAuthors: ${[...authors].join(", ")}`);

  if (bills.length > 0) {
    console.log(`\nBills: ${bills.length}`);
    const totalBills = bills.reduce((s, b) => s + b.totalAmount, 0);
    console.log(`  Total: $${totalBills.toFixed(2)}`);
  }

  if (invoices.length > 0) {
    console.log(`\nInvoices: ${invoices.length}`);
    const totalInv = invoices.reduce((s, i) => s + i.amount, 0);
    console.log(`  Total: $${totalInv.toFixed(2)}`);
  }

  console.log(`\nFiles: ${scan.zipPaths.length} zips, ${scan.looseMediaPaths.length} loose media`);
  console.log("");
}
