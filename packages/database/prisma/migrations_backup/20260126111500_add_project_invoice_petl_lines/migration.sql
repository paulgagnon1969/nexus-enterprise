-- CreateEnum
CREATE TYPE "ProjectInvoicePetlLineKind" AS ENUM ('BASE', 'ACV_HOLDBACK_CREDIT');

-- CreateTable
CREATE TABLE "ProjectInvoicePetlLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "ProjectInvoicePetlLineKind" NOT NULL DEFAULT 'BASE',
    "parentLineId" TEXT,
    "estimateVersionId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "logicalItemId" TEXT NOT NULL,
    "projectParticleId" TEXT NOT NULL,
    "projectParticleLabelSnapshot" TEXT,
    "projectUnitIdSnapshot" TEXT,
    "projectUnitLabelSnapshot" TEXT,
    "projectBuildingIdSnapshot" TEXT,
    "projectBuildingLabelSnapshot" TEXT,
    "projectTreePathSnapshot" TEXT,
    "lineNoSnapshot" INTEGER NOT NULL,
    "categoryCodeSnapshot" TEXT,
    "selectionCodeSnapshot" TEXT,
    "descriptionSnapshot" TEXT NOT NULL,
    "unitSnapshot" TEXT,
    "percentCompleteSnapshot" DOUBLE PRECISION NOT NULL,
    "contractItemAmount" DOUBLE PRECISION NOT NULL,
    "contractTaxAmount" DOUBLE PRECISION NOT NULL,
    "contractOpAmount" DOUBLE PRECISION NOT NULL,
    "contractTotal" DOUBLE PRECISION NOT NULL,
    "earnedItemAmount" DOUBLE PRECISION NOT NULL,
    "earnedTaxAmount" DOUBLE PRECISION NOT NULL,
    "earnedOpAmount" DOUBLE PRECISION NOT NULL,
    "earnedTotal" DOUBLE PRECISION NOT NULL,
    "prevBilledItemAmount" DOUBLE PRECISION NOT NULL,
    "prevBilledTaxAmount" DOUBLE PRECISION NOT NULL,
    "prevBilledOpAmount" DOUBLE PRECISION NOT NULL,
    "prevBilledTotal" DOUBLE PRECISION NOT NULL,
    "thisInvItemAmount" DOUBLE PRECISION NOT NULL,
    "thisInvTaxAmount" DOUBLE PRECISION NOT NULL,
    "thisInvOpAmount" DOUBLE PRECISION NOT NULL,
    "thisInvTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvoicePetlLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoicePetlLine_invoice_sow_kind_key" ON "ProjectInvoicePetlLine"("invoiceId", "sowItemId", "kind");

-- CreateIndex
CREATE INDEX "ProjectInvoicePetlLine_invoice_particle_idx" ON "ProjectInvoicePetlLine"("invoiceId", "projectParticleId");

-- CreateIndex
CREATE INDEX "ProjectInvoicePetlLine_parent_idx" ON "ProjectInvoicePetlLine"("parentLineId");

-- AddForeignKey
ALTER TABLE "ProjectInvoicePetlLine" ADD CONSTRAINT "ProjectInvoicePetlLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoicePetlLine" ADD CONSTRAINT "ProjectInvoicePetlLine_parentLineId_fkey" FOREIGN KEY ("parentLineId") REFERENCES "ProjectInvoicePetlLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
