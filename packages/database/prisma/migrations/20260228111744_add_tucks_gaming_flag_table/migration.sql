-- CreateTable
CREATE TABLE "GamingFlag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flagDate" DATE NOT NULL,
    "gamingScore" DOUBLE PRECISION NOT NULL,
    "volumeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "burstScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "similarityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratioScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyLogIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamingFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GamingFlag_company_status_date_idx" ON "GamingFlag"("companyId", "status", "flagDate");

-- CreateIndex
CREATE INDEX "GamingFlag_user_date_idx" ON "GamingFlag"("userId", "flagDate");

-- CreateIndex
CREATE UNIQUE INDEX "GamingFlag_companyId_userId_flagDate_key" ON "GamingFlag"("companyId", "userId", "flagDate");
