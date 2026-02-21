-- CreateTable
CREATE TABLE "DailyLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "tagsJson" TEXT,
    "weatherSummary" TEXT,
    "crewOnSite" TEXT,
    "workPerformed" TEXT,
    "issues" TEXT,
    "safetyIncidents" TEXT,
    "manpowerOnsite" TEXT,
    "personOnsite" TEXT,
    "confidentialNotes" TEXT,
    "shareInternal" BOOLEAN NOT NULL DEFAULT true,
    "shareSubs" BOOLEAN NOT NULL DEFAULT false,
    "shareClient" BOOLEAN NOT NULL DEFAULT false,
    "sharePrivate" BOOLEAN NOT NULL DEFAULT false,
    "notifyUserIdsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyLog_project_idx" ON "DailyLog"("projectId");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
