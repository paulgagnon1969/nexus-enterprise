-- CreateTable
CREATE TABLE "PetlReconciliationAttachment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "projectFileId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetlReconciliationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PetlReconAttachment_entry_idx" ON "PetlReconciliationAttachment"("entryId");

-- CreateIndex
CREATE INDEX "PetlReconAttachment_project_file_idx" ON "PetlReconciliationAttachment"("projectFileId");

-- AddForeignKey
ALTER TABLE "PetlReconciliationAttachment" ADD CONSTRAINT "PetlReconciliationAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PetlReconciliationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlReconciliationAttachment" ADD CONSTRAINT "PetlReconciliationAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
