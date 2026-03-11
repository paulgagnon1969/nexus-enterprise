-- CreateTable
CREATE TABLE "ShareLinkAccessLog" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "accessType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareAccessLog_link_created_idx" ON "ShareLinkAccessLog"("shareLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "ShareAccessLog_serial_idx" ON "ShareLinkAccessLog"("serialNumber");

-- CreateIndex
CREATE INDEX "ShareAccessLog_email_idx" ON "ShareLinkAccessLog"("recipientEmail");

-- CreateIndex
CREATE INDEX "ShareAccessLog_created_idx" ON "ShareLinkAccessLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ShareLinkAccessLog" ADD CONSTRAINT "ShareLinkAccessLog_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "DocumentShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
