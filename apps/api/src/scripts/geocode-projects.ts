/**
 * geocode-projects.ts
 *
 * Backfill script: geocodes all projects that don't have lat/lng using the
 * Mapbox Geocoding API, then updates the database records.
 *
 * Usage:
 *   npx ts-node src/scripts/geocode-projects.ts
 *
 * For production (via Cloud SQL proxy):
 *   source ~/.nexus-prod-env && \
 *     MAPBOX_ACCESS_TOKEN=$MAPBOX_ACCESS_TOKEN \
 *     /Users/pg/nexus-enterprise/scripts/prod-db-run-with-proxy.sh --allow-kill-port -- \
 *     npx ts-node /Users/pg/nexus-enterprise/apps/api/src/scripts/geocode-projects.ts
 *
 * Requires: DATABASE_URL, MAPBOX_ACCESS_TOKEN in env
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as path from "path";

// Load env from repo root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
// Also load API-level .env (overrides)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";
if (!MAPBOX_TOKEN) {
  console.error("❌ MAPBOX_ACCESS_TOKEN is not set. Aborting.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface GeoResult {
  latitude: number;
  longitude: number;
}

async function geocodeAddress(parts: string[]): Promise<GeoResult | null> {
  const query = encodeURIComponent(parts.filter(Boolean).join(", "));
  if (!query) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=address,place,postcode`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`  ⚠ Mapbox error (${res.status}): ${text.slice(0, 120)}`);
    return null;
  }

  const data = (await res.json()) as any;
  const feature = data?.features?.[0];
  if (!feature?.center || feature.center.length < 2) return null;

  const [longitude, latitude] = feature.center;
  return { latitude, longitude };
}

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      latitude: null,
    },
    select: {
      id: true,
      name: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n🔍 Found ${projects.length} project(s) without coordinates.\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of projects) {
    const parts = [p.addressLine1, p.city, p.state, p.postalCode, p.country].filter(Boolean) as string[];
    if (parts.length === 0) {
      console.log(`  ⏭ ${p.name} — no address fields, skipping`);
      skipped++;
      continue;
    }

    const result = await geocodeAddress(parts);
    if (!result) {
      console.log(`  ❌ ${p.name} — no geocode result for: ${parts.join(", ")}`);
      failed++;
      continue;
    }

    await prisma.project.update({
      where: { id: p.id },
      data: {
        latitude: result.latitude,
        longitude: result.longitude,
        geocodedAt: new Date(),
      },
    });

    console.log(`  ✅ ${p.name} → ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`);
    success++;

    // Respect Mapbox rate limits (600 req/min on free tier → ~100ms between requests)
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\n📊 Done: ${success} geocoded, ${failed} failed, ${skipped} skipped.\n`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
