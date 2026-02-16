-- CreateEnum
CREATE TYPE "SavedPhraseCategory" AS ENUM ('INVOICE', 'BILL', 'DAILY_LOG', 'GENERAL');

-- CreateTable
CREATE TABLE "SavedPhrase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "category" "SavedPhraseCategory" NOT NULL DEFAULT 'GENERAL',
    "phrase" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPhrase_company_user_cat_idx" ON "SavedPhrase"("companyId", "userId", "category");

-- CreateIndex
CREATE INDEX "SavedPhrase_company_cat_idx" ON "SavedPhrase"("companyId", "category");

-- AddForeignKey
ALTER TABLE "SavedPhrase" ADD CONSTRAINT "SavedPhrase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPhrase" ADD CONSTRAINT "SavedPhrase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
