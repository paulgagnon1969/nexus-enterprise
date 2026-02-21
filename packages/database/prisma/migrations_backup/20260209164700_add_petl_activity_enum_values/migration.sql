-- AlterEnum: Add missing PetlActivity enum values
-- These values are used for activity-based cost component breakdowns in reconciliation entries

-- Add REPAIR activity (F) - labor + material (reduced)
ALTER TYPE "PetlActivity" ADD VALUE IF NOT EXISTS 'REPAIR';

-- Add INSTALL_ONLY activity (I) - labor + equipment
ALTER TYPE "PetlActivity" ADD VALUE IF NOT EXISTS 'INSTALL_ONLY';
