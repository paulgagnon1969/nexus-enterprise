/*
  Warnings:

  - A unique constraint covering the columns `[workerInviteToken]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "workerInviteToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_workerInviteToken_key" ON "Company"("workerInviteToken");
