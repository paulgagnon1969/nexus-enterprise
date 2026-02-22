-- CreateTable
CREATE TABLE "FederalRegisterAlert" (
    "id" TEXT NOT NULL,
    "granuleId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "cfrReferences" TEXT[],
    "agencies" TEXT[],
    "publishedDate" TIMESTAMP(3) NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "commentDeadline" TIMESTAMP(3),
    "govInfoUrl" TEXT NOT NULL,
    "frDocNumber" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isRelevant" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FederalRegisterAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfrAnnualSnapshot" (
    "id" TEXT NOT NULL,
    "cfrTitle" INTEGER NOT NULL,
    "cfrPart" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "sectionCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfrAnnualSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CfrAnnualDiff" (
    "id" TEXT NOT NULL,
    "cfrTitle" INTEGER NOT NULL,
    "cfrPart" INTEGER NOT NULL,
    "fromYear" INTEGER NOT NULL,
    "toYear" INTEGER NOT NULL,
    "sectionCfr" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CfrAnnualDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegQueryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "sources" JSONB,
    "contextJson" JSONB,
    "durationMs" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'govinfo-mcp',
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FederalRegisterAlert_granuleId_key" ON "FederalRegisterAlert"("granuleId");

-- CreateIndex
CREATE INDEX "FRAlert_published_idx" ON "FederalRegisterAlert"("publishedDate");

-- CreateIndex
CREATE INDEX "FRAlert_type_idx" ON "FederalRegisterAlert"("documentType");

-- CreateIndex
CREATE INDEX "FRAlert_status_idx" ON "FederalRegisterAlert"("isRead", "isRelevant");

-- CreateIndex
CREATE UNIQUE INDEX "CfrAnnualSnapshot_title_part_year_key" ON "CfrAnnualSnapshot"("cfrTitle", "cfrPart", "year");

-- CreateIndex
CREATE INDEX "CfrAnnualDiff_title_part_year_idx" ON "CfrAnnualDiff"("cfrTitle", "cfrPart", "toYear");

-- CreateIndex
CREATE INDEX "CfrAnnualDiff_section_idx" ON "CfrAnnualDiff"("sectionCfr");

-- CreateIndex
CREATE INDEX "RegQueryLog_user_created_idx" ON "RegQueryLog"("userId", "createdAt");
