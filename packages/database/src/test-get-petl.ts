import prisma from './client';

const projectId = 'cmjwjdojx000b01s68ew1wjjw';

async function testGetPetl() {
  console.log('=== Testing getPetlForProject Logic ===\n');
  
  try {
    // Step 1: Find latest estimate version
    console.log('1. Finding latest estimate version...');
    const latestVersion = await prisma.estimateVersion.findFirst({
      where: {
        projectId,
        status: 'completed',
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: 'desc' },
        { importedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    
    if (!latestVersion) {
      console.log('❌ No estimate version found');
      return;
    }
    
    console.log(`✓ Found version: ${latestVersion.id}`);
    
    // Step 2: Query SOW items
    console.log('\n2. Querying SOW items...');
    const items = await prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      orderBy: { lineNo: 'asc' },
      take: 5, // Just first 5 for testing
    });
    
    console.log(`✓ Found ${items.length} items (limited to 5 for test)`);
    
    // Step 3: Query reconciliation entries  
    console.log('\n3. Querying reconciliation entries...');
    const reconMonetary = await prisma.petlReconciliationEntry.findMany({
      where: {
        projectId,
        estimateVersionId: latestVersion.id,
        rcvAmount: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    
    console.log(`✓ Found ${reconMonetary.length} monetary recon entries`);
    
    const reconActivity = await prisma.petlReconciliationEntry.findMany({
      where: {
        projectId,
        estimateVersionId: latestVersion.id,
        parentSowItemId: { not: null },
      },
      distinct: ['parentSowItemId'],
      select: { parentSowItemId: true },
      take: 5,
    });
    
    console.log(`✓ Found ${reconActivity.length} activity recon entries`);
    
    console.log('\n✅ All queries succeeded!');
    console.log('\nThe issue is NOT with the database queries.');
    console.log('The problem must be in production Prisma client generation or API code.');
    
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGetPetl();
