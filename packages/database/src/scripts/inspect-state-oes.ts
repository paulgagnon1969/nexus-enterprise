import { getMarketWageBands } from "../state-wages";

// Helper script to sanity-check imported state OES wage data.
//
// Usage examples (from repo root):
//
//   # AZ Carpenters (SOC 47-2031)
//   DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \
//     node node_modules/.bin/ts-node \
//     packages/database/src/scripts/inspect-state-oes.ts \
//     --state=AZ --soc=47-2031
//
//   # NM Carpenters (SOC 47-2031)
//   DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \
//     node node_modules/.bin/ts-node \
//     packages/database/src/scripts/inspect-state-oes.ts \
//     --state=NM --soc=47-2031
//
// Expected sample outputs (2024 snapshots as of Jan 2026):
//   AZ 47-2031 → hourlyMedian ≈ 26.22, hourlyMean ≈ 28.05
//   NM 47-2031 → hourlyMedian ≈ 25.00, hourlyMean ≈ 25.75
//
// You can also add --year=YYYY to force a specific snapshot year.

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (const part of argv.slice(2)) {
    const [key, value] = part.split("=");
    if (key && value) {
      args[key.replace(/^--/, "")] = value;
    }
  }
  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const stateCode = (args.state || args.stateCode || "").toUpperCase();
    const socCode = args.soc || args.socCode || "47-2031"; // default: Carpenters
    const year = args.year ? Number(args.year) : undefined;

    if (!stateCode) {
      throw new Error("--state=<STATE_CODE> is required (e.g. AZ, NM)");
    }

    const bands = await getMarketWageBands({ stateCode, socCode, year });
    if (!bands) {
      console.log(
        `No occupational wage data found for state=${stateCode}, soc=${socCode}, year=${
          year ?? "latest"
        }`,
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          stateCode: bands.stateCode,
          year: bands.year,
          socCode: bands.socCode,
          occupationName: bands.occupationName,
          hourlyMean: bands.hourlyMean,
          hourlyP10: bands.hourlyP10,
          hourlyP25: bands.hourlyP25,
          hourlyMedian: bands.hourlyMedian,
          hourlyP75: bands.hourlyP75,
          hourlyP90: bands.hourlyP90,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error("Error inspecting state OES wages:", err);
    process.exitCode = 1;
  }
}

void main();
