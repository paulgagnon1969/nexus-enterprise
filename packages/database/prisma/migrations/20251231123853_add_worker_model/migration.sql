-- AlterEnum
ALTER TYPE "ImportJobType" ADD VALUE 'XACT_COMPONENTS_ALLOCATE';

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "ssnHash" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "gender" TEXT,
    "ethnicity" TEXT,
    "primaryClassCode" TEXT,
    "defaultProjectCode" TEXT,
    "dateHired" TIMESTAMP(3),
    "status" TEXT,
    "isForeman" BOOLEAN NOT NULL DEFAULT false,
    "defaultPayRate" DOUBLE PRECISION,
    "unionLocal" TEXT,
    "firstSeenWeekEnd" TIMESTAMP(3),
    "lastSeenWeekEnd" TIMESTAMP(3),
    "totalHoursCbs" DOUBLE PRECISION DEFAULT 0,
    "totalHoursCct" DOUBLE PRECISION DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_fullName_key" ON "Worker"("fullName");
