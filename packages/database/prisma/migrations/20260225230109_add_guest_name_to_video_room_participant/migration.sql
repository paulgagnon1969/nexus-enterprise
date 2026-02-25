-- DropForeignKey
ALTER TABLE "VideoRoomParticipant" DROP CONSTRAINT "VideoRoomParticipant_userId_fkey";

-- AlterTable
ALTER TABLE "VideoRoomParticipant" ADD COLUMN     "guestName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "VideoRoomParticipant" ADD CONSTRAINT "VideoRoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
