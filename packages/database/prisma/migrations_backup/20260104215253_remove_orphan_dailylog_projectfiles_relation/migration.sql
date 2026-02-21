-- AlterTable
ALTER TABLE "DailyLogAttachment" ADD COLUMN     "projectFileId" TEXT;

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN     "projectFileId" TEXT;

-- CreateTable
CREATE TABLE "ProjectFileFolder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFileFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "storageUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFileFolder_company_project_idx" ON "ProjectFileFolder"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectFile_company_project_idx" ON "ProjectFile"("companyId", "projectId");

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileFolder" ADD CONSTRAINT "ProjectFileFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileFolder" ADD CONSTRAINT "ProjectFileFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileFolder" ADD CONSTRAINT "ProjectFileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectFileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ProjectFileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLogAttachment" ADD CONSTRAINT "DailyLogAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
