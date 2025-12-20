import { prisma } from './src/index';

(async () => {
  const evs = await prisma.estimateVersion.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(evs.map(e => ({
    id: e.id,
    fileName: e.fileName,
    storedPath: e.storedPath,
    createdAt: e.createdAt,
  })));
  process.exit(0);
})();