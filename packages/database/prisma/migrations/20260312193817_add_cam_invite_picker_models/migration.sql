-- AlterTable
ALTER TABLE "DocumentShareToken" ADD COLUMN     "camInviteGroupId" TEXT;

-- AlterTable
ALTER TABLE "PersonalContact" ADD COLUMN     "camExcluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CamCannedMessage" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamCannedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamInviteGroup" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "messageUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CamInviteGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CamCannedMsg_creator_idx" ON "CamCannedMessage"("createdByUserId");

-- CreateIndex
CREATE INDEX "CamInviteGroup_owner_created_idx" ON "CamInviteGroup"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DocShareToken_invite_group_idx" ON "DocumentShareToken"("camInviteGroupId");

-- CreateIndex
CREATE INDEX "PersonalContact_owner_excluded_idx" ON "PersonalContact"("ownerUserId", "camExcluded");

-- AddForeignKey
ALTER TABLE "DocumentShareToken" ADD CONSTRAINT "DocumentShareToken_camInviteGroupId_fkey" FOREIGN KEY ("camInviteGroupId") REFERENCES "CamInviteGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamCannedMessage" ADD CONSTRAINT "CamCannedMessage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamInviteGroup" ADD CONSTRAINT "CamInviteGroup_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
