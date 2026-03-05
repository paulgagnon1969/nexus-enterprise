-- AlterTable
ALTER TABLE "ModuleCatalog" ADD COLUMN "camDocumentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ModuleCatalog_camDocumentId_key" ON "ModuleCatalog"("camDocumentId");

-- AddForeignKey
ALTER TABLE "ModuleCatalog" ADD CONSTRAINT "ModuleCatalog_camDocumentId_fkey" FOREIGN KEY ("camDocumentId") REFERENCES "SystemDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
