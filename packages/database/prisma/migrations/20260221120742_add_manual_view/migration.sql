-- CreateTable
CREATE TABLE "ManualView" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "mapping" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualView_manual_idx" ON "ManualView"("manualId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualView_manual_name_key" ON "ManualView"("manualId", "name");

-- AddForeignKey
ALTER TABLE "ManualView" ADD CONSTRAINT "ManualView_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualView" ADD CONSTRAINT "ManualView_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
