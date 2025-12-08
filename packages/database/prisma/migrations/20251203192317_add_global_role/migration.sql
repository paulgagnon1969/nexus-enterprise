-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('NONE', 'SUPER_ADMIN', 'SUPPORT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "globalRole" "GlobalRole" NOT NULL DEFAULT 'NONE';
