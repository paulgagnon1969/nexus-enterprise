import prisma from './client';

async function main() {
  const projectId = 'cmjwjdojx000b01s68ew1wjjw';
  
  console.log('=== Investigating PETL Items Issue ===\n');
  
  // Check estimate versions
  const versions = await prisma.estimateVersion.findMany({
    where: { projectId },
    orderBy: { sequenceNo: 'desc' },
    select: {
      id: true,
      sequenceNo: true,
      status: true,
      fileName: true,
      sourceType: true,
      importedAt: true,
      _count: {
        select: {
          sows: true,
        },
      },
    },
  });
  
  console.log(`Found ${versions.length} estimate version(s):\n`);
  
  for (const v of versions) {
    console.log(`Version ${v.sequenceNo}:`);
    console.log(`  ID: ${v.id}`);
    console.log(`  Status: ${v.status}`);
    console.log(`  Source: ${v.sourceType}`);
    console.log(`  File: ${v.fileName || 'N/A'}`);
    console.log(`  Imported: ${v.importedAt?.toISOString() || 'N/A'}`);
    console.log(`  SOWs: ${v._count.sows}`);
    
    // Count items for this version
    const itemCount = await prisma.sowItem.count({
      where: { estimateVersionId: v.id },
    });
    console.log(`  Items: ${itemCount}`);
    
    // Check if this version would be selected by getLatestEstimateVersionForPetl
    if (v.status === 'completed' && itemCount > 0) {
      console.log('  ✓ Would be selected (completed + has items)');
    } else if (itemCount > 0) {
      console.log('  ⚠ Has items but status is not "completed"');
    } else {
      console.log('  ✗ Would NOT be selected (no items)');
    }
    console.log('');
  }
  
  // Check what the getLatestEstimateVersionForPetl logic would return
  console.log('=== Testing getLatestEstimateVersionForPetl Logic ===\n');
  
  const latestCompleted = await prisma.estimateVersion.findFirst({
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
  
  if (latestCompleted) {
    console.log(`Latest completed version with items: ${latestCompleted.id} (seq ${latestCompleted.sequenceNo})`);
  } else {
    console.log('No completed version with items found');
    
    const latestAny = await prisma.estimateVersion.findFirst({
      where: {
        projectId,
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
    
    if (latestAny) {
      console.log(`Latest ANY version with items: ${latestAny.id} (seq ${latestAny.sequenceNo}, status: ${latestAny.status})`);
    } else {
      console.log('⚠ NO version with items found at all!');
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
