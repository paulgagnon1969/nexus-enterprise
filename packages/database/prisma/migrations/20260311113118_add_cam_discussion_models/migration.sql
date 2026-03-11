-- CreateEnum
CREATE TYPE "CamThreadVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'NOTE');

-- CreateTable
CREATE TABLE "CamDiscussionTopic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamDiscussionTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamDiscussionThread" (
    "id" TEXT NOT NULL,
    "topicId" TEXT,
    "camSection" TEXT,
    "title" TEXT NOT NULL,
    "visibility" "CamThreadVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isFaq" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "shareTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamDiscussionThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamDiscussionMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamDiscussionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamDiscussionParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CamDiscussionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CamDiscTopic_sort_idx" ON "CamDiscussionTopic"("sortOrder");

-- CreateIndex
CREATE INDEX "CamDiscThread_topic_updated_idx" ON "CamDiscussionThread"("topicId", "updatedAt");

-- CreateIndex
CREATE INDEX "CamDiscThread_section_idx" ON "CamDiscussionThread"("camSection");

-- CreateIndex
CREATE INDEX "CamDiscThread_vis_updated_idx" ON "CamDiscussionThread"("visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "CamDiscThread_creator_idx" ON "CamDiscussionThread"("createdById");

-- CreateIndex
CREATE INDEX "CamDiscMsg_thread_created_idx" ON "CamDiscussionMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "CamDiscMsg_author_idx" ON "CamDiscussionMessage"("authorId");

-- CreateIndex
CREATE INDEX "CamDiscParticipant_user_idx" ON "CamDiscussionParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CamDiscParticipant_thread_user_uk" ON "CamDiscussionParticipant"("threadId", "userId");

-- AddForeignKey
ALTER TABLE "CamDiscussionTopic" ADD CONSTRAINT "CamDiscussionTopic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamDiscussionThread" ADD CONSTRAINT "CamDiscussionThread_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CamDiscussionTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamDiscussionThread" ADD CONSTRAINT "CamDiscussionThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamDiscussionMessage" ADD CONSTRAINT "CamDiscussionMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CamDiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamDiscussionMessage" ADD CONSTRAINT "CamDiscussionMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamDiscussionParticipant" ADD CONSTRAINT "CamDiscussionParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CamDiscussionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamDiscussionParticipant" ADD CONSTRAINT "CamDiscussionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
