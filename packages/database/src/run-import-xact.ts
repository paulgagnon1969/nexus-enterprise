import path from "node:path";
import { importXactCsvForProject } from "./import-xact";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: ts-node src/run-import-xact.ts <projectId> <csvPath>");
    process.exit(1);
  }

  const projectId = String(args[0] ?? "");
  const csvPathArg = String(args[1] ?? "");

  const repoRoot = path.resolve(__dirname, "../../..");
  const csvPath = path.isAbsolute(csvPathArg)
    ? csvPathArg
    : path.resolve(repoRoot, csvPathArg);

  try {
    const result = await importXactCsvForProject({
      projectId,
      csvPath
    });
    console.log("Import complete:", result);
  } catch (err) {
    console.error("Import failed:", err);
    process.exit(1);
  }
}

main();
