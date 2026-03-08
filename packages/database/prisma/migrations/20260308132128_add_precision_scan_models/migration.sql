-- CreateEnum
CREATE TYPE "PrecisionScanStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'RECONSTRUCTING', 'CONVERTING', 'ANALYZING', 'UPLOADING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "PrecisionScan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT,
    "status" "PrecisionScanStatus" NOT NULL DEFAULT 'PENDING',
    "meshJobId" TEXT,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "detailLevel" TEXT NOT NULL DEFAULT 'full',
    "usdzUrl" TEXT,
    "objUrl" TEXT,
    "daeUrl" TEXT,
    "stlUrl" TEXT,
    "gltfUrl" TEXT,
    "glbUrl" TEXT,
    "stepUrl" TEXT,
    "skpUrl" TEXT,
    "analysis" JSONB,
    "error" TEXT,
    "processingMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrecisionScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecisionScanImage" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/heic',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecisionScanImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrecisionScan_company_status_idx" ON "PrecisionScan"("companyId", "status");

-- CreateIndex
CREATE INDEX "PrecisionScan_project_idx" ON "PrecisionScan"("projectId");

-- CreateIndex
CREATE INDEX "PrecisionScan_created_idx" ON "PrecisionScan"("createdById");

-- CreateIndex
CREATE INDEX "PrecisionScanImage_scan_idx" ON "PrecisionScanImage"("scanId");

-- AddForeignKey
ALTER TABLE "PrecisionScan" ADD CONSTRAINT "PrecisionScan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecisionScan" ADD CONSTRAINT "PrecisionScan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecisionScan" ADD CONSTRAINT "PrecisionScan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecisionScanImage" ADD CONSTRAINT "PrecisionScanImage_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "PrecisionScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
