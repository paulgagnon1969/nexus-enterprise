-- CreateEnum
CREATE TYPE "CamAnnouncementPriority" AS ENUM ('NORMAL', 'URGENT');

-- AlterTable
ALTER TABLE "DocumentShareToken" ADD COLUMN     "expoPushToken" TEXT;

-- CreateTable
CREATE TABLE "CamAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "CamAnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CamAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CamAnnouncement_created_idx" ON "CamAnnouncement"("createdAt");

-- AddForeignKey
ALTER TABLE "CamAnnouncement" ADD CONSTRAINT "CamAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
