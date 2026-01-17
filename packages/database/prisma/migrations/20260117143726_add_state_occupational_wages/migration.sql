-- CreateTable
CREATE TABLE "StateOccupationalWageSnapshot" (
    "id" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BLS_OES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateOccupationalWageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateOccupationalWage" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "socCode" TEXT NOT NULL,
    "occupationName" TEXT NOT NULL,
    "employment" INTEGER,
    "hourlyMean" DOUBLE PRECISION,
    "annualMean" DOUBLE PRECISION,
    "hourlyP10" DOUBLE PRECISION,
    "hourlyP25" DOUBLE PRECISION,
    "hourlyMedian" DOUBLE PRECISION,
    "hourlyP75" DOUBLE PRECISION,
    "hourlyP90" DOUBLE PRECISION,
    "annualP10" DOUBLE PRECISION,
    "annualP25" DOUBLE PRECISION,
    "annualMedian" DOUBLE PRECISION,
    "annualP75" DOUBLE PRECISION,
    "annualP90" DOUBLE PRECISION,
    "employmentPerThousand" DOUBLE PRECISION,
    "locationQuotient" DOUBLE PRECISION,

    CONSTRAINT "StateOccupationalWage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StateOccupationalWageSnapshot_stateCode_year_source_key" ON "StateOccupationalWageSnapshot"("stateCode", "year", "source");

-- CreateIndex
CREATE INDEX "StateOccWage_snapshot_soc_idx" ON "StateOccupationalWage"("snapshotId", "socCode");

-- AddForeignKey
ALTER TABLE "StateOccupationalWage" ADD CONSTRAINT "StateOccupationalWage_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StateOccupationalWageSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
