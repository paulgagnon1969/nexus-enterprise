-- CreateEnum
CREATE TYPE "PlacardStatus" AS ENUM ('ACTIVE', 'VOID', 'LOST');

-- CreateTable
CREATE TABLE "AssetPlacard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "status" "PlacardStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetPlacard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacardCounter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nextSerial" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlacardCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetPlacard_company_asset_idx" ON "AssetPlacard"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "AssetPlacard_company_status_idx" ON "AssetPlacard"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPlacard_company_code_key" ON "AssetPlacard"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PlacardCounter_companyId_key" ON "PlacardCounter"("companyId");

-- AddForeignKey
ALTER TABLE "AssetPlacard" ADD CONSTRAINT "AssetPlacard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPlacard" ADD CONSTRAINT "AssetPlacard_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPlacard" ADD CONSTRAINT "AssetPlacard_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPlacard" ADD CONSTRAINT "AssetPlacard_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacardCounter" ADD CONSTRAINT "PlacardCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
