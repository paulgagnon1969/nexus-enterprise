-- CreateTable
CREATE TABLE "OshaSyncState" (
    "id" TEXT NOT NULL,
    "cfrTitle" INTEGER NOT NULL,
    "cfrPart" INTEGER NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastAmendedDate" TEXT,
    "lastContentHash" TEXT,
    "manualId" TEXT,
    "sectionCount" INTEGER NOT NULL DEFAULT 0,
    "syncStatus" TEXT NOT NULL DEFAULT 'NEVER',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OshaSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OshaSyncState_title_part_key" ON "OshaSyncState"("cfrTitle", "cfrPart");
