-- AlterTable
ALTER TABLE "VoiceJournalNote" ADD COLUMN     "aiText" TEXT,
ADD COLUMN     "aiTextTranslated" TEXT,
ADD COLUMN     "deviceTranscript" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';
