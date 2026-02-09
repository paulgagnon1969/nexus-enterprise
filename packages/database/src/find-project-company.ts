import prisma from './client';

const projectId = 'cmjwjdojx000b01s68ew1wjjw';

async function findCompany() {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  
  if (!project) {
    console.log('❌ Project not found at all!');
  } else {
    console.log('✓ Project found!');
    console.log(`  Name: ${project.name}`);
    console.log(`  Company ID: ${project.companyId}`);
    console.log(`  Company Name: ${project.company?.name}`);
  }
  
  await prisma.$disconnect();
}

findCompany();
