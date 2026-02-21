-- Add unitCode field to ProjectInvoiceLineItem
ALTER TABLE "ProjectInvoiceLineItem" ADD COLUMN "unitCode" TEXT;

-- Create CompanyUnitCode table
CREATE TABLE "CompanyUnitCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUnitCode_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on (companyId, code)
CREATE UNIQUE INDEX "CompanyUnitCode_company_code_key" ON "CompanyUnitCode"("companyId", "code");

-- Create index for sorting
CREATE INDEX "CompanyUnitCode_company_sort_idx" ON "CompanyUnitCode"("companyId", "sortOrder");

-- Add foreign key constraint
ALTER TABLE "CompanyUnitCode" ADD CONSTRAINT "CompanyUnitCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
