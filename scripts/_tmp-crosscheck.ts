import * as path from "node:path";
require("dotenv").config({ path: path.resolve(__dirname, "../packages/database/.env") });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
const { PrismaClient } = require("@prisma/client") as any;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter }) as any;

const CHECKLIST = [
  "Soil Test","Boundary Survey","Land Clearing","Fill Dirt 8 Loads","Rough Plumbing","House Pad","Slab","Termit Pre-treat",
  "Pump Service","Block","Pump Lintels","Framing","Window Install","2nd Rough Plumbing","Rough HVAC","Door Installation","Roof","Soffit Install","Stucco","Stucco Grade","Septic Install",
  "Drywall","Cabinet Assembly","HVAC Trim","Plumbing Trim","Well Install","Mirros & Shelving","Bathroom Hardware","Shelving","Lighting",
  "DriveWay Pour","Final Grade","Fill Dirt - Truck #421","BPI Certified Testing","Sod installation","Tree Service","Painting","Flooring labor","Trim labor"
];

async function main() {
  const items = await prisma.companyPriceListItem.findMany({
    select: { cat: true, sel: true, activity: true, description: true, unit: true, unitPrice: true },
    take: 80000,
  });
  console.log("Total cost book items in DB:", items.length);

  // Deduplicate by cat+sel+activity+description for reporting
  type Row = typeof items[0];
  const dedup = (list: Row[]) => {
    const seen = new Set<string>();
    return list.filter(i => {
      const k = `${i.cat}|${i.sel}|${i.activity}|${i.description}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  for (const name of CHECKLIST) {
    const lower = name.toLowerCase().trim();
    const words = lower.split(/[\s\-&]+/).filter(w => w.length > 2);

    const exact = dedup(items.filter((i: any) => (i.description ?? "").toLowerCase().trim() === lower));

    const contains = dedup(items.filter((i: any) => {
      const d = (i.description ?? "").toLowerCase();
      return d !== lower && d.includes(lower);
    }));

    const wordMatches = dedup(items.filter((i: any) => {
      const d = (i.description ?? "").toLowerCase();
      if (d === lower || d.includes(lower)) return false;
      const matchCount = words.filter((w: string) => d.includes(w)).length;
      return matchCount >= Math.max(1, Math.ceil(words.length * 0.5));
    }));

    console.log(`\n=== ${name} ===`);

    if (exact.length > 0) {
      exact.forEach(i =>
        console.log(`  EXACT: [${i.cat} / ${i.sel}] ${i.activity} | ${i.description} (${i.unit} @ $${i.unitPrice})`));
    }

    if (contains.length > 0) {
      contains.slice(0, 6).forEach(i =>
        console.log(`  CONTAINS: [${i.cat} / ${i.sel}] ${i.description} (${i.unit} @ $${i.unitPrice})`));
      if (contains.length > 6) console.log(`  ... +${contains.length - 6} more`);
    }

    if (wordMatches.length > 0) {
      wordMatches.slice(0, 8).forEach(i =>
        console.log(`  CLOSE: [${i.cat} / ${i.sel}] ${i.description} (${i.unit} @ $${i.unitPrice})`));
      if (wordMatches.length > 8) console.log(`  ... +${wordMatches.length - 8} more close`);
    }

    if (exact.length === 0 && contains.length === 0 && wordMatches.length === 0) {
      console.log("  NO MATCHES");
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
