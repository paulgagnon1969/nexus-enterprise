-- Add draft invoice numbering support

-- Add lastDraftNo column to CompanyInvoiceCounter
ALTER TABLE "CompanyInvoiceCounter" ADD COLUMN "lastDraftNo" INTEGER NOT NULL DEFAULT 0;

-- Add draftSequenceNo column to ProjectInvoice
ALTER TABLE "ProjectInvoice" ADD COLUMN "draftSequenceNo" INTEGER;
