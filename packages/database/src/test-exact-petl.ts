import prisma from './client';

const projectId = 'cmjwjdojx000b01s68ew1wjjw';
const companyId = 'cmjr9okjz000401s6rdkbatv';

async function testExactPetl() {
  console.log('=== Testing EXACT getPetlForProject Implementation ===\n');
  
  try {
    console.log('Step 1: Find project...');
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId }
    });
    
    if (!project) {
      console.log('❌ Project not found');
      return;
    }
    console.log('✓ Project found');
    
    console.log('\nStep 2: Get latest estimate version...');
    let latestVersion = await prisma.estimateVersion.findFirst({
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
      console.log('No completed version, trying fallback...');
      latestVersion = await prisma.estimateVersion.findFirst({
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
    }
    
    if (!latestVersion) {
      console.log('❌ No estimate version with items found');
      return {
        projectId,
        estimateVersionId: null,
        items: [],
        reconciliationEntries: [],
      };
    }
    
    console.log(`✓ Estimate version: ${latestVersion.id}`);
    
    console.log('\nStep 3: Query SOW items...');
    const itemsRaw = await prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      orderBy: { lineNo: 'asc' },
    });
    console.log(`✓ Found ${itemsRaw.length} SOW items`);
    
    console.log('\nStep 4: Query reconciliation entries...');
    let reconciliationEntriesRaw: any[] = [];
    let reconciliationActivitySowItemIds: string[] = [];
    
    try {
      const [reconMonetary, reconActivity] = await Promise.all([
        prisma.petlReconciliationEntry.findMany({
          where: {
            projectId,
            estimateVersionId: latestVersion.id,
            rcvAmount: { not: null },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.petlReconciliationEntry.findMany({
          where: {
            projectId,
            estimateVersionId: latestVersion.id,
            parentSowItemId: { not: null },
          },
          distinct: ['parentSowItemId'],
          select: { parentSowItemId: true },
        }),
      ]);
      
      reconciliationEntriesRaw = reconMonetary;
      reconciliationActivitySowItemIds = reconActivity
        .map((r: any) => r.parentSowItemId)
        .filter((v: any): v is string => typeof v === 'string' && v.length > 0);
      
      console.log(`✓ Found ${reconMonetary.length} monetary recon entries`);
      console.log(`✓ Found ${reconciliationActivitySowItemIds.length} activity IDs`);
    } catch (err: any) {
      console.error('⚠️  Reconciliation query failed:', err.message);
    }
    
    console.log('\nStep 5: Resolve project particles...');
    const particleIds = [
      ...itemsRaw.map((i) => i.projectParticleId),
      ...reconciliationEntriesRaw.map((e) => e.projectParticleId),
    ];
    
    const ids = Array.from(new Set(particleIds.filter(Boolean)));
    console.log(`Processing ${ids.length} unique particle IDs...`);
    
    let particleById = new Map<string, any>();
    
    if (ids.length > 0) {
      const particles = await prisma.projectParticle.findMany({
        where: {
          id: { in: ids },
          projectId,
        },
        select: {
          id: true,
          name: true,
          fullLabel: true,
          externalGroupCode: true,
        },
      });
      
      for (const p of particles) {
        particleById.set(p.id, {
          id: p.id,
          name: p.name,
          fullLabel: p.fullLabel,
          externalGroupCode: (p as any).externalGroupCode ?? null,
        });
      }
      console.log(`✓ Resolved ${particles.length} particles`);
    }
    
    console.log('\nStep 6: Map items with particles...');
    const items = itemsRaw.map((i) => ({
      ...i,
      projectParticle: particleById.get(i.projectParticleId) ?? null,
    }));
    
    const reconciliationEntries = reconciliationEntriesRaw.map((e) => ({
      ...e,
      projectParticle: particleById.get(e.projectParticleId) ?? null,
    }));
    
    console.log('\n✅ SUCCESS! All steps completed');
    console.log(`\nReturning:`);
    console.log(`  - projectId: ${projectId}`);
    console.log(`  - estimateVersionId: ${latestVersion.id}`);
    console.log(`  - items: ${items.length}`);
    console.log(`  - reconciliationEntries: ${reconciliationEntries.length}`);
    console.log(`  - reconciliationActivitySowItemIds: ${reconciliationActivitySowItemIds.length}`);
    
    console.log('\n🎯 This should be EXACTLY what production returns!');
    console.log('If this works but production fails, the issue is in the API container itself.');
    
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack:', error.stack);
    console.error('\nThis is the error production is likely hitting!');
  } finally {
    await prisma.$disconnect();
  }
}

testExactPetl();
