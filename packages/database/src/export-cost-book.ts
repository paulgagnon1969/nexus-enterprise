import prisma from './client';
import { createWriteStream } from 'fs';

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

async function exportCostBookToCsv() {
  console.log('Fetching all cost book items...');
  
  const items = await prisma.companyPriceListItem.findMany({
    include: {
      companyPriceList: {
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { companyPriceListId: 'asc' },
      { lineNo: 'asc' },
    ],
  });

  console.log(`Found ${items.length} cost book items`);

  const filename = `cost-book-export-${formatDate(new Date())}.csv`;
  const writeStream = createWriteStream(filename);

  // Write CSV header
  const headers = [
    'id',
    'companyId',
    'companyName',
    'priceListId',
    'priceListLabel',
    'priceListRevision',
    'lineNo',
    'groupCode',
    'groupDescription',
    'description',
    'cat',
    'sel',
    'unit',
    'unitPrice',
    'lastKnownUnitPrice',
    'coverage',
    'activity',
    'owner',
    'sourceVendor',
    'sourceDate',
    'lastPriceChangedAt',
    'lastPriceChangedByUserId',
    'lastPriceChangedSource',
    'createdAt',
    'updatedAt',
  ];

  writeStream.write(headers.join(',') + '\n');

  // Write data rows
  for (const item of items) {
    const row = [
      item.id,
      item.companyPriceList.companyId,
      escapeCSV(item.companyPriceList.company.name),
      item.companyPriceListId,
      escapeCSV(item.companyPriceList.label),
      item.companyPriceList.revision,
      item.lineNo ?? '',
      escapeCSV(item.groupCode ?? ''),
      escapeCSV(item.groupDescription ?? ''),
      escapeCSV(item.description ?? ''),
      escapeCSV(item.cat ?? ''),
      escapeCSV(item.sel ?? ''),
      escapeCSV(item.unit ?? ''),
      item.unitPrice ?? '',
      item.lastKnownUnitPrice ?? '',
      escapeCSV(item.coverage ?? ''),
      escapeCSV(item.activity ?? ''),
      escapeCSV(item.owner ?? ''),
      escapeCSV(item.sourceVendor ?? ''),
      item.sourceDate ? item.sourceDate.toISOString() : '',
      item.lastPriceChangedAt ? item.lastPriceChangedAt.toISOString() : '',
      item.lastPriceChangedByUserId ?? '',
      escapeCSV(item.lastPriceChangedSource ?? ''),
      item.createdAt.toISOString(),
      item.updatedAt.toISOString(),
    ];

    writeStream.write(row.join(',') + '\n');
  }

  writeStream.end();

  console.log(`✅ Export complete: ${filename}`);
  console.log(`Total items exported: ${items.length}`);

  await prisma.$disconnect();
}

function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';
  // Escape double quotes and wrap in quotes if contains comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

exportCostBookToCsv().catch((error) => {
  console.error('Error exporting cost book:', error);
  process.exit(1);
});
