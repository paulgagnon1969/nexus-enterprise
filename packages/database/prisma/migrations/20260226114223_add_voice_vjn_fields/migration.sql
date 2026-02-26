-- CreateEnum
CREATE TYPE "VoiceJournalNoteStatus" AS ENUM ('DRAFT', 'SHARED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "aiTranscriptRaw" TEXT,
ADD COLUMN     "vjnId" TEXT,
ADD COLUMN     "voiceDurationSecs" INTEGER,
ADD COLUMN     "voiceRecordingUrl" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "aiTranscribed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vjnId" TEXT,
ADD COLUMN     "voiceDurationSecs" INTEGER,
ADD COLUMN     "voiceRecordingUrl" TEXT;

-- CreateTable
CREATE TABLE "VoiceJournalNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "voiceRecordingUrl" TEXT NOT NULL,
    "voiceDurationSecs" INTEGER NOT NULL,
    "aiTranscriptRaw" TEXT,
    "aiSummary" TEXT,
    "aiDetails" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "sourceModule" TEXT,
    "sourceEntityId" TEXT,
    "sourceLabel" TEXT,
    "status" "VoiceJournalNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceJournalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceJournalNoteShare" (
    "id" TEXT NOT NULL,
    "vjnId" TEXT NOT NULL,
    "targetModule" TEXT NOT NULL,
    "targetEntityId" TEXT,
    "sharedSummary" TEXT,
    "sharedDetails" TEXT,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedById" TEXT NOT NULL,

    CONSTRAINT "VoiceJournalNoteShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceJournalNote_creator_status_idx" ON "VoiceJournalNote"("createdById", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceJournalNote_company_project_idx" ON "VoiceJournalNote"("companyId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceJournalNote_source_idx" ON "VoiceJournalNote"("sourceModule", "sourceEntityId");

-- CreateIndex
CREATE INDEX "VoiceJournalNoteShare_vjn_idx" ON "VoiceJournalNoteShare"("vjnId");

-- CreateIndex
CREATE INDEX "VoiceJournalNoteShare_target_idx" ON "VoiceJournalNoteShare"("targetModule", "targetEntityId");

-- AddForeignKey
ALTER TABLE "VoiceJournalNote" ADD CONSTRAINT "VoiceJournalNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceJournalNote" ADD CONSTRAINT "VoiceJournalNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceJournalNote" ADD CONSTRAINT "VoiceJournalNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceJournalNoteShare" ADD CONSTRAINT "VoiceJournalNoteShare_vjnId_fkey" FOREIGN KEY ("vjnId") REFERENCES "VoiceJournalNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceJournalNoteShare" ADD CONSTRAINT "VoiceJournalNoteShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
