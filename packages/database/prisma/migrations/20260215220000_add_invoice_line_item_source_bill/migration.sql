-- AlterTable (idempotent: skip if column already exists)
ALTER TABLE "ProjectInvoiceLineItem" ADD COLUMN IF NOT EXISTS "sourceBillId" TEXT;

-- CreateIndex (idempotent: skip if index already exists)
CREATE INDEX IF NOT EXISTS "ProjectInvoiceLineItem_source_bill_idx" ON "ProjectInvoiceLineItem"("sourceBillId");

-- AddForeignKey (idempotent: skip if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectInvoiceLineItem_sourceBillId_fkey'
  ) THEN
    ALTER TABLE "ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_sourceBillId_fkey"
      FOREIGN KEY ("sourceBillId") REFERENCES "ProjectBill"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
