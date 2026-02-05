-- CreateTable
CREATE TABLE "ProjectInvoiceApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceInvoiceId" TEXT NOT NULL,
    "targetInvoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvoiceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectInvoiceApplication_company_project_applied_idx" ON "ProjectInvoiceApplication"("companyId", "projectId", "appliedAt");

-- CreateIndex
CREATE INDEX "ProjectInvoiceApplication_source_invoice_idx" ON "ProjectInvoiceApplication"("sourceInvoiceId");

-- CreateIndex
CREATE INDEX "ProjectInvoiceApplication_target_invoice_idx" ON "ProjectInvoiceApplication"("targetInvoiceId");

-- AddForeignKey
ALTER TABLE "ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_targetInvoiceId_fkey" FOREIGN KEY ("targetInvoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
