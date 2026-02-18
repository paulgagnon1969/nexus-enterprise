-- CreateEnum
CREATE TYPE "CrossTenantInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccountLinkStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED', 'UNLINKED_BY_ADMIN');

-- CreateTable
CREATE TABLE "CrossTenantInvite" (
    "id" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "inviteeEmail" TEXT NOT NULL,
    "inviteePhone" TEXT,
    "token" TEXT NOT NULL,
    "tenantToken" TEXT,
    "inviterPeopleToken" TEXT NOT NULL,
    "inviteePeopleToken" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "CrossTenantInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossTenantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmailAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkEventId" TEXT,

    CONSTRAINT "UserEmailAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountLinkEvent" (
    "id" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "linkedEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verificationCode" TEXT,
    "verificationSentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "triggeredByInviteId" TEXT,
    "status" "AccountLinkStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrossTenantInvite_token_key" ON "CrossTenantInvite"("token");

-- CreateIndex
CREATE INDEX "CrossTenantInvite_company_status_idx" ON "CrossTenantInvite"("targetCompanyId", "status");

-- CreateIndex
CREATE INDEX "CrossTenantInvite_inviter_idx" ON "CrossTenantInvite"("inviterUserId");

-- CreateIndex
CREATE INDEX "CrossTenantInvite_invitee_idx" ON "CrossTenantInvite"("inviteeUserId");

-- CreateIndex
CREATE INDEX "CrossTenantInvite_email_idx" ON "CrossTenantInvite"("inviteeEmail");

-- CreateIndex
CREATE INDEX "CrossTenantInvite_phone_idx" ON "CrossTenantInvite"("inviteePhone");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmailAlias_email_key" ON "UserEmailAlias"("email");

-- CreateIndex
CREATE INDEX "UserEmailAlias_user_idx" ON "UserEmailAlias"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountLinkEvent_triggeredByInviteId_key" ON "AccountLinkEvent"("triggeredByInviteId");

-- CreateIndex
CREATE INDEX "AccountLinkEvent_primary_user_idx" ON "AccountLinkEvent"("primaryUserId");

-- CreateIndex
CREATE INDEX "AccountLinkEvent_email_idx" ON "AccountLinkEvent"("linkedEmail");

-- CreateIndex
CREATE INDEX "AccountLinkEvent_phone_idx" ON "AccountLinkEvent"("phone");

-- CreateIndex
CREATE INDEX "AccountLinkEvent_status_created_idx" ON "AccountLinkEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CrossTenantInvite" ADD CONSTRAINT "CrossTenantInvite_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossTenantInvite" ADD CONSTRAINT "CrossTenantInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossTenantInvite" ADD CONSTRAINT "CrossTenantInvite_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmailAlias" ADD CONSTRAINT "UserEmailAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLinkEvent" ADD CONSTRAINT "AccountLinkEvent_triggeredByInviteId_fkey" FOREIGN KEY ("triggeredByInviteId") REFERENCES "CrossTenantInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLinkEvent" ADD CONSTRAINT "AccountLinkEvent_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
