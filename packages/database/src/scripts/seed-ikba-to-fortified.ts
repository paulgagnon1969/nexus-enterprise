import { seedIKBAToTenant } from './seed-ikba-local-price-extrapolation';
import prisma from '../client';

async function main() {
  const companyId = 'cmjr9okjz000401s6rdkbatvr'; // Nexus Fortified Structures, LLC
  await seedIKBAToTenant(companyId);
  await prisma.$disconnect();
}

main();
