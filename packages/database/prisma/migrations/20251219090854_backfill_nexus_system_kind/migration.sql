-- CreateTable
CREATE TABLE "OrganizationTemplateRoleProfile" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationTemplateRoleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationTemplateRolePermission" (
    "id" TEXT NOT NULL,
    "templateRoleProfileId" TEXT NOT NULL,
    "resourceCode" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canViewAll" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganizationTemplateRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgTemplateRoleProfile_version_idx" ON "OrganizationTemplateRoleProfile"("templateVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateRoleProfile_templateVersionId_code_key" ON "OrganizationTemplateRoleProfile"("templateVersionId", "code");

-- CreateIndex
CREATE INDEX "OrgTemplateRolePermission_profile_idx" ON "OrganizationTemplateRolePermission"("templateRoleProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateRolePermission_templateRoleProfileId_re_key" ON "OrganizationTemplateRolePermission"("templateRoleProfileId", "resourceCode");

-- AddForeignKey
ALTER TABLE "OrganizationTemplateRoleProfile" ADD CONSTRAINT "OrganizationTemplateRoleProfile_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "OrganizationTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTemplateRolePermission" ADD CONSTRAINT "OrganizationTemplateRolePermission_templateRoleProfileId_fkey" FOREIGN KEY ("templateRoleProfileId") REFERENCES "OrganizationTemplateRoleProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: treat the canonical "Nexus System" company as the SYSTEM tenant.
UPDATE "Company" SET "kind" = 'SYSTEM' WHERE lower("name") = 'nexus system';
