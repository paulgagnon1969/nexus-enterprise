-- CreateEnum (if not exists)
DO $$ BEGIN CREATE TYPE "AssetAttachmentCategory" AS ENUM ('PHOTO','TITLE','INSURANCE','MANUAL','RECEIPT','DIAGNOSTIC','CONTRACT','WARRANTY','SCHEMATIC','OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: AssetDisposition
CREATE TABLE IF NOT EXISTS "AssetDisposition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetDisposition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetDisposition_company_code_key" ON "AssetDisposition"("companyId", "code");
CREATE INDEX IF NOT EXISTS "AssetDisposition_companyId_idx" ON "AssetDisposition"("companyId");
ALTER TABLE "AssetDisposition" ADD CONSTRAINT "AssetDisposition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AssetTag
CREATE TABLE IF NOT EXISTS "AssetTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetTag_company_label_key" ON "AssetTag"("companyId", "label");
CREATE INDEX IF NOT EXISTS "AssetTag_companyId_idx" ON "AssetTag"("companyId");
ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AssetTagAssignment
CREATE TABLE IF NOT EXISTS "AssetTagAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetTagAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetTagAssignment_asset_tag_key" ON "AssetTagAssignment"("assetId", "tagId");
CREATE INDEX IF NOT EXISTS "AssetTagAssignment_assetId_idx" ON "AssetTagAssignment"("assetId");
CREATE INDEX IF NOT EXISTS "AssetTagAssignment_tagId_idx" ON "AssetTagAssignment"("tagId");
ALTER TABLE "AssetTagAssignment" ADD CONSTRAINT "AssetTagAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTagAssignment" ADD CONSTRAINT "AssetTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AssetAttachment
CREATE TABLE IF NOT EXISTS "AssetAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "category" "AssetAttachmentCategory" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssetAttachment_company_asset_idx" ON "AssetAttachment"("companyId", "assetId");
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add rental offering and disposition fields to Asset
ALTER TABLE "Asset" ADD COLUMN     "availableForRent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rentalDailyRate" DECIMAL(12,4),
ADD COLUMN     "rentalNotes" TEXT,
ADD COLUMN     "offeredAt" TIMESTAMP(3),
ADD COLUMN     "offeredToCompanyId" TEXT,
ADD COLUMN     "dispositionId" TEXT;

-- CreateIndex
CREATE INDEX "Asset_companyId_dispositionId_idx" ON "Asset"("companyId", "dispositionId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "AssetDisposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
