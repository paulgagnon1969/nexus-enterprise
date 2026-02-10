/**
 * One-time migration script to copy existing PetlReconciliationEntry notes
 * to the parent SowItem.itemNote field so they're visible in the PETL UI.
 *
 * Usage:
 *   DATABASE_URL="..." npx ts-node src/migrate-recon-notes-to-item-note.ts [projectId] [--dry-run]
 *
 * If projectId is omitted, runs for ALL projects with reconciliation entries.
 */
import { prisma } from "./index";

async function migrateReconNotesToItemNote(options: {
  projectId?: string;
  dryRun?: boolean;
}) {
  const { projectId, dryRun = false } = options;

  console.log(`\n=== Migrate Reconciliation Notes to SowItem.itemNote ===`);
  console.log(`Project: ${projectId ?? "ALL"}`);
  console.log(`Dry run: ${dryRun}\n`);

  // Find all reconciliation entries that have notes (rcvAmount null = note-only entries)
  const entries = await prisma.petlReconciliationEntry.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      note: { not: null },
      parentSowItemId: { not: null },
    },
    select: {
      id: true,
      projectId: true,
      parentSowItemId: true,
      kind: true,
      note: true,
      rcvAmount: true,
    },
  });

  console.log(`Found ${entries.length} reconciliation entries with notes.\n`);

  // Group entries by parentSowItemId
  const entriesBySowItemId = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.parentSowItemId) continue;
    const arr = entriesBySowItemId.get(e.parentSowItemId) ?? [];
    arr.push(e);
    entriesBySowItemId.set(e.parentSowItemId, arr);
  }

  console.log(`Grouped into ${entriesBySowItemId.size} unique SowItems.\n`);

  let updated = 0;
  let skipped = 0;

  for (const [sowItemId, itemEntries] of entriesBySowItemId) {
    // Get the current sowItem
    const sowItem = await prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: { id: true, lineNo: true, itemNote: true, description: true },
    });

    if (!sowItem) {
      console.log(`  [SKIP] SowItem ${sowItemId} not found`);
      skipped += 1;
      continue;
    }

    // Build note string from entries
    const noteParts: string[] = [];
    for (const e of itemEntries) {
      if (!e.note) continue;

      // Prefix based on kind
      let prefix = "";
      if (e.kind === "REIMBURSE_OWNER") prefix = "[RO]";
      else if (e.kind === "CHANGE_ORDER_CLIENT_PAY") prefix = "[CO]";
      else if (e.kind === "NOTE_ONLY") prefix = "[Note]";
      else prefix = `[${e.kind}]`;

      noteParts.push(`${prefix} ${e.note}`);
    }

    if (noteParts.length === 0) {
      skipped += 1;
      continue;
    }

    const newNote = noteParts.join(" | ");
    const existingNote = sowItem.itemNote ?? "";

    // Skip if already present
    if (existingNote.includes(newNote)) {
      console.log(`  [SKIP] Line ${sowItem.lineNo}: note already present`);
      skipped += 1;
      continue;
    }

    const updatedNote = existingNote ? `${existingNote} | ${newNote}` : newNote;

    console.log(`  [UPDATE] Line ${sowItem.lineNo}: "${sowItem.description?.slice(0, 40)}..."`);
    console.log(`           Adding: "${newNote.slice(0, 80)}${newNote.length > 80 ? "..." : ""}"`);

    if (!dryRun) {
      await prisma.sowItem.update({
        where: { id: sowItemId },
        data: { itemNote: updatedNote },
      });
    }

    updated += 1;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Dry run: ${dryRun}`);

  return { updated, skipped, dryRun };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const projectId = args.find((a) => !a.startsWith("--")) ?? undefined;

  try {
    await migrateReconNotesToItemNote({ projectId, dryRun });
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
