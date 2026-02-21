-- Prisma schema alignment: enforce one profile + one bankInfo per onboarding session,
-- and prevent duplicate skill ratings per (sessionId, skillId).

CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingProfile_sessionId_key" ON "OnboardingProfile"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingBankInfo_sessionId_key" ON "OnboardingBankInfo"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingSkillRating_session_skill_key" ON "OnboardingSkillRating"("sessionId", "skillId");
