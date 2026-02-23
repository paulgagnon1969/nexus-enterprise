-- CreateTable
CREATE TABLE "ProjectStatusNote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectStatusNote_project_time_idx" ON "ProjectStatusNote"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectStatusNote" ADD CONSTRAINT "ProjectStatusNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusNote" ADD CONSTRAINT "ProjectStatusNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
