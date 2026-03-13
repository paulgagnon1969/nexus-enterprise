-- AlterEnum
ALTER TYPE "ShareAccessType" ADD VALUE 'RESCIND';

-- AlterTable
ALTER TABLE "DocumentShareToken" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT;
