import prisma from './client';

async function check() {
  const result = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'PetlReconciliationEntry' 
    AND column_name IN ('isStandaloneChangeOrder', 'coSequenceNo', 'coSourceLineNo')
    ORDER BY column_name
  ` as any[];
  
  console.log('Change Order fields in PetlReconciliationEntry:');
  if (result.length === 0) {
    console.log('✗ NO CO fields found!');
    console.log('\nThis is likely the problem. The migration with CO fields has not been applied.');
  } else {
    result.forEach(r => console.log(`✓ ${r.column_name}`));
  }
  
  await prisma.$disconnect();
}

check();
