import { prisma } from "@repo/database";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: ts-node scripts/debug-import-job.ts <importJobId>");
    process.exit(1);
  }

  try {
    const job = await prisma.importJob.findUnique({ where: { id } });
    if (!job) {
      console.error(`No ImportJob found with id ${id}`);
      process.exit(1);
    }

    // Print a focused view of the job for debugging Golden PETL issues.
    const output = {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.message,
      companyId: job.companyId,
      projectId: job.projectId,
      csvPath: job.csvPath,
      fileUri: job.fileUri,
      errorJson: job.errorJson,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error("Error querying ImportJob:", err);
    process.exit(1);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

main().catch((err) => {
  console.error("Fatal error in debug-import-job:", err);
  process.exit(1);
});
