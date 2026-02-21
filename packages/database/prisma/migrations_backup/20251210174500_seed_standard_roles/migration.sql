-- Seed standard permission resources and role profiles for NCC roles/permissions alpha.

-- Permission resources
INSERT INTO "PermissionResource" ("id", "code", "label", "section", "sortOrder", "active")
VALUES
  ('org.onboarding', 'org.onboarding', 'Onboarding & candidates', 'Organization', 10, true),
  ('org.users', 'org.users', 'Users & roles', 'Organization', 20, true),
  ('org.roles', 'org.roles', 'Role profiles & permissions', 'Organization', 30, true),
  ('project.management', 'project.management', 'Project management', 'Projects', 10, true),
  ('project.dailyLogs', 'project.dailyLogs', 'Daily logs', 'Projects', 20, true)
ON CONFLICT ("code") DO NOTHING;

-- Standard global role profiles (companyId NULL)
INSERT INTO "RoleProfile"
  ("id", "companyId", "code", "label", "description", "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt")
VALUES
  ('ROLE_SUPERUSER', NULL, 'SUPERUSER', 'Superuser', 'System-wide superuser who can see and manage multiple organizations.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_OWNER', NULL, 'OWNER', 'Executive / Owner', 'Top-level executive/owner for an organization.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_TENANT_ADMIN', NULL, 'TENANT_ADMIN', 'Organization admin', 'Administrator for a single organization/tenant.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_HIRING_MANAGER', NULL, 'HIRING_MANAGER', 'Hiring manager', 'Responsible for reviewing and approving onboarding candidates.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_PROJECT_MANAGER', NULL, 'PROJECT_MANAGER', 'Project manager', 'Leads one or more projects and can recommend roles for project team members.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_FOREMAN', NULL, 'FOREMAN', 'Foreman', 'Field leader supervising crew on specific projects.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_CREW', NULL, 'CREW', 'Crew', 'Field crew member with limited system access.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_CLIENT', NULL, 'CLIENT', 'Client', 'External client user with limited read-only access.', true, true, NULL, NOW(), NULL, NOW());
