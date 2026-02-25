-- AlterTable
ALTER TABLE "DrawingBomLine" ADD COLUMN     "aiSource" TEXT,
ADD COLUMN     "consensusCount" INTEGER NOT NULL DEFAULT 1;
