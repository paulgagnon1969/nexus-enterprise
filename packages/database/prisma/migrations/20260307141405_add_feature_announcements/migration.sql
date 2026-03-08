-- CreateTable
CREATE TABLE "FeatureAnnouncement" (
    "id" TEXT NOT NULL,
    "moduleCode" TEXT,
    "camId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "launchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "highlightUntil" TIMESTAMP(3),
    "targetRoles" TEXT[] DEFAULT ARRAY['OWNER', 'ADMIN']::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeatureView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "redirectCount" INTEGER NOT NULL DEFAULT 0,
    "enabledModule" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserFeatureView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureAnnouncement_active_launched_idx" ON "FeatureAnnouncement"("active", "launchedAt");

-- CreateIndex
CREATE INDEX "UserFeatureView_user_idx" ON "UserFeatureView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFeatureView_userId_announcementId_key" ON "UserFeatureView"("userId", "announcementId");

-- AddForeignKey
ALTER TABLE "UserFeatureView" ADD CONSTRAINT "UserFeatureView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeatureView" ADD CONSTRAINT "UserFeatureView_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "FeatureAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
