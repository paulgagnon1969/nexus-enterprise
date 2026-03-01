-- CreateEnum
CREATE TYPE "NliDeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'SYNCING');

-- CreateEnum
CREATE TYPE "NliDevicePlatform" AS ENUM ('MACOS', 'WINDOWS', 'LINUX');

-- CreateEnum
CREATE TYPE "NliScannedFileStatus" AS ENUM ('DISCOVERED', 'QUEUED', 'PROCESSING', 'SYNCED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "NliSyncJobType" AS ENUM ('VIDEO_ASSESSMENT', 'FILE_UPLOAD', 'DOCUMENT_SCAN', 'PHOTO_CATALOG', 'BATCH_IMPORT');

-- CreateEnum
CREATE TYPE "NliSyncJobStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AssetScan" ADD COLUMN     "originalPhotoUrls" JSONB;

-- AlterTable
ALTER TABLE "VideoAssessment" ADD COLUMN     "nliDeviceId" TEXT,
ADD COLUMN     "nliScannedFileId" TEXT;

-- CreateTable
CREATE TABLE "NliDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" "NliDevicePlatform" NOT NULL,
    "osVersion" TEXT,
    "arch" TEXT,
    "appVersion" TEXT,
    "status" "NliDeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "ffmpegVersion" TEXT,
    "storageAvailableBytes" BIGINT,
    "storageTotalBytes" BIGINT,
    "installId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NliDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NliWatchFolder" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "label" TEXT,
    "autoProcessVideo" BOOLEAN NOT NULL DEFAULT true,
    "autoProcessPhoto" BOOLEAN NOT NULL DEFAULT false,
    "autoUploadDocs" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NliWatchFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NliScannedFile" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "watchFolderId" TEXT,
    "projectId" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "status" "NliScannedFileStatus" NOT NULL DEFAULT 'DISCOVERED',
    "errorMessage" TEXT,
    "videoAssessmentId" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NliScannedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NliSyncJob" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "NliSyncJobType" NOT NULL,
    "status" "NliSyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scannedFileId" TEXT,
    "payloadJson" JSONB,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdById" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NliSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NliDevice_installId_key" ON "NliDevice"("installId");

-- CreateIndex
CREATE INDEX "NliDevice_company_status_idx" ON "NliDevice"("companyId", "status");

-- CreateIndex
CREATE INDEX "NliDevice_company_user_idx" ON "NliDevice"("companyId", "userId");

-- CreateIndex
CREATE INDEX "NliWatchFolder_device_idx" ON "NliWatchFolder"("deviceId");

-- CreateIndex
CREATE INDEX "NliWatchFolder_company_active_idx" ON "NliWatchFolder"("companyId", "active");

-- CreateIndex
CREATE INDEX "NliScannedFile_company_status_idx" ON "NliScannedFile"("companyId", "status");

-- CreateIndex
CREATE INDEX "NliScannedFile_device_status_idx" ON "NliScannedFile"("deviceId", "status");

-- CreateIndex
CREATE INDEX "NliScannedFile_company_project_idx" ON "NliScannedFile"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "NliScannedFile_deviceId_fileHash_key" ON "NliScannedFile"("deviceId", "fileHash");

-- CreateIndex
CREATE INDEX "NliSyncJob_device_status_idx" ON "NliSyncJob"("deviceId", "status");

-- CreateIndex
CREATE INDEX "NliSyncJob_company_status_idx" ON "NliSyncJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "NliSyncJob_company_type_idx" ON "NliSyncJob"("companyId", "type");

-- CreateIndex
CREATE INDEX "VideoAssessment_nli_device_idx" ON "VideoAssessment"("nliDeviceId");

-- AddForeignKey
ALTER TABLE "VideoAssessment" ADD CONSTRAINT "VideoAssessment_nliDeviceId_fkey" FOREIGN KEY ("nliDeviceId") REFERENCES "NliDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessment" ADD CONSTRAINT "VideoAssessment_nliScannedFileId_fkey" FOREIGN KEY ("nliScannedFileId") REFERENCES "NliScannedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliDevice" ADD CONSTRAINT "NliDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliDevice" ADD CONSTRAINT "NliDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliWatchFolder" ADD CONSTRAINT "NliWatchFolder_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NliDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliWatchFolder" ADD CONSTRAINT "NliWatchFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliScannedFile" ADD CONSTRAINT "NliScannedFile_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NliDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliScannedFile" ADD CONSTRAINT "NliScannedFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliScannedFile" ADD CONSTRAINT "NliScannedFile_watchFolderId_fkey" FOREIGN KEY ("watchFolderId") REFERENCES "NliWatchFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliScannedFile" ADD CONSTRAINT "NliScannedFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliSyncJob" ADD CONSTRAINT "NliSyncJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NliDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliSyncJob" ADD CONSTRAINT "NliSyncJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliSyncJob" ADD CONSTRAINT "NliSyncJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliSyncJob" ADD CONSTRAINT "NliSyncJob_scannedFileId_fkey" FOREIGN KEY ("scannedFileId") REFERENCES "NliScannedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NliSyncJob" ADD CONSTRAINT "NliSyncJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
