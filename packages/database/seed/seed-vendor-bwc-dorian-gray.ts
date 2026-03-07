/**
 * Seed script: BWC Dorian Gray cabinetry vendor catalog
 *
 * Creates a VendorCatalog for Builders Wholesale Club — Dorian Gray line
 * with ~60 SKUs covering base, wall, corner, vanity, and accessory cabinets.
 *
 * Usage:
 *   cd packages/database
 *   npx ts-node seed/seed-vendor-bwc-dorian-gray.ts
 */

import prisma from "../src/client";

interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  price: number;
  description: string;
}

const CATALOG_NAME = "BWC Dorian Gray";
const CATALOG_VENDOR = "Builders Wholesale Club";
const CATALOG_DESC = "Dorian Gray — shaker-style, soft-close, all-plywood construction. RTA (Ready-to-Assemble) cabinetry line.";

const PRODUCTS: ProductSeed[] = [
  // ── Base cabinets ──────────────────────────────────────────
  { sku: "DG-B09",  name: "Dorian Gray Base 9\"",       category: "BASE", width: 9,  height: 34.5, depth: 24, price: 149, description: "Single door base, 1 shelf" },
  { sku: "DG-B12",  name: "Dorian Gray Base 12\"",      category: "BASE", width: 12, height: 34.5, depth: 24, price: 169, description: "Single door base, 1 shelf" },
  { sku: "DG-B15",  name: "Dorian Gray Base 15\"",      category: "BASE", width: 15, height: 34.5, depth: 24, price: 189, description: "Single door base, 1 shelf" },
  { sku: "DG-B18",  name: "Dorian Gray Base 18\"",      category: "BASE", width: 18, height: 34.5, depth: 24, price: 209, description: "Single door base, 1 shelf" },
  { sku: "DG-B21",  name: "Dorian Gray Base 21\"",      category: "BASE", width: 21, height: 34.5, depth: 24, price: 229, description: "Single door base, 1 shelf" },
  { sku: "DG-B24",  name: "Dorian Gray Base 24\"",      category: "BASE", width: 24, height: 34.5, depth: 24, price: 249, description: "Double door base, 1 shelf" },
  { sku: "DG-B27",  name: "Dorian Gray Base 27\"",      category: "BASE", width: 27, height: 34.5, depth: 24, price: 269, description: "Double door base, 1 shelf" },
  { sku: "DG-B30",  name: "Dorian Gray Base 30\"",      category: "BASE", width: 30, height: 34.5, depth: 24, price: 289, description: "Double door base, 1 shelf" },
  { sku: "DG-B33",  name: "Dorian Gray Base 33\"",      category: "BASE", width: 33, height: 34.5, depth: 24, price: 309, description: "Double door base, 1 shelf" },
  { sku: "DG-B36",  name: "Dorian Gray Base 36\"",      category: "BASE", width: 36, height: 34.5, depth: 24, price: 329, description: "Double door base, 1 shelf" },
  { sku: "DG-BD12", name: "Dorian Gray Drawer Base 12\"",category: "BASE", width: 12, height: 34.5, depth: 24, price: 219, description: "3-drawer base" },
  { sku: "DG-BD15", name: "Dorian Gray Drawer Base 15\"",category: "BASE", width: 15, height: 34.5, depth: 24, price: 249, description: "3-drawer base" },
  { sku: "DG-BD18", name: "Dorian Gray Drawer Base 18\"",category: "BASE", width: 18, height: 34.5, depth: 24, price: 279, description: "3-drawer base" },
  { sku: "DG-BD24", name: "Dorian Gray Drawer Base 24\"",category: "BASE", width: 24, height: 34.5, depth: 24, price: 329, description: "4-drawer base" },
  { sku: "DG-BSB36",name: "Dorian Gray Sink Base 36\"",  category: "BASE", width: 36, height: 34.5, depth: 24, price: 299, description: "Sink base, false front, no shelf" },

  // ── Wall cabinets ──────────────────────────────────────────
  { sku: "DG-W0930",  name: "Dorian Gray Wall 9×30",     category: "WALL", width: 9,  height: 30, depth: 12, price: 119, description: "Single door wall, 2 shelves" },
  { sku: "DG-W0936",  name: "Dorian Gray Wall 9×36",     category: "WALL", width: 9,  height: 36, depth: 12, price: 139, description: "Single door wall, 2 shelves" },
  { sku: "DG-W0942",  name: "Dorian Gray Wall 9×42",     category: "WALL", width: 9,  height: 42, depth: 12, price: 159, description: "Single door wall, 3 shelves" },
  { sku: "DG-W1230",  name: "Dorian Gray Wall 12×30",    category: "WALL", width: 12, height: 30, depth: 12, price: 129, description: "Single door wall, 2 shelves" },
  { sku: "DG-W1236",  name: "Dorian Gray Wall 12×36",    category: "WALL", width: 12, height: 36, depth: 12, price: 149, description: "Single door wall, 2 shelves" },
  { sku: "DG-W1242",  name: "Dorian Gray Wall 12×42",    category: "WALL", width: 12, height: 42, depth: 12, price: 169, description: "Single door wall, 3 shelves" },
  { sku: "DG-W1530",  name: "Dorian Gray Wall 15×30",    category: "WALL", width: 15, height: 30, depth: 12, price: 139, description: "Single door wall, 2 shelves" },
  { sku: "DG-W1536",  name: "Dorian Gray Wall 15×36",    category: "WALL", width: 15, height: 36, depth: 12, price: 159, description: "Single door wall, 2 shelves" },
  { sku: "DG-W1830",  name: "Dorian Gray Wall 18×30",    category: "WALL", width: 18, height: 30, depth: 12, price: 149, description: "Single door wall, 2 shelves" },
  { sku: "DG-W1836",  name: "Dorian Gray Wall 18×36",    category: "WALL", width: 18, height: 36, depth: 12, price: 169, description: "Single door wall, 2 shelves" },
  { sku: "DG-W2430",  name: "Dorian Gray Wall 24×30",    category: "WALL", width: 24, height: 30, depth: 12, price: 179, description: "Double door wall, 2 shelves" },
  { sku: "DG-W2436",  name: "Dorian Gray Wall 24×36",    category: "WALL", width: 24, height: 36, depth: 12, price: 199, description: "Double door wall, 2 shelves" },
  { sku: "DG-W2442",  name: "Dorian Gray Wall 24×42",    category: "WALL", width: 24, height: 42, depth: 12, price: 219, description: "Double door wall, 3 shelves" },
  { sku: "DG-W3030",  name: "Dorian Gray Wall 30×30",    category: "WALL", width: 30, height: 30, depth: 12, price: 199, description: "Double door wall, 2 shelves" },
  { sku: "DG-W3036",  name: "Dorian Gray Wall 30×36",    category: "WALL", width: 30, height: 36, depth: 12, price: 219, description: "Double door wall, 2 shelves" },
  { sku: "DG-W3042",  name: "Dorian Gray Wall 30×42",    category: "WALL", width: 30, height: 42, depth: 12, price: 239, description: "Double door wall, 3 shelves" },
  { sku: "DG-W3630",  name: "Dorian Gray Wall 36×30",    category: "WALL", width: 36, height: 30, depth: 12, price: 219, description: "Double door wall, 2 shelves" },
  { sku: "DG-W3636",  name: "Dorian Gray Wall 36×36",    category: "WALL", width: 36, height: 36, depth: 12, price: 239, description: "Double door wall, 2 shelves" },
  { sku: "DG-W3642",  name: "Dorian Gray Wall 36×42",    category: "WALL", width: 36, height: 42, depth: 12, price: 269, description: "Double door wall, 3 shelves" },

  // ── Corner cabinets ────────────────────────────────────────
  { sku: "DG-BLS36", name: "Dorian Gray Blind Corner Base 36\"",  category: "CORNER", width: 36, height: 34.5, depth: 24, price: 349, description: "Blind corner base, left or right" },
  { sku: "DG-BLS42", name: "Dorian Gray Blind Corner Base 42\"",  category: "CORNER", width: 42, height: 34.5, depth: 24, price: 389, description: "Blind corner base, left or right" },
  { sku: "DG-WLS24", name: "Dorian Gray Blind Corner Wall 24×30", category: "CORNER", width: 24, height: 30, depth: 12, price: 229, description: "Blind corner wall, 2 shelves" },
  { sku: "DG-WLS24-36", name: "Dorian Gray Blind Corner Wall 24×36", category: "CORNER", width: 24, height: 36, depth: 12, price: 259, description: "Blind corner wall, 2 shelves" },
  { sku: "DG-LS36",  name: "Dorian Gray Lazy Susan Base 36\"",    category: "CORNER", width: 36, height: 34.5, depth: 36, price: 449, description: "Corner base with lazy susan, 2 rotating shelves" },
  { sku: "DG-DBC36", name: "Dorian Gray Diagonal Corner Wall 24×30", category: "CORNER", width: 24, height: 30, depth: 12, price: 269, description: "Diagonal corner wall cabinet" },

  // ── Vanity cabinets ────────────────────────────────────────
  { sku: "DG-V24",   name: "Dorian Gray Vanity 24\"",     category: "VANITY", width: 24, height: 34.5, depth: 21, price: 229, description: "Single door vanity, 1 shelf" },
  { sku: "DG-V30",   name: "Dorian Gray Vanity 30\"",     category: "VANITY", width: 30, height: 34.5, depth: 21, price: 269, description: "Double door vanity, 1 shelf" },
  { sku: "DG-V36",   name: "Dorian Gray Vanity 36\"",     category: "VANITY", width: 36, height: 34.5, depth: 21, price: 309, description: "Double door vanity, 1 shelf" },
  { sku: "DG-V48",   name: "Dorian Gray Vanity 48\"",     category: "VANITY", width: 48, height: 34.5, depth: 21, price: 389, description: "Double door vanity + 3 drawers" },
  { sku: "DG-V60",   name: "Dorian Gray Vanity 60\"",     category: "VANITY", width: 60, height: 34.5, depth: 21, price: 459, description: "Double vanity, 4 doors + 3 drawers" },
  { sku: "DG-VD12",  name: "Dorian Gray Vanity Drawer 12\"", category: "VANITY", width: 12, height: 34.5, depth: 21, price: 199, description: "3-drawer vanity" },
  { sku: "DG-VD15",  name: "Dorian Gray Vanity Drawer 15\"", category: "VANITY", width: 15, height: 34.5, depth: 21, price: 219, description: "3-drawer vanity" },

  // ── Accessories ────────────────────────────────────────────
  { sku: "DG-FH396",  name: "Dorian Gray Filler 3×96",          category: "ACCESSORY", width: 3,  height: 96,   depth: 0.75, price: 39,  description: "Base/tall filler strip" },
  { sku: "DG-FH330",  name: "Dorian Gray Filler 3×30",          category: "ACCESSORY", width: 3,  height: 30,   depth: 0.75, price: 29,  description: "Wall filler strip" },
  { sku: "DG-TKS8",   name: "Dorian Gray Toe Kick 96\"",       category: "ACCESSORY", width: 96, height: 4.5,  depth: 0.5,  price: 19,  description: "Finished toe kick, matches Dorian Gray" },
  { sku: "DG-SM8",    name: "Dorian Gray Scribe Molding 96\"",  category: "ACCESSORY", width: 96, height: 0.25, depth: 0.75, price: 22,  description: "Scribe molding for wall gaps" },
  { sku: "DG-CM8",    name: "Dorian Gray Crown Molding 96\"",   category: "ACCESSORY", width: 96, height: 2.75, depth: 2.75, price: 49,  description: "Crown molding for top of wall cabs" },
  { sku: "DG-LRM8",   name: "Dorian Gray Light Rail 96\"",     category: "ACCESSORY", width: 96, height: 1.5,  depth: 0.75, price: 35,  description: "Light rail under wall cabinets" },
  { sku: "DG-P36",    name: "Dorian Gray Pantry 24×84",         category: "ACCESSORY", width: 24, height: 84,   depth: 24,   price: 549, description: "Double door tall pantry, 4 adjustable shelves" },
  { sku: "DG-P36-96", name: "Dorian Gray Pantry 24×96",         category: "ACCESSORY", width: 24, height: 96,   depth: 24,   price: 599, description: "Double door tall pantry, 5 adjustable shelves" },
  { sku: "DG-REP",    name: "Dorian Gray Refrigerator Panel 24×96", category: "ACCESSORY", width: 24, height: 96, depth: 0.75, price: 89, description: "Finished panel for exposed refrigerator side" },
  { sku: "DG-DEP",    name: "Dorian Gray Dishwasher End Panel 24×34.5", category: "ACCESSORY", width: 24, height: 34.5, depth: 0.75, price: 69, description: "Finished panel for exposed dishwasher side" },
  { sku: "DG-DKS",    name: "Dorian Gray Desk Knee Space 30\"", category: "ACCESSORY", width: 30, height: 34.5, depth: 24, price: 159, description: "Open knee space for built-in desk" },
  { sku: "DG-WES30",  name: "Dorian Gray Wall End Shelf 30\"",  category: "ACCESSORY", width: 12, height: 30, depth: 12, price: 89, description: "Open end shelf, rounded front" },
];

