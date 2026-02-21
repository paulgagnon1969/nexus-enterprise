-- CreateTable
CREATE TABLE "UserPortfolio" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPortfolioHr" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "encryptedJson" BYTEA NOT NULL,
    "ssnLast4" TEXT,
    "itinLast4" TEXT,
    "bankAccountLast4" TEXT,
    "bankRoutingLast4" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPortfolioHr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPortfolio_company_idx" ON "UserPortfolio"("companyId");

-- CreateIndex
CREATE INDEX "UserPortfolio_user_idx" ON "UserPortfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPortfolio_companyId_userId_key" ON "UserPortfolio"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPortfolioHr_portfolioId_key" ON "UserPortfolioHr"("portfolioId");

-- AddForeignKey
ALTER TABLE "UserPortfolio" ADD CONSTRAINT "UserPortfolio_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolio" ADD CONSTRAINT "UserPortfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolioHr" ADD CONSTRAINT "UserPortfolioHr_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "UserPortfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
