-- CreateTable
CREATE TABLE "SystemTag" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySystemTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "systemTagId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySystemTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemTag_code_key" ON "SystemTag"("code");

-- CreateIndex
CREATE INDEX "SystemTag_category_idx" ON "SystemTag"("category");

-- CreateIndex
CREATE INDEX "SystemTag_active_idx" ON "SystemTag"("active");

-- CreateIndex
CREATE INDEX "CompanySystemTag_company_idx" ON "CompanySystemTag"("companyId");

-- CreateIndex
CREATE INDEX "CompanySystemTag_tag_idx" ON "CompanySystemTag"("systemTagId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySystemTag_company_tag_key" ON "CompanySystemTag"("companyId", "systemTagId");

-- AddForeignKey
ALTER TABLE "SystemTag" ADD CONSTRAINT "SystemTag_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySystemTag" ADD CONSTRAINT "CompanySystemTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySystemTag" ADD CONSTRAINT "CompanySystemTag_systemTagId_fkey" FOREIGN KEY ("systemTagId") REFERENCES "SystemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySystemTag" ADD CONSTRAINT "CompanySystemTag_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
