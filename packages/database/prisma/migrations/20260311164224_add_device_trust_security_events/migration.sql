-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('UNRECOGNIZED_DEVICE_LOGIN', 'DEVICE_CHALLENGE_PASSED', 'DEVICE_CHALLENGE_FAILED', 'CONCURRENT_GEO_ANOMALY', 'CREDENTIAL_SHARING_SUSPECTED', 'DEVICE_TRUSTED', 'DEVICE_REVOKED');

-- CreateEnum
CREATE TYPE "SecurityEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SecurityEventStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

-- AlterTable
ALTER TABLE "UserDevice" ADD COLUMN     "isTrusted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trustExpiresAt" TIMESTAMP(3),
ADD COLUMN     "trustedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "SecurityEventType" NOT NULL,
    "deviceFingerprint" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'LOW',
    "status" "SecurityEventStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityEvent_user_created_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_status_created_idx" ON "SecurityEvent"("eventType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_status_idx" ON "SecurityEvent"("severity", "status");

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
