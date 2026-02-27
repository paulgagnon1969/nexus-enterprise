-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('ACTIVE', 'REQUIRES_REAUTH', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "CrewLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "plaidAccessToken" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "accountMask" TEXT,
    "accountType" TEXT,
    "accountSubtype" TEXT,
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "status" "BankConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankConnectionId" TEXT NOT NULL,
    "plaidTransactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "datetime" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "isoCurrencyCode" TEXT DEFAULT 'USD',
    "primaryCategory" TEXT,
    "detailedCategory" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "pendingTransactionId" TEXT,
    "paymentChannel" TEXT,
    "transactionType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrewLocation_project_time_idx" ON "CrewLocation"("projectId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "CrewLocation_userId_projectId_key" ON "CrewLocation"("userId", "projectId");

-- CreateIndex
CREATE INDEX "BankConnection_company_idx" ON "BankConnection"("companyId");

-- CreateIndex
CREATE INDEX "BankConnection_plaid_item_idx" ON "BankConnection"("plaidItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_companyId_accountId_key" ON "BankConnection"("companyId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_plaidTransactionId_key" ON "BankTransaction"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "BankTransaction_company_date_idx" ON "BankTransaction"("companyId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_connection_idx" ON "BankTransaction"("bankConnectionId");

-- CreateIndex
CREATE INDEX "BankTransaction_company_category_idx" ON "BankTransaction"("companyId", "primaryCategory");

-- CreateIndex
CREATE INDEX "BankTransaction_pending_idx" ON "BankTransaction"("pending");

-- AddForeignKey
ALTER TABLE "CrewLocation" ADD CONSTRAINT "CrewLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewLocation" ADD CONSTRAINT "CrewLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
