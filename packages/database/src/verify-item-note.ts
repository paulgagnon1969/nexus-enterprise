import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking SowItem schema...');
  
  const columns = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'SowItem' 
    AND column_name IN ('itemNote', 'qtyFieldNotes')
    ORDER BY column_name
  `;
  
  console.log('Found columns:', JSON.stringify(columns, null, 2));
  
  if (columns.length === 0) {
    console.log('❌ No note columns found!');
  } else {
    console.log(`✅ Found ${columns.length} note column(s)`);
  }
  
  // Try to fetch one SowItem to verify Prisma can read it
  const item = await prisma.sowItem.findFirst({
    where: { estimateVersionId: 'cmkzppi92000001s64rk41szs' },
    select: { id: true, itemNote: true, lineNo: true },
  });
  
  console.log('Sample SowItem:', JSON.stringify(item, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);
