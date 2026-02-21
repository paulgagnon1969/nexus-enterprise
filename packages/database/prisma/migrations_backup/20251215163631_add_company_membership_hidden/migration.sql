/*
  NOTE:
  This migration originally contained destructive schema drops unrelated to the
  intended change. For production, we only drop CompanyMembership.isHidden.
*/

-- AlterTable
ALTER TABLE "CompanyMembership" DROP COLUMN IF EXISTS "isHidden";
