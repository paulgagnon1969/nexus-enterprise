-- Add stable peopleToken to User for global person-level token flows.
ALTER TABLE "User" ADD COLUMN "peopleToken" TEXT;

-- Backfill existing users with a deterministic opaque token derived from id.
UPDATE "User" SET "peopleToken" = md5("id"::text) WHERE "peopleToken" IS NULL;

-- Enforce non-null and uniqueness and ensure future inserts get a token automatically.
ALTER TABLE "User" ALTER COLUMN "peopleToken" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "peopleToken" SET DEFAULT md5((clock_timestamp()::text || random()::text));
CREATE UNIQUE INDEX "User_peopleToken_key" ON "User"("peopleToken");

-- Add optional inviter linkage on onboarding sessions for attribution.
ALTER TABLE "OnboardingSession" ADD COLUMN "invitedByUserId" TEXT;
CREATE INDEX "OnboardingSession_invited_by_idx" ON "OnboardingSession"("invitedByUserId");
