import { seedIKBAToTenant } from './seed-ikba-local-price-extrapolation';
import prisma from '../client';

async function main() {
  const companyId = 'cmjr7o4zs000101s6z1rt1ssz'; // Nexus System
  await seedIKBAToTenant(companyId);
  await prisma.$disconnect();
}

main();
