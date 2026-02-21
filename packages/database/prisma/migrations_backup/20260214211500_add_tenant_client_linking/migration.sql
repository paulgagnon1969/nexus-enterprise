-- CreateTable
CREATE TABLE "TenantClient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "additionalEmails" JSONB,
    "additionalPhones" JSONB,
    "company" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantClient_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "tenantClientId" TEXT;

-- CreateIndex
CREATE INDEX "TenantClient_company_idx" ON "TenantClient"("companyId");

-- CreateIndex
CREATE INDEX "TenantClient_company_email_idx" ON "TenantClient"("companyId", "email");

-- CreateIndex
CREATE INDEX "TenantClient_company_phone_idx" ON "TenantClient"("companyId", "phone");

-- CreateIndex
CREATE INDEX "TenantClient_company_name_idx" ON "TenantClient"("companyId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Project_tenant_client_idx" ON "Project"("tenantClientId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantClientId_fkey" FOREIGN KEY ("tenantClientId") REFERENCES "TenantClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantClient" ADD CONSTRAINT "TenantClient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
