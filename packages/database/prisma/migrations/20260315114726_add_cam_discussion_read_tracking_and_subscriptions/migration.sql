-- AlterTable
ALTER TABLE "CamDiscussionParticipant" ADD COLUMN     "lastReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CamSectionSubscription" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "camSection" TEXT NOT NULL,
    "notifyInstant" BOOLEAN NOT NULL DEFAULT true,
    "notifyDigest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CamSectionSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CamSectionSub_section_idx" ON "CamSectionSubscription"("camSection");

-- CreateIndex
CREATE UNIQUE INDEX "CamSectionSub_token_section_uk" ON "CamSectionSubscription"("tokenId", "camSection");

-- AddForeignKey
ALTER TABLE "CamSectionSubscription" ADD CONSTRAINT "CamSectionSubscription_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "DocumentShareToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
