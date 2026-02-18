-- Add userId column to TenantClient for client portal access
-- Multiple TenantClient records (across companies) can link to the same User,
-- enabling clients to see all their projects from any company using NEXUS.
ALTER TABLE "TenantClient" ADD COLUMN "userId" TEXT;

-- Add foreign key constraint to User
ALTER TABLE "TenantClient" ADD CONSTRAINT "TenantClient_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for efficient lookups by userId
CREATE INDEX "TenantClient_user_idx" ON "TenantClient"("userId");
