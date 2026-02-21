-- AlterTable: Add secure share fields to DocumentShareLink
ALTER TABLE "DocumentShareLink" ADD COLUMN "recipientEmail" TEXT;
ALTER TABLE "DocumentShareLink" ADD COLUMN "recipientName" TEXT;

-- CreateIndex
CREATE INDEX "DocShareLink_recipient_email_idx" ON "DocumentShareLink"("recipientEmail");

-- CreateTable: ReaderGroup
CREATE TABLE "ReaderGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReaderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReaderGroup_name_idx" ON "ReaderGroup"("name");

-- CreateTable: ReaderGroupMember
CREATE TABLE "ReaderGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaderGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReaderGroupMember_group_email_key" ON "ReaderGroupMember"("groupId", "email");
CREATE INDEX "ReaderGroupMember_group_idx" ON "ReaderGroupMember"("groupId");

-- AddForeignKey
ALTER TABLE "ReaderGroup" ADD CONSTRAINT "ReaderGroup_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaderGroupMember" ADD CONSTRAINT "ReaderGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ReaderGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