async function main() {
  console.log(`Seeding BWC Dorian Gray catalog (${PRODUCTS.length} products)...`);

  // Upsert catalog
  const catalog = await prisma.vendorCatalog.upsert({
    where: { id: "bwc-dorian-gray" },
    update: {
      name: CATALOG_NAME,
      vendor: CATALOG_VENDOR,
      description: CATALOG_DESC,
      productCount: PRODUCTS.length,
    },
    create: {
      id: "bwc-dorian-gray",
      name: CATALOG_NAME,
      vendor: CATALOG_VENDOR,
      description: CATALOG_DESC,
      productCount: PRODUCTS.length,
    },
  });
  console.log(`  Catalog: ${catalog.id} (${catalog.name})`);

  // Upsert each product by SKU-based deterministic ID
  let created = 0;
  let updated = 0;
  for (const p of PRODUCTS) {
    const id = `bwc-dg-${p.sku.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const result = await prisma.vendorProduct.upsert({
      where: { id },
      update: {
        name: p.name,
        category: p.category,
        width: p.width,
        height: p.height,
        depth: p.depth,
        price: p.price,
        description: p.description,
      },
      create: {
        id,
        catalogId: catalog.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        width: p.width,
        height: p.height,
        depth: p.depth,
        price: p.price,
        description: p.description,
      },
    });
    // Prisma upsert doesn't tell us which path was taken, so just count
    created++;
  }

  console.log(`  Products upserted: ${created}`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
