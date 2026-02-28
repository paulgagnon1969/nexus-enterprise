-- CreateTable
CREATE TABLE "RoomScan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "particleId" TEXT,
    "label" TEXT,
    "scanMode" TEXT NOT NULL DEFAULT 'AI_VISION',
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "photoUrls" JSONB,
    "assessmentJson" JSONB,
    "rawAiResponse" TEXT,
    "lidarRoomJson" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomScan_company_project_idx" ON "RoomScan"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "RoomScan_project_created_idx" ON "RoomScan"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "RoomScan" ADD CONSTRAINT "RoomScan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomScan" ADD CONSTRAINT "RoomScan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomScan" ADD CONSTRAINT "RoomScan_particleId_fkey" FOREIGN KEY ("particleId") REFERENCES "ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomScan" ADD CONSTRAINT "RoomScan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
