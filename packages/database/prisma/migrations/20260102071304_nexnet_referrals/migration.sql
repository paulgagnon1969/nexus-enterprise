-- CreateEnum
CREATE TYPE "NexNetSource" AS ENUM ('REFERRAL', 'PUBLIC_APPLY', 'MIGRATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "NexNetStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('INVITED', 'CONFIRMED', 'REJECTED', 'APPLIED', 'HIRED', 'EXPIRED');

-- CreateTable
CREATE TABLE "NexNetCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "NexNetSource" NOT NULL DEFAULT 'REFERRAL',
    "status" "NexNetStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexNetCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "prospectName" TEXT,
    "prospectEmail" TEXT,
    "prospectPhone" TEXT,
    "token" TEXT NOT NULL,
    "candidateId" TEXT,
    "refereeUserId" TEXT,
    "referralConfirmedByReferee" BOOLEAN NOT NULL DEFAULT false,
    "referralConfirmedAt" TIMESTAMP(3),
    "referralRejectedByReferee" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReferralStatus" NOT NULL DEFAULT 'INVITED',
    "referralStartDate" TIMESTAMP(3),
    "referralEndDate" TIMESTAMP(3),
    "incentiveRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NexNetCandidate_userId_key" ON "NexNetCandidate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_token_key" ON "Referral"("token");

-- AddForeignKey
ALTER TABLE "NexNetCandidate" ADD CONSTRAINT "NexNetCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "NexNetCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
