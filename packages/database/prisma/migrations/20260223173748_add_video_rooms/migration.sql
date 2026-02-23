-- CreateEnum
CREATE TYPE "VideoRoomStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "VideoRoom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "livekitRoomName" TEXT NOT NULL,
    "status" "VideoRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "participantCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VideoRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoRoomParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "VideoRoomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoRoom_livekitRoomName_key" ON "VideoRoom"("livekitRoomName");

-- CreateIndex
CREATE INDEX "VideoRoom_company_status_idx" ON "VideoRoom"("companyId", "status");

-- CreateIndex
CREATE INDEX "VideoRoom_project_status_idx" ON "VideoRoom"("projectId", "status");

-- CreateIndex
CREATE INDEX "VideoRoomParticipant_room_idx" ON "VideoRoomParticipant"("roomId");

-- CreateIndex
CREATE INDEX "VideoRoomParticipant_user_idx" ON "VideoRoomParticipant"("userId");

-- AddForeignKey
ALTER TABLE "VideoRoom" ADD CONSTRAINT "VideoRoom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRoom" ADD CONSTRAINT "VideoRoom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRoom" ADD CONSTRAINT "VideoRoom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRoomParticipant" ADD CONSTRAINT "VideoRoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRoomParticipant" ADD CONSTRAINT "VideoRoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
