-- CreateEnum
CREATE TYPE "CompanyTier" AS ENUM ('CLIENT', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "CollaborationRole" AS ENUM ('CLIENT', 'SUB', 'PRIME_GC', 'CONSULTANT', 'INSPECTOR');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "tier" "CompanyTier" NOT NULL DEFAULT 'CONTRACTOR';

-- CreateTable
CREATE TABLE "ProjectCollaboration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "CollaborationRole" NOT NULL,
    "visibility" "ProjectVisibilityLevel" NOT NULL DEFAULT 'LIMITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "ProjectCollaboration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCollaboration_company_active_idx" ON "ProjectCollaboration"("companyId", "active");

-- CreateIndex
CREATE INDEX "ProjectCollaboration_project_role_idx" ON "ProjectCollaboration"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCollaboration_projectId_companyId_key" ON "ProjectCollaboration"("projectId", "companyId");

-- AddForeignKey
ALTER TABLE "ProjectCollaboration" ADD CONSTRAINT "ProjectCollaboration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaboration" ADD CONSTRAINT "ProjectCollaboration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaboration" ADD CONSTRAINT "ProjectCollaboration_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
