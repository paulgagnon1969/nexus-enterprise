-- AlterEnum
ALTER TYPE "MessageThreadType" ADD VALUE 'JOURNAL';

-- AlterTable
ALTER TABLE "MessageThread" ADD COLUMN     "subjectUserId" TEXT;

-- CreateIndex
CREATE INDEX "MessageThread_company_subject_user_type_idx" ON "MessageThread"("companyId", "subjectUserId", "type");
