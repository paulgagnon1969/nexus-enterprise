#!/usr/bin/env ts-node
import { prisma } from './index';

async function main() {
  // Check Golden price list
  const golden = await prisma.priceList.findFirst({
    where: { kind: 'GOLDEN', isActive: true },
    orderBy: { revision: 'desc' },
  });

  if (!golden) {
    console.log('No active Golden price list found');
    return;
  }

  const goldenCount = await prisma.priceListItem.count({
    where: { priceListId: golden.id }
  });

  console.log(`Golden Price List (${golden.label}):`);
  console.log(`  Revision: ${golden.revision}`);
  console.log(`  Items: ${goldenCount.toLocaleString()}`);
  console.log();

  // Check company price lists
  const companyLists = await prisma.companyPriceList.findMany({
    select: {
      id: true,
      companyId: true,
      label: true,
      _count: { select: { items: true } }
    }
  });

  console.log(`Company Price Lists: ${companyLists.length}`);
  for (const list of companyLists) {
    console.log(`  Company ${list.companyId}: ${list._count.items.toLocaleString()} items`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);