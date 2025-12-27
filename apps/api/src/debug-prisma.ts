import "reflect-metadata";
import { PrismaService } from "./infra/prisma/prisma.service";

async function main() {
  console.log("DEBUG DATABASE_URL =", process.env.DATABASE_URL);
  const prisma = new PrismaService();
  await prisma.$connect();
  console.log("PrismaService connected successfully");
  await prisma.$disconnect();
  console.log("PrismaService disconnected successfully");
}

main().catch((err) => {
  console.error("Error in debug-prisma:", err);
  process.exit(1);
});
