-- CreateEnum
CREATE TYPE "BidPackageStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'AWARDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'OPENED', 'SUBMITTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AMENDED', 'WITHDRAWN', 'AWARDED', 'DECLINED');

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "BidPackageStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "awardedAt" TIMESTAMP(3),
    "attachmentUrls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPackageLineItem" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "estimateLineItemId" TEXT,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "specHash" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidPackageLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvitation" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "accessToken" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBid" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'DRAFT',
    "revisionNo" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "subtotal" DOUBLE PRECISION,
    "tax" DOUBLE PRECISION,
    "shipping" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3),
    "amendedAt" TIMESTAMP(3),
    "awardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBidLineItem" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "bidPackageLineItemId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "totalPrice" DOUBLE PRECISION,
    "notes" TEXT,
    "leadTimeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierBidLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidPackage_company_project_idx" ON "BidPackage"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "BidPackage_status_due_idx" ON "BidPackage"("status", "dueDate");

-- CreateIndex
CREATE INDEX "BidPackageLineItem_package_line_idx" ON "BidPackageLineItem"("bidPackageId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvitation_accessToken_key" ON "SupplierInvitation"("accessToken");

-- CreateIndex
CREATE INDEX "SupplierInvitation_package_idx" ON "SupplierInvitation"("bidPackageId");

-- CreateIndex
CREATE INDEX "SupplierInvitation_token_idx" ON "SupplierInvitation"("accessToken");

-- CreateIndex
CREATE INDEX "SupplierInvitation_email_idx" ON "SupplierInvitation"("contactEmail");

-- CreateIndex
CREATE INDEX "SupplierBid_package_status_idx" ON "SupplierBid"("bidPackageId", "status");

-- CreateIndex
CREATE INDEX "SupplierBid_invitation_idx" ON "SupplierBid"("invitationId");

-- CreateIndex
CREATE INDEX "SupplierBidLineItem_bid_idx" ON "SupplierBidLineItem"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBidLineItem_bid_line_key" ON "SupplierBidLineItem"("bidId", "bidPackageLineItemId");

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackageLineItem" ADD CONSTRAINT "BidPackageLineItem_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvitation" ADD CONSTRAINT "SupplierInvitation_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBid" ADD CONSTRAINT "SupplierBid_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBid" ADD CONSTRAINT "SupplierBid_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "SupplierInvitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBidLineItem" ADD CONSTRAINT "SupplierBidLineItem_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "SupplierBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBidLineItem" ADD CONSTRAINT "SupplierBidLineItem_bidPackageLineItemId_fkey" FOREIGN KEY ("bidPackageLineItemId") REFERENCES "BidPackageLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
