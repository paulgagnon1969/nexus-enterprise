#!/usr/bin/env ts-node
/**
 * Renumber existing Golden PETL items with sequential line numbers
 * after sorting by Cat → Sel → Activity → Description
 */

import { prisma } from './index';

async function renumberGoldenPetl() {
  console.log('[renumber] Starting Golden PETL renumbering...');

  // Find the active Golden price list
  const goldenPriceList = await prisma.priceList.findFirst({
    where: { kind: 'GOLDEN', isActive: true },
    orderBy: { revision: 'desc' },
  });

  if (!goldenPriceList) {
    console.log('[renumber] No active Golden price list found.');
    return;
  }

  console.log(`[renumber] Found Golden price list: ${goldenPriceList.label} (rev ${goldenPriceList.revision})`);

  // Fetch all items
  const items = await prisma.priceListItem.findMany({
    where: { priceListId: goldenPriceList.id },
    select: {
      id: true,
      cat: true,
      sel: true,
      activity: true,
      description: true,
      lineNo: true,
    },
  });

  console.log(`[renumber] Loaded ${items.length} items`);

  // Sort by Cat → Sel → Activity → Description
  items.sort((a, b) => {
    const catA = (a.cat ?? '').toUpperCase();
    const catB = (b.cat ?? '').toUpperCase();
    if (catA !== catB) return catA.localeCompare(catB);

    const selA = (a.sel ?? '').toUpperCase();
    const selB = (b.sel ?? '').toUpperCase();
    if (selA !== selB) return selA.localeCompare(selB);

    const actA = (a.activity ?? '').toUpperCase();
    const actB = (b.activity ?? '').toUpperCase();
    if (actA !== actB) return actA.localeCompare(actB);

    const descA = (a.description ?? '').toUpperCase();
    const descB = (b.description ?? '').toUpperCase();
    return descA.localeCompare(descB);
  });

  console.log('[renumber] Items sorted. Renumbering...');

  // Update line numbers in batches
  const batchSize = 500;
  let updated = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    await prisma.$transaction(
      batch.map((item, idx) => 
        prisma.priceListItem.update({
          where: { id: item.id },
          data: { lineNo: i + idx + 1 },
        })
      )
    );

    updated += batch.length;
    console.log(`[renumber] Updated ${updated}/${items.length} items...`);
  }

  console.log(`[renumber] ✓ Complete! Renumbered ${items.length} items sequentially (1-${items.length})`);
  console.log('[renumber] Items are now sorted by Cat → Sel → Activity → Description');
}

renumberGoldenPetl()
  .catch((err) => {
    console.error('[renumber] Error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
