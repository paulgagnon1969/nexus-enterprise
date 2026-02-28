-- CreateEnum
CREATE TYPE "LocalSupplierStatus" AS ENUM ('ACTIVE', 'PENDING_REMOVAL', 'PERMANENTLY_CLOSED');

-- CreateTable
CREATE TABLE "LocalSupplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "source" TEXT,
    "placeId" TEXT,
    "status" "LocalSupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "flaggedByUserId" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "flagReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocalSupplier_company_status_idx" ON "LocalSupplier"("companyId", "status");

-- CreateIndex
CREATE INDEX "LocalSupplier_company_geo_idx" ON "LocalSupplier"("companyId", "lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "LocalSupplier_company_placeId_key" ON "LocalSupplier"("companyId", "placeId");

-- AddForeignKey
ALTER TABLE "LocalSupplier" ADD CONSTRAINT "LocalSupplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalSupplier" ADD CONSTRAINT "LocalSupplier_flaggedByUserId_fkey" FOREIGN KEY ("flaggedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalSupplier" ADD CONSTRAINT "LocalSupplier_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
