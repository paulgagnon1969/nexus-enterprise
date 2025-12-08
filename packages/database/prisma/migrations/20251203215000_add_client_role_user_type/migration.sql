-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INTERNAL', 'CLIENT');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "userType" "UserType" NOT NULL DEFAULT 'INTERNAL';
