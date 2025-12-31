import { importBiaWorkers } from "./import-bia-workers";

async function main() {
  try {
    await importBiaWorkers();
    console.log("BIA workers import finished successfully.");
    process.exit(0);
  } catch (err) {
    console.error("BIA workers import failed:", err);
    process.exit(1);
  }
}

main();
