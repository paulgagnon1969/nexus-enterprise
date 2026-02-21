-- CreateEnum
CREATE TYPE "ReferralRelationshipType" AS ENUM ('PERSONAL', 'COMPANY');

-- AlterTable
ALTER TABLE "CompanyInvite" ADD COLUMN     "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "ReferralRelationship" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "refereeUserId" TEXT NOT NULL,
    "companyId" TEXT,
    "type" "ReferralRelationshipType" NOT NULL,
    "referralId" TEXT,
    "companyInviteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralRel_referrer_idx" ON "ReferralRelationship"("referrerUserId");

-- CreateIndex
CREATE INDEX "ReferralRel_referee_idx" ON "ReferralRelationship"("refereeUserId");

-- CreateIndex
CREATE INDEX "ReferralRel_company_idx" ON "ReferralRelationship"("companyId");

-- AddForeignKey
ALTER TABLE "ReferralRelationship" ADD CONSTRAINT "ReferralRelationship_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRelationship" ADD CONSTRAINT "ReferralRelationship_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralRelationship" ADD CONSTRAINT "ReferralRelationship_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
