-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileCompletionPercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "profileCompletionUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "profileReminderLastSentAt" TIMESTAMP(3),
ADD COLUMN     "profileReminderStartAt" TIMESTAMP(3);
