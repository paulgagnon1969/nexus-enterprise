-- CreateEnum
CREATE TYPE "ProjectParticipantScope" AS ENUM ('OWNER_MEMBER', 'COLLABORATOR_MEMBER', 'EXTERNAL_CONTACT');

-- CreateEnum
CREATE TYPE "ProjectVisibilityLevel" AS ENUM ('FULL', 'LIMITED', 'READ_ONLY');

-- AlterTable
ALTER TABLE "CompanyMembership" ADD COLUMN     "profileId" TEXT;

-- AlterTable
ALTER TABLE "ProjectMembership" ADD COLUMN     "scope" "ProjectParticipantScope" NOT NULL DEFAULT 'OWNER_MEMBER',
ADD COLUMN     "visibility" "ProjectVisibilityLevel" NOT NULL DEFAULT 'FULL';

-- CreateTable
CREATE TABLE "PermissionResource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PermissionResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canViewAll" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStatus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagAssignment" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionResource_code_key" ON "PermissionResource"("code");

-- CreateIndex
CREATE INDEX "RoleProfile_company_idx" ON "RoleProfile"("companyId");

-- CreateIndex
CREATE INDEX "RolePermission_profile_idx" ON "RolePermission"("profileId");

-- CreateIndex
CREATE INDEX "RolePermission_resource_idx" ON "RolePermission"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JobStatus_code_key" ON "JobStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_companyId_code_key" ON "Tag"("companyId", "code");

-- CreateIndex
CREATE INDEX "TagAssignment_entity_idx" ON "TagAssignment"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TagAssignment_tag_idx" ON "TagAssignment"("companyId", "tagId");

-- CreateIndex
CREATE INDEX "EstimateVersion_project_sequence_idx" ON "EstimateVersion"("projectId", "sequenceNo");

-- CreateIndex
CREATE INDEX "RawXactRow_estimate_line_idx" ON "RawXactRow"("estimateVersionId", "lineNo");

-- CreateIndex
CREATE INDEX "SowItem_estimate_particle_idx" ON "SowItem"("estimateVersionId", "projectParticleId");

-- CreateIndex
CREATE INDEX "SowItem_particle_idx" ON "SowItem"("projectParticleId");

-- CreateIndex
CREATE INDEX "SowItem_cat_sel_idx" ON "SowItem"("categoryCode", "selectionCode");

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RoleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleProfile" ADD CONSTRAINT "RoleProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RoleProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PermissionResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAssignment" ADD CONSTRAINT "TagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagAssignment" ADD CONSTRAINT "TagAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
