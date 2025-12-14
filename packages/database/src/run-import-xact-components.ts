import path from "node:path";
import { importXactComponentsCsvForEstimate } from "./import-xact-components";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: ts-node src/run-import-xact-components.ts <estimateVersionId> <csvPath>"
    );
    process.exit(1);
  }

  const estimateVersionId = String(args[0] ?? "");
  const csvPathArg = String(args[1] ?? "");

  const repoRoot = path.resolve(__dirname, "../../..");
  const csvPath = path.isAbsolute(csvPathArg)
    ? csvPathArg
    : path.resolve(repoRoot, csvPathArg);

  try {
    const result = await importXactComponentsCsvForEstimate({
      estimateVersionId,
      csvPath
    });
    console.log("Components import complete:", result);
  } catch (err) {
    console.error("Components import failed:", err);
    process.exit(1);
  }
}

main();
