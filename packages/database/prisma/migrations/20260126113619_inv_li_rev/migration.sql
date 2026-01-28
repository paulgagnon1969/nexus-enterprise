-- RenameIndex
ALTER INDEX "ProjectInvoice_company_invoice_seq_key" RENAME TO "ProjectInvoice_companyId_invoiceSequenceNo_key";

-- RenameIndex
ALTER INDEX "ProjectInvoicePetlLine_invoice_particle_idx" RENAME TO "ProjectInvoicePetlLine_invoiceId_projectParticleId_idx";

-- RenameIndex
ALTER INDEX "ProjectInvoicePetlLine_invoice_sow_kind_key" RENAME TO "ProjectInvoicePetlLine_invoiceId_sowItemId_kind_key";

-- RenameIndex
ALTER INDEX "ProjectInvoicePetlLine_parent_idx" RENAME TO "ProjectInvoicePetlLine_parentLineId_idx";
