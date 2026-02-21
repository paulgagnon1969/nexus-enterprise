-- Seed standard RoleProfiles aligned with profileCode-based hierarchy.
-- This migration does two things:
--   1) Ensures canonical global RoleProfiles (companyId NULL) exist for each
--      profileCode used in PROFILE_LEVELS (EXECUTIVE, PM, HR, FINANCE, FOREMAN,
--      CREW, CLIENT_OWNER, CLIENT_REP).
--   2) Backfills per-company standard RoleProfiles for all existing ORGANIZATION
--      companies when a profile with the given code does not already exist.

-- 1) Canonical global RoleProfiles (companyId NULL)
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
VALUES
  ('ROLE_EXECUTIVE',      NULL, 'EXECUTIVE',      'Executive',      'Executive / leadership profile for organization-level decisions.', true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_PM',             NULL, 'PM',             'Project manager', 'Project manager profile for day-to-day job management.',        true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_SUPERINTENDENT', NULL, 'SUPERINTENDENT', 'Superintendent', 'On-site superintendent / field leadership profile.',            true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_HR',             NULL, 'HR',             'HR',              'Human resources / people operations profile.',                  true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_FINANCE',        NULL, 'FINANCE',        'Finance',         'Finance / billing / accounting profile.',                       true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_FOREMAN_STD',    NULL, 'FOREMAN',        'Foreman',         'Field foreman / supervisor profile.',                           true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_CREW_STD',       NULL, 'CREW',           'Crew',            'Field crew member profile.',                                   true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_CLIENT_OWNER',   NULL, 'CLIENT_OWNER',   'Client – owner',  'External client owner / primary decision maker.',              true, true, NULL, NOW(), NULL, NOW()),
  ('ROLE_CLIENT_REP',     NULL, 'CLIENT_REP',     'Client – representative', 'External client representative with limited authority.', true, true, NULL, NOW(), NULL, NOW())
ON CONFLICT ("id") DO NOTHING;

-- 2) Per-company standard RoleProfiles for all ORGANIZATION companies.

-- EXECUTIVE
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'EXECUTIVE_' || c."id" AS id,
  c."id" AS companyId,
  'EXECUTIVE' AS code,
  'Executive' AS label,
  'Executive / leadership profile for organization-level decisions.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_EXECUTIVE' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'EXECUTIVE'
  );

-- PM
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'PM_' || c."id" AS id,
  c."id" AS companyId,
  'PM' AS code,
  'Project manager' AS label,
  'Project manager profile for day-to-day job management.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_PM' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'PM'
  );

-- SUPERINTENDENT
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'SUPERINTENDENT_' || c."id" AS id,
  c."id" AS companyId,
  'SUPERINTENDENT' AS code,
  'Superintendent' AS label,
  'On-site superintendent / field leadership profile.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_SUPERINTENDENT' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'SUPERINTENDENT'
  );

-- HR
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'HR_' || c."id" AS id,
  c."id" AS companyId,
  'HR' AS code,
  'HR' AS label,
  'Human resources / people operations profile.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_HR' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'HR'
  );

-- FINANCE
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'FINANCE_' || c."id" AS id,
  c."id" AS companyId,
  'FINANCE' AS code,
  'Finance' AS label,
  'Finance / billing / accounting profile.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_FINANCE' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'FINANCE'
  );

-- FOREMAN
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'FOREMAN_' || c."id" AS id,
  c."id" AS companyId,
  'FOREMAN' AS code,
  'Foreman' AS label,
  'Field foreman / supervisor profile.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_FOREMAN_STD' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'FOREMAN'
  );

-- CREW
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'CREW_' || c."id" AS id,
  c."id" AS companyId,
  'CREW' AS code,
  'Crew' AS label,
  'Field crew member profile.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_CREW_STD' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'CREW'
  );

-- CLIENT_OWNER
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'CLIENT_OWNER_' || c."id" AS id,
  c."id" AS companyId,
  'CLIENT_OWNER' AS code,
  'Client – owner' AS label,
  'External client owner / primary decision maker.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_CLIENT_OWNER' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'CLIENT_OWNER'
  );

-- CLIENT_REP
INSERT INTO "RoleProfile" (
  "id", "companyId", "code", "label", "description",
  "isStandard", "active", "sourceProfileId", "createdAt", "createdBy", "updatedAt"
)
SELECT
  'CLIENT_REP_' || c."id" AS id,
  c."id" AS companyId,
  'CLIENT_REP' AS code,
  'Client – representative' AS label,
  'External client representative with limited authority.' AS description,
  true AS isStandard,
  true AS active,
  'ROLE_CLIENT_REP' AS sourceProfileId,
  NOW() AS createdAt,
  NULL AS createdBy,
  NOW() AS updatedAt
FROM "Company" c
WHERE c."kind" = 'ORGANIZATION'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleProfile" rp
    WHERE rp."companyId" = c."id" AND rp."code" = 'CLIENT_REP'
  );
