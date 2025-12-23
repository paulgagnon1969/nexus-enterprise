import { importGoldenComponentsFromFile } from "./import-pricelist-components";

async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error("Usage: ts-node src/run-import-pricelist-components.ts <path-to-components-csv>");
    process.exit(1);
  }

  try {
    const result = await importGoldenComponentsFromFile(csvPath);
    console.log("Imported Golden components:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Error importing Golden components:", err?.message ?? err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in run-import-pricelist-components:", err);
  process.exit(1);
});
