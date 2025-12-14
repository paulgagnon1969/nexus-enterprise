import { allocateComponentsForEstimate } from "./allocate-xact-components";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: ts-node src/run-allocate-xact-components.ts <estimateVersionId>"
    );
    process.exit(1);
  }

  const estimateVersionId = String(args[0] ?? "");

  try {
    const result = await allocateComponentsForEstimate({ estimateVersionId });
    console.log("Component allocation complete:", result);
  } catch (err) {
    console.error("Component allocation failed:", err);
    process.exit(1);
  }
}

main();
