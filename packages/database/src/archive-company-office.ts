import { prisma } from "./index";

// Simple archival script for CompanyOffice soft-deleted rows.
//
// Lifecycle for CompanyOffice rows:
// - Active:     deletedAt IS NULL
// - Soft-deleted but local: deletedAt IS NOT NULL and < 30 days ago
// - Archived:   moved to archive."CompanyOffice" and removed from main table
//
// This script is designed to be run as a batch job (e.g. via npm script or a
// scheduled worker). It moves rows in small batches so it can run regularly
// without locking the whole table.

const BATCH_SIZE = parseInt(process.env.COMPANY_OFFICE_ARCHIVE_BATCH_SIZE || "500", 10);
const RETENTION_DAYS = parseInt(process.env.COMPANY_OFFICE_ARCHIVE_RETENTION_DAYS || "30", 10);

async function archiveCompanyOfficesBatch(): Promise<number> {
  // We use a single transaction per batch so that inserts into the archive
  // table and deletes from the main table are atomic.
  return prisma.$transaction(async (tx) => {
    // 1) Select a batch of old soft-deleted rows.
    //
    // NOTE: FOR UPDATE SKIP LOCKED ensures that if multiple archival workers
    // ever run in parallel, they will not double-process the same rows.
    const oldOffices: Array<{ id: string }> = await tx.$queryRawUnsafe(
      `SELECT "id"
       FROM "CompanyOffice"
       WHERE "deletedAt" IS NOT NULL
         AND "deletedAt" < now() - INTERVAL '${RETENTION_DAYS} days'
       ORDER BY "deletedAt" ASC
       LIMIT ${BATCH_SIZE}
       FOR UPDATE SKIP LOCKED`,
    );

    if (!oldOffices.length) {
      return 0;
    }

    const ids = oldOffices.map((o) => o.id);

    // 2) Insert matching rows into the archive table.
    // We copy the full row so the archive schema stays a 1:1 mirror of
    // the live table at the time of archival.
    await tx.$executeRawUnsafe(
      `INSERT INTO archive."CompanyOffice" (
         SELECT * FROM "CompanyOffice"
         WHERE "id" = ANY($1::text[])
       )`,
      ids,
    );

    // 3) Delete them from the main table.
    await tx.companyOffice.deleteMany({
      where: { id: { in: ids } },
    });

    return ids.length;
  });
}

export async function runCompanyOfficeArchivalJob() {
  let total = 0;
  // Loop batches until we drain the current backlog or hit an optional limit.
  // This makes the script safe to run on a schedule: each invocation will
  // slowly chew through old rows without overwhelming the database.
  //
  // If you want a hard cap on total rows per run, set
  // COMPANY_OFFICE_ARCHIVE_MAX_PER_RUN in the environment.
  const maxPerRun = parseInt(process.env.COMPANY_OFFICE_ARCHIVE_MAX_PER_RUN || "0", 10) || Infinity;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (total >= maxPerRun) {
      break;
    }
    const remaining = maxPerRun === Infinity ? BATCH_SIZE : Math.max(0, maxPerRun - total);
    if (remaining === 0) break;

    const count = await archiveCompanyOfficesBatch();
    total += count;

    if (count === 0) {
      break;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Archived ${total} CompanyOffice rows (retention ${RETENTION_DAYS} days, batch size ${BATCH_SIZE}).`);
}

// Allow running this file directly via ts-node
if (require.main === module) {
  runCompanyOfficeArchivalJob()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("CompanyOffice archival job failed", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
