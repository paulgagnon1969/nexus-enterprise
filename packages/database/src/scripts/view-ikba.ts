import prisma from '../client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('📄 Fetching IKBA HTML...\n');

  // Get the tenant document
  const tenantDoc = await prisma.tenantPnpDocument.findFirst({
    where: {
      companyId: 'cmjr7o4zs000101s6z1rt1ssz', // Nexus System
      code: 'OPERATIONS-LOCAL-PRICE-EXTRAPOLATION',
    },
    include: {
      currentVersion: true,
    },
  });

  if (!tenantDoc || !tenantDoc.currentVersion) {
    console.error('❌ IKBA not found');
    return;
  }

  console.log(`✅ Found IKBA: ${tenantDoc.title}`);
  console.log(`   Status: ${tenantDoc.reviewStatus}`);
  console.log(`   Version: ${tenantDoc.currentVersion.versionNo}\n`);

  // Write HTML to file
  const outputPath = path.join(__dirname, '../../../../ikba-local-price-extrapolation.html');
  fs.writeFileSync(outputPath, tenantDoc.currentVersion.htmlContent);

  console.log(`📝 HTML saved to: ${outputPath}`);
  console.log(`\n🌐 Open it in your browser:`);
  console.log(`   open ${outputPath}\n`);

  await prisma.$disconnect();
}

main();
