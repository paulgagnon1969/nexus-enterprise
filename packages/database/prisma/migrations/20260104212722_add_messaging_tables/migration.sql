-- CreateEnum
CREATE TYPE "MessageThreadType" AS ENUM ('DIRECT', 'BOARD', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('INTERNAL_FILE', 'UPLOADED_FILE', 'EXTERNAL_LINK');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MessageThread" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "type" "MessageThreadType" NOT NULL DEFAULT 'DIRECT';

-- CreateTable
CREATE TABLE "MessageRecipientGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRecipientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipientGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MessageRecipientGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageRecipientGroup_company_owner_idx" ON "MessageRecipientGroup"("companyId", "ownerId");

-- CreateIndex
CREATE INDEX "MessageRecipientGroupMember_group_idx" ON "MessageRecipientGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "MessageRecipientGroupMember_user_idx" ON "MessageRecipientGroupMember"("userId");

-- CreateIndex
CREATE INDEX "MessageAttachment_message_idx" ON "MessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "MessageThread_company_type_updated_idx" ON "MessageThread"("companyId", "type", "updatedAt");

-- CreateIndex
CREATE INDEX "MessageThread_project_type_updated_idx" ON "MessageThread"("projectId", "type", "updatedAt");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipientGroupMember" ADD CONSTRAINT "MessageRecipientGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MessageRecipientGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipientGroupMember" ADD CONSTRAINT "MessageRecipientGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
