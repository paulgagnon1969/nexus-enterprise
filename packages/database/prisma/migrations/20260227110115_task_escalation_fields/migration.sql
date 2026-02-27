-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationTier" INTEGER NOT NULL DEFAULT 0;
