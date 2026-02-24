-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "orgTemplateId" TEXT;

-- AlterTable
ALTER TABLE "ProjectParticle" ADD COLUMN     "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrgTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vertical" TEXT,
    "isStock" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgTemplateNode" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "defaultPctComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultDurationDays" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTemplateNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgTemplate_company_active_idx" ON "OrgTemplate"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "OrgTemplateNode_template_parent_sort_idx" ON "OrgTemplateNode"("templateId", "parentNodeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgTemplateId_fkey" FOREIGN KEY ("orgTemplateId") REFERENCES "OrgTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTemplate" ADD CONSTRAINT "OrgTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTemplateNode" ADD CONSTRAINT "OrgTemplateNode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OrgTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTemplateNode" ADD CONSTRAINT "OrgTemplateNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "OrgTemplateNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
