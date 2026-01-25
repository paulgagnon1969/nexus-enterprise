import path from "node:path";
import { importPetlNotesFromReconcileCsv } from "./import-petl-notes-from-reconcile";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: ts-node src/run-import-petl-notes.ts <projectId> <csvPath> [--dry-run]",
    );
    process.exit(1);
  }

  const projectId = String(args[0] ?? "");
  const csvPathArg = String(args[1] ?? "");
  const dryRun = args.includes("--dry-run");

  const repoRoot = path.resolve(__dirname, "../../..");
  const csvPath = path.isAbsolute(csvPathArg)
    ? csvPathArg
    : path.resolve(repoRoot, csvPathArg);

  try {
    const result = await importPetlNotesFromReconcileCsv({
      projectId,
      csvPath,
      dryRun,
    });

    // eslint-disable-next-line no-console
    console.log("Import complete:", result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Import failed:", err);
    process.exit(1);
  }
}

main();
