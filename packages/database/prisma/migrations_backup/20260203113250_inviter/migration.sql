-- CreateEnum
CREATE TYPE "PersonalContactSource" AS ENUM ('UPLOAD', 'WINDOWS', 'MACOS', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "PersonalContactSubjectType" AS ENUM ('CANDIDATE', 'WORKER');

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "personalContactId" TEXT;

-- CreateTable
CREATE TABLE "PersonalContact" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "PersonalContactSource" NOT NULL DEFAULT 'UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalContactLink" (
    "id" TEXT NOT NULL,
    "personalContactId" TEXT NOT NULL,
    "subjectType" "PersonalContactSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "tenantId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalContactLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalContact_owner_email_idx" ON "PersonalContact"("ownerUserId", "email");

-- CreateIndex
CREATE INDEX "PersonalContact_owner_phone_idx" ON "PersonalContact"("ownerUserId", "phone");

-- CreateIndex
CREATE INDEX "PersonalContactLink_contact_idx" ON "PersonalContactLink"("personalContactId");

-- CreateIndex
CREATE INDEX "PersonalContactLink_subject_idx" ON "PersonalContactLink"("subjectType", "subjectId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_personalContactId_fkey" FOREIGN KEY ("personalContactId") REFERENCES "PersonalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalContact" ADD CONSTRAINT "PersonalContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalContactLink" ADD CONSTRAINT "PersonalContactLink_personalContactId_fkey" FOREIGN KEY ("personalContactId") REFERENCES "PersonalContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
