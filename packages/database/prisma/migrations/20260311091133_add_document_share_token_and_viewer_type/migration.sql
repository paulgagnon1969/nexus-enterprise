-- CreateEnum
CREATE TYPE "ShareDocumentType" AS ENUM ('NEXFIT_REPORT', 'CAM_LIBRARY', 'CAM_DOCUMENT');

-- AlterEnum
ALTER TYPE "UserType" ADD VALUE 'VIEWER';

-- CreateTable
CREATE TABLE "DocumentShareToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "documentType" "ShareDocumentType" NOT NULL,
    "documentRef" TEXT,
    "inviterEmail" TEXT NOT NULL,
    "inviterName" TEXT,
    "inviterUserId" TEXT,
    "inviteeEmail" TEXT,
    "inviteeName" TEXT,
    "inviteeUserId" TEXT,
    "parentTokenId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareToken_token_key" ON "DocumentShareToken"("token");

-- CreateIndex
CREATE INDEX "DocShareToken_token_idx" ON "DocumentShareToken"("token");

-- CreateIndex
CREATE INDEX "DocShareToken_inviter_email_idx" ON "DocumentShareToken"("inviterEmail");

-- CreateIndex
CREATE INDEX "DocShareToken_invitee_email_idx" ON "DocumentShareToken"("inviteeEmail");

-- CreateIndex
CREATE INDEX "DocShareToken_parent_idx" ON "DocumentShareToken"("parentTokenId");

-- CreateIndex
CREATE INDEX "DocShareToken_doctype_idx" ON "DocumentShareToken"("documentType");

-- AddForeignKey
ALTER TABLE "DocumentShareToken" ADD CONSTRAINT "DocumentShareToken_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareToken" ADD CONSTRAINT "DocumentShareToken_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShareToken" ADD CONSTRAINT "DocumentShareToken_parentTokenId_fkey" FOREIGN KEY ("parentTokenId") REFERENCES "DocumentShareToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
