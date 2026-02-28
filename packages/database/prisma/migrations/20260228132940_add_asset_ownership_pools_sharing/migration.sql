-- CreateEnum
CREATE TYPE "AssetOwnershipType" AS ENUM ('COMPANY', 'PERSONAL');

-- CreateEnum
CREATE TYPE "AssetSharingVisibility" AS ENUM ('PRIVATE', 'COMPANY', 'CUSTOM');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "maintenanceAssigneeId" TEXT,
ADD COLUMN     "maintenancePoolId" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownershipType" "AssetOwnershipType" NOT NULL DEFAULT 'COMPANY',
ADD COLUMN     "sharingVisibility" "AssetSharingVisibility" NOT NULL DEFAULT 'COMPANY';

-- CreateTable
CREATE TABLE "MaintenancePool" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePoolMember" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenancePoolMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetShareGrant" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "grantedToUserId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetShareGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenancePool_companyId_idx" ON "MaintenancePool"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePool_companyId_name_key" ON "MaintenancePool"("companyId", "name");

-- CreateIndex
CREATE INDEX "MaintenancePoolMember_userId_idx" ON "MaintenancePoolMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePoolMember_poolId_userId_key" ON "MaintenancePoolMember"("poolId", "userId");

-- CreateIndex
CREATE INDEX "AssetShareGrant_grantedToUserId_idx" ON "AssetShareGrant"("grantedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetShareGrant_assetId_grantedToUserId_key" ON "AssetShareGrant"("assetId", "grantedToUserId");

-- CreateIndex
CREATE INDEX "Asset_ownerId_idx" ON "Asset"("ownerId");

-- CreateIndex
CREATE INDEX "Asset_maintenancePoolId_idx" ON "Asset"("maintenancePoolId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_maintenanceAssigneeId_fkey" FOREIGN KEY ("maintenanceAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_maintenancePoolId_fkey" FOREIGN KEY ("maintenancePoolId") REFERENCES "MaintenancePool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePool" ADD CONSTRAINT "MaintenancePool_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePoolMember" ADD CONSTRAINT "MaintenancePoolMember_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "MaintenancePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePoolMember" ADD CONSTRAINT "MaintenancePoolMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetShareGrant" ADD CONSTRAINT "AssetShareGrant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetShareGrant" ADD CONSTRAINT "AssetShareGrant_grantedToUserId_fkey" FOREIGN KEY ("grantedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetShareGrant" ADD CONSTRAINT "AssetShareGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
