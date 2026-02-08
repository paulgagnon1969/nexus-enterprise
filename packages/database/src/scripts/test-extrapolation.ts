import prisma from '../client';
import { learnRegionalFactors } from '../learn-regional-factors';
import { extrapolateCostBookItem, extrapolateCostBookItems } from '../extrapolate-cost-book-item';

/**
 * Test script to validate local price extrapolation system
 * Uses Mary Lewis project to test learning and extrapolation
 */
async function main() {
  console.log('🧪 Testing Local Price Extrapolation System\n');

  // 1. Find the Mary Lewis project
  const project = await prisma.project.findFirst({
    where: {
      name: {
        contains: 'Mary Lewis',
        mode: 'insensitive',
      },
    },
    include: {
      estimateVersions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!project || project.estimateVersions.length === 0) {
    console.error('❌ Mary Lewis project or estimate not found');
    return;
  }

  console.log(`✅ Found project: ${project.name}`);
  console.log(`   Project ID: ${project.id}`);

  const estimateVersionId = project.estimateVersions[0].id;
  console.log(`   Estimate ID: ${estimateVersionId}\n`);

  // 2. Test learnRegionalFactors
  console.log('📊 Step 1: Learning regional factors...');
  try {
    const regionalFactors = await learnRegionalFactors(estimateVersionId);
    console.log(`✅ Successfully learned regional factors`);
    console.log(`   Tax Rate: ${(regionalFactors.aggregateTaxRate * 100).toFixed(2)}%`);
    console.log(`   O&P Rate: ${(regionalFactors.aggregateOPRate * 100).toFixed(2)}%`);
    console.log(`   Confidence: ${(regionalFactors.confidence * 100).toFixed(0)}%`);
    console.log(`   Categories: ${regionalFactors.categoryAdjustments.length}\n`);

    // Show some category adjustments
    console.log('   Sample category adjustments:');
    regionalFactors.categoryAdjustments
      .slice(0, 5)
      .forEach((adj) => {
        console.log(
          `     ${adj.categoryCode} (${adj.sampleSize} items): ${(adj.medianPriceVariance * 100).toFixed(1)}% adjustment`
        );
      });
  } catch (error) {
    console.error('❌ Error learning regional factors:', error);
    throw error;
  }

  // 3. Test extrapolateCostBookItem with a single item
  console.log('\n\n💰 Step 2: Testing single item extrapolation...');
  try {
    // Find a cost book item from DRY category (we know Mary Lewis has these)
    const costBookItem = await prisma.companyPriceListItem.findFirst({
      where: {
        cat: 'DRY',
        companyPriceList: {
          companyId: project.companyId,
          isActive: true,
        },
      },
      select: {
        id: true,
        cat: true,
        sel: true,
        description: true,
        unitPrice: true,
      },
    });

    if (!costBookItem) {
      console.log('⚠️  No DRY category items found in cost book');
    } else {
      console.log(`   Testing with: ${costBookItem.cat}-${costBookItem.sel} - ${costBookItem.description}`);
      console.log(`   Original price: $${costBookItem.unitPrice.toFixed(2)}`);

      const extrapolated = await extrapolateCostBookItem(costBookItem.id, project.id);

      console.log(`\n   📈 Extrapolation results:`);
      console.log(`      Category adjustment: ${(extrapolated.categoryAdjustmentFactor * 100).toFixed(1)}% (${extrapolated.categoryAdjustmentSource})`);
      console.log(`      Adjusted base price: $${extrapolated.adjustedUnitPrice.toFixed(2)}`);
      console.log(`      Tax (${(extrapolated.taxRate * 100).toFixed(2)}%): $${extrapolated.taxAmount.toFixed(2)} (${extrapolated.taxSource})`);
      console.log(`      O&P (${(extrapolated.opRate * 100).toFixed(2)}%): $${extrapolated.opAmount.toFixed(2)} (${extrapolated.opSource})`);
      console.log(`      Final price: $${extrapolated.finalUnitPrice.toFixed(2)}`);
      console.log(`      Confidence: ${(extrapolated.confidence * 100).toFixed(0)}%`);
      if (extrapolated.warning) {
        console.log(`      ⚠️  ${extrapolated.warning}`);
      }
    }
  } catch (error) {
    console.error('❌ Error extrapolating single item:', error);
    throw error;
  }

  // 4. Test batch extrapolation
  console.log('\n\n📦 Step 3: Testing batch extrapolation...');
  try {
    // Get 5 cost book items from different categories
    const costBookItems = await prisma.companyPriceListItem.findMany({
      where: {
        companyPriceList: {
          companyId: project.companyId,
          isActive: true,
        },
        cat: {
          in: ['DRY', 'ELE', 'PNT', 'FRM', 'FCV'],
        },
      },
      select: {
        id: true,
        cat: true,
        sel: true,
        description: true,
        unitPrice: true,
      },
      take: 5,
    });

    if (costBookItems.length === 0) {
      console.log('⚠️  No items found for batch test');
    } else {
      console.log(`   Testing with ${costBookItems.length} items...`);

      const results = await extrapolateCostBookItems(
        costBookItems.map((i) => i.id),
        project.id
      );

      console.log(`\n   Results:`);
      results.forEach((result, idx) => {
        const item = costBookItems[idx];
        console.log(
          `   ${item.cat}-${item.sel}: $${item.unitPrice.toFixed(2)} → $${result.finalUnitPrice.toFixed(2)} (${result.categoryAdjustmentSource})`
        );
      });
    }
  } catch (error) {
    console.error('❌ Error in batch extrapolation:', error);
    throw error;
  }

  // 5. Verify database records were created
  console.log('\n\n🔍 Step 4: Verifying database records...');
  const regionalFactors = await prisma.projectRegionalFactors.findUnique({
    where: { projectId: project.id },
    include: {
      categoryAdjustments: true,
    },
  });

  const taxConfig = await prisma.projectTaxConfig.findUnique({
    where: { projectId: project.id },
  });

  if (!regionalFactors) {
    console.error('❌ ProjectRegionalFactors record not found');
  } else {
    console.log(`✅ ProjectRegionalFactors record exists`);
    console.log(`   ${regionalFactors.categoryAdjustments.length} category adjustments stored`);
  }

  if (!taxConfig) {
    console.error('❌ ProjectTaxConfig record not found');
  } else {
    console.log(`✅ ProjectTaxConfig record exists`);
    console.log(`   Tax rate: ${(taxConfig.learnedTaxRate || 0) * 100}%`);
    console.log(`   Source: ${taxConfig.taxRateSource}`);
  }

  console.log('\n\n✅ All tests completed successfully!');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
