-- AlterTable
ALTER TABLE "DevSession" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CamReadStatus" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "camId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamReadStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CamReadStatus_token_idx" ON "CamReadStatus"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "CamReadStatus_token_cam_uk" ON "CamReadStatus"("tokenId", "camId");

-- AddForeignKey
ALTER TABLE "CamReadStatus" ADD CONSTRAINT "CamReadStatus_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "DocumentShareToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
