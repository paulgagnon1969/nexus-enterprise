-- CreateEnum
CREATE TYPE "GoldenPriceUpdateSource" AS ENUM ('XACT_ESTIMATE', 'GOLDEN_PETL');

-- AlterTable
ALTER TABLE "GoldenPriceUpdateLog" ADD COLUMN     "source" "GoldenPriceUpdateSource" NOT NULL DEFAULT 'XACT_ESTIMATE',
ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "estimateVersionId" DROP NOT NULL;
