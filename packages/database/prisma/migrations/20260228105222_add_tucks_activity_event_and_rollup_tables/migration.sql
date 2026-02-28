-- CreateTable
CREATE TABLE "UserActivityEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDailyRollup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "module" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "ActivityDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityWeeklyRollup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "module" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityWeeklyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserActivityEvent_company_created_idx" ON "UserActivityEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "UserActivityEvent_user_created_idx" ON "UserActivityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserActivityEvent_module_event_created_idx" ON "UserActivityEvent"("module", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityDailyRollup_company_date_idx" ON "ActivityDailyRollup"("companyId", "date");

-- CreateIndex
CREATE INDEX "ActivityDailyRollup_user_date_idx" ON "ActivityDailyRollup"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityDailyRollup_companyId_userId_date_module_eventType_key" ON "ActivityDailyRollup"("companyId", "userId", "date", "module", "eventType");

-- CreateIndex
CREATE INDEX "ActivityWeeklyRollup_company_week_idx" ON "ActivityWeeklyRollup"("companyId", "weekStart");

-- CreateIndex
CREATE INDEX "ActivityWeeklyRollup_user_week_idx" ON "ActivityWeeklyRollup"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityWeeklyRollup_companyId_userId_weekStart_module_even_key" ON "ActivityWeeklyRollup"("companyId", "userId", "weekStart", "module", "eventType");
