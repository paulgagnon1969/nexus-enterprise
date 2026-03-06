-- CreateEnum
CREATE TYPE "CostBookSearchField" AS ENUM ('DESCRIPTION', 'SEL', 'ACTIVITY', 'CAT');

-- CreateTable
CREATE TABLE "CostBookSearchHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" "CostBookSearchField" NOT NULL,
    "term" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostBookSearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostBookSearchHistory_lookup_idx" ON "CostBookSearchHistory"("companyId", "userId", "field", "hitCount");

-- CreateIndex
CREATE UNIQUE INDEX "CostBookSearchHistory_companyId_userId_field_term_key" ON "CostBookSearchHistory"("companyId", "userId", "field", "term");

-- AddForeignKey
ALTER TABLE "CostBookSearchHistory" ADD CONSTRAINT "CostBookSearchHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostBookSearchHistory" ADD CONSTRAINT "CostBookSearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
