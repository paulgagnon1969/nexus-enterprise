#!/usr/bin/env ts-node
/**
 * Delete company price lists to force re-seeding from updated Golden list.
 * Run with: npx ts-node src/reseed-company-costbook.ts
 */

import { prisma } from './index';

async function main() {
  console.log('Checking company price lists...\n');

  // Find all company price lists
  const companyLists = await prisma.companyPriceList.findMany({
    select: {
      id: true,
      companyId: true,
      label: true,
      _count: {
        select: { items: true }
      }
    }
  });

  console.log(`Found ${companyLists.length} company price list(s):\n`);
  
  for (const list of companyLists) {
    console.log(`  Company ${list.companyId}:`);
    console.log(`    List ID: ${list.id}`);
    console.log(`    Label: ${list.label}`);
    console.log(`    Items: ${list._count.items.toLocaleString()}`);
    console.log();
  }

  if (companyLists.length === 0) {
    console.log('No company price lists found.');
    await prisma.$disconnect();
    return;
  }

  console.log('Deleting company price lists to force re-seeding...\n');

  for (const list of companyLists) {
    // First, delete any related TenantPriceUpdateLog entries
    const deleteLogs = await prisma.tenantPriceUpdateLog.deleteMany({
      where: { companyPriceListId: list.id }
    });
    console.log(`  ✓ Deleted ${deleteLogs.count.toLocaleString()} update log entries`);

    // Delete items
    const deleteItems = await prisma.companyPriceListItem.deleteMany({
      where: { companyPriceListId: list.id }
    });
    console.log(`  ✓ Deleted ${deleteItems.count.toLocaleString()} items from ${list.id}`);

    // Delete the list
    await prisma.companyPriceList.delete({
      where: { id: list.id }
    });
    console.log(`  ✓ Deleted company price list ${list.id}\n`);
  }

  console.log('✅ Done! The next time a user accesses the cost book, it will re-seed from the Golden list with all 53,993 items.');
  console.log('   Watch the API logs for seeding progress.\n');
  
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
