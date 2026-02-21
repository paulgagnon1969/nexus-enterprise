-- Add NCC_SYSTEM_DEVELOPER to GlobalRole enum
ALTER TYPE "GlobalRole" ADD VALUE 'NCC_SYSTEM_DEVELOPER';

-- Add ownership and access control fields to Manual
ALTER TABLE "Manual" ADD COLUMN "ownerCompanyId" TEXT;
ALTER TABLE "Manual" ADD COLUMN "isNexusInternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Manual" ADD COLUMN "requiredGlobalRoles" "GlobalRole"[] DEFAULT ARRAY[]::"GlobalRole"[];

-- Add foreign key for ownerCompanyId
ALTER TABLE "Manual" ADD CONSTRAINT "Manual_ownerCompanyId_fkey" 
    FOREIGN KEY ("ownerCompanyId") REFERENCES "Company"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX "Manual_owner_idx" ON "Manual"("ownerCompanyId");
CREATE INDEX "Manual_nexus_internal_idx" ON "Manual"("isNexusInternal");
