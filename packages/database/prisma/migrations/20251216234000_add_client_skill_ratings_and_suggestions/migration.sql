-- Add client aggregate fields to UserSkillRating
ALTER TABLE "UserSkillRating"
  ADD COLUMN IF NOT EXISTS "clientAvgLevel" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clientRatingCount" INTEGER;

-- Client ratings for worker skills
CREATE TABLE IF NOT EXISTS "ClientSkillRating" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "clientCompanyId" TEXT,
  "ratedByUserId" TEXT,
  "level" INTEGER NOT NULL,
  "levelLabel" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ClientSkillRating_user_skill_idx" ON "ClientSkillRating" ("userId", "skillId");
CREATE INDEX IF NOT EXISTS "ClientSkillRating_company_idx" ON "ClientSkillRating" ("clientCompanyId");

-- User-submitted skills suggestions (moderated to become SkillDefinitions)
CREATE TABLE IF NOT EXISTS "UserSkillSuggestion" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "categoryLabel" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "UserSkillSuggestion_user_idx" ON "UserSkillSuggestion" ("userId");
CREATE INDEX IF NOT EXISTS "UserSkillSuggestion_status_idx" ON "UserSkillSuggestion" ("status");
