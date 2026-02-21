-- CreateTable
CREATE TABLE "CompensationClassificationMapping" (
    "id" TEXT NOT NULL,
    "cpRole" TEXT,
    "workerClassCode" TEXT,
    "socCode" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationClassificationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompClass_cpRole_idx" ON "CompensationClassificationMapping"("cpRole");

-- CreateIndex
CREATE INDEX "CompClass_workerClass_idx" ON "CompensationClassificationMapping"("workerClassCode");

-- CreateIndex
CREATE INDEX "CompClass_socCode_idx" ON "CompensationClassificationMapping"("socCode");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationClassificationMapping_cpRole_workerClassCode_so_key" ON "CompensationClassificationMapping"("cpRole", "workerClassCode", "socCode");
