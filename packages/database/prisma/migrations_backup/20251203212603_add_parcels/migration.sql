-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETE');

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parcelCode" TEXT,
    "status" "ParcelStatus" NOT NULL DEFAULT 'PLANNED',
    "areaSqFt" DOUBLE PRECISION,
    "zoning" TEXT,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
