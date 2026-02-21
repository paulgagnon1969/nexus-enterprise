/*
  Warnings:

  - A unique constraint covering the columns `[companyId,code]` on the table `AssetMaintenanceTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AssetMaintenanceTemplate_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "AssetMaintenanceTemplate_companyId_code_key" ON "AssetMaintenanceTemplate"("companyId", "code");
