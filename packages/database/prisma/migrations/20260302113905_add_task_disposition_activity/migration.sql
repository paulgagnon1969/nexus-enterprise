-- CreateEnum
CREATE TYPE "TaskDisposition" AS ENUM ('NONE', 'APPROVED', 'REJECTED', 'REASSIGNED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'TASK_DISPOSITION';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "disposition" "TaskDisposition" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "dispositionAt" TIMESTAMP(3),
ADD COLUMN     "dispositionByUserId" TEXT,
ADD COLUMN     "dispositionNote" TEXT;

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskActivity_task_created_idx" ON "TaskActivity"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dispositionByUserId_fkey" FOREIGN KEY ("dispositionByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
