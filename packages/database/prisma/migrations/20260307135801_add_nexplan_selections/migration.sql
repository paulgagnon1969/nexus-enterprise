-- CreateEnum
CREATE TYPE "PlanningRoomStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanningRoomSourceType" AS ENUM ('MANUAL', 'ROOM_SCAN', 'PLAN_SHEET', 'PHOTO');

-- CreateEnum
CREATE TYPE "PlanningMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PlanningDeviceOrigin" AS ENUM ('WEB', 'MOBILE', 'DESKTOP');

-- CreateEnum
CREATE TYPE "VendorProductCategory" AS ENUM ('BASE', 'WALL', 'CORNER', 'VANITY', 'ACCESSORY', 'TRIM', 'APPLIANCE', 'TALL', 'SPECIALTY');

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'ORDERED', 'DELIVERED', 'INSTALLED', 'REJECTED');

-- CreateTable
CREATE TABLE "PlanningRoom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "floorPlanUrl" TEXT,
    "status" "PlanningRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" "PlanningRoomSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "pipelineStatus" JSONB,
    "aiReview" JSONB,
    "extractedDimensions" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "role" "PlanningMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "artifacts" JSONB,
    "deviceOrigin" "PlanningDeviceOrigin" NOT NULL DEFAULT 'WEB',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCatalog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "vendorName" TEXT NOT NULL,
    "productLine" TEXT NOT NULL,
    "vendorUrl" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProduct" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VendorProductCategory" NOT NULL,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "depth" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "productPageUrl" TEXT,
    "price" DOUBLE PRECISION,
    "priceDiscounted" DOUBLE PRECISION,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "vendorProductId" TEXT,
    "position" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "SelectionStatus" NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "customizations" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionSheet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "htmlContent" TEXT NOT NULL,
    "csvContent" TEXT,
    "documentId" TEXT,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectionSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningRoom_company_project_idx" ON "PlanningRoom"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "PlanningRoom_project_status_idx" ON "PlanningRoom"("projectId", "status");

-- CreateIndex
CREATE INDEX "PlanningRoom_source_idx" ON "PlanningRoom"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PlanningMessage_room_created_idx" ON "PlanningMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorCatalog_company_active_idx" ON "VendorCatalog"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "VendorProduct_catalog_category_idx" ON "VendorProduct"("catalogId", "category");

-- CreateIndex
CREATE INDEX "VendorProduct_catalog_active_idx" ON "VendorProduct"("catalogId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProduct_catalogId_sku_key" ON "VendorProduct"("catalogId", "sku");

-- CreateIndex
CREATE INDEX "Selection_company_project_idx" ON "Selection"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "Selection_room_position_idx" ON "Selection"("roomId", "position");

-- CreateIndex
CREATE INDEX "Selection_project_status_idx" ON "Selection"("projectId", "status");

-- CreateIndex
CREATE INDEX "SelectionSheet_company_project_idx" ON "SelectionSheet"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "SelectionSheet_room_version_idx" ON "SelectionSheet"("roomId", "version");

-- AddForeignKey
ALTER TABLE "PlanningRoom" ADD CONSTRAINT "PlanningRoom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRoom" ADD CONSTRAINT "PlanningRoom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRoom" ADD CONSTRAINT "PlanningRoom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningMessage" ADD CONSTRAINT "PlanningMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PlanningRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningMessage" ADD CONSTRAINT "PlanningMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCatalog" ADD CONSTRAINT "VendorCatalog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "VendorCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PlanningRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_vendorProductId_fkey" FOREIGN KEY ("vendorProductId") REFERENCES "VendorProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionSheet" ADD CONSTRAINT "SelectionSheet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionSheet" ADD CONSTRAINT "SelectionSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionSheet" ADD CONSTRAINT "SelectionSheet_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PlanningRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionSheet" ADD CONSTRAINT "SelectionSheet_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
