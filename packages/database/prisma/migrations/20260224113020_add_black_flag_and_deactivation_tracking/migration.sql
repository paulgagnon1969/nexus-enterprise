-- AlterTable
ALTER TABLE "CompanyMembership" ADD COLUMN     "blackFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "black_flag_reason" TEXT,
ADD COLUMN     "black_flagged_at" TIMESTAMP(3),
ADD COLUMN     "black_flagged_by_user_id" TEXT,
ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deactivated_by_user_id" TEXT;
