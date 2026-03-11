-- CreateEnum
CREATE TYPE "ShareAccessType" AS ENUM ('VIEW', 'CNDA_ACCEPT', 'QUESTIONNAIRE_COMPLETE', 'CONTENT_VIEW', 'RETURN_VISIT');

-- AlterTable
ALTER TABLE "DocumentShareToken" ADD COLUMN     "cndaAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "cndaAcceptedIp" TEXT,
ADD COLUMN     "cndaAcceptedUa" TEXT,
ADD COLUMN     "questionnaireCompletedAt" TIMESTAMP(3),
ADD COLUMN     "questionnaireData" JSONB;

-- CreateTable
CREATE TABLE "DocumentShareAccessLog" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "accessType" "ShareAccessType" NOT NULL,
    "serialNumber" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShareAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocShareAccessLog_token_created_idx" ON "DocumentShareAccessLog"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "DocShareAccessLog_serial_idx" ON "DocumentShareAccessLog"("serialNumber");

-- CreateIndex
CREATE INDEX "DocShareAccessLog_type_idx" ON "DocumentShareAccessLog"("accessType");

-- AddForeignKey
ALTER TABLE "DocumentShareAccessLog" ADD CONSTRAINT "DocumentShareAccessLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "DocumentShareToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
