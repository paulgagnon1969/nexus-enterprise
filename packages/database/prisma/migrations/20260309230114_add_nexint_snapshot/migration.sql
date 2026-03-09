-- CreateTable
CREATE TABLE "NexIntSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "composite" DOUBLE PRECISION NOT NULL,
    "fi" DOUBLE PRECISION NOT NULL,
    "pc" DOUBLE PRECISION NOT NULL,
    "co" DOUBLE PRECISION NOT NULL,
    "dq" DOUBLE PRECISION NOT NULL,
    "componentMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NexIntSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NexIntSnapshot_company_date_idx" ON "NexIntSnapshot"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NexIntSnapshot_companyId_date_key" ON "NexIntSnapshot"("companyId", "date");

-- AddForeignKey
ALTER TABLE "NexIntSnapshot" ADD CONSTRAINT "NexIntSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
