-- CreateTable
CREATE TABLE "ProjectPaymentApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPaymentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPaymentApplication_paymentId_invoiceId_key" ON "ProjectPaymentApplication"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "ProjectPaymentApplication_company_project_applied_idx" ON "ProjectPaymentApplication"("companyId", "projectId", "appliedAt");

-- CreateIndex
CREATE INDEX "ProjectPaymentApplication_payment_idx" ON "ProjectPaymentApplication"("paymentId");

-- CreateIndex
CREATE INDEX "ProjectPaymentApplication_invoice_idx" ON "ProjectPaymentApplication"("invoiceId");

-- AddForeignKey
ALTER TABLE "ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ProjectPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
