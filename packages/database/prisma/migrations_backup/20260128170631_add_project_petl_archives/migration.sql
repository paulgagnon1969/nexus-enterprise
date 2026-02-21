-- CreateTable
CREATE TABLE "ProjectPetlArchive" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectFileId" TEXT NOT NULL,
    "sourceEstimateVersionId" TEXT NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "restoredEstimateVersionId" TEXT,
    "restoredByUserId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPetlArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPetlArchive_company_project_created_idx" ON "ProjectPetlArchive"("companyId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectPetlArchive_project_created_idx" ON "ProjectPetlArchive"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_sourceEstimateVersionId_fkey" FOREIGN KEY ("sourceEstimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_restoredEstimateVersionId_fkey" FOREIGN KEY ("restoredEstimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_restoredByUserId_fkey" FOREIGN KEY ("restoredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
