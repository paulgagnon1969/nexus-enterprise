-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'CAM_DISCUSSION';

-- AlterTable
ALTER TABLE "CamDiscussionMessage" ADD COLUMN     "isSystemMessage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CamDiscussionParticipant" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CamDiscussionThread" ADD COLUMN     "movedAt" TIMESTAMP(3),
ADD COLUMN     "movedFromSection" TEXT;
