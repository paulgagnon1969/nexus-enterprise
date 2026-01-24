-- Add isActive flag to company memberships so tenants can deactivate a worker
-- without deleting their global Nexus System identity.

ALTER TABLE "CompanyMembership"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
