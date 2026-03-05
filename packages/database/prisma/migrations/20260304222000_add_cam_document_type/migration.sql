-- Add CAM to DocumentTemplateType enum
ALTER TYPE "DocumentTemplateType" ADD VALUE IF NOT EXISTS 'CAM';

-- Backfill existing CAM docs that were previously synced as SOP
UPDATE "DocumentTemplate"
SET "type" = 'CAM',
    "code" = 'CAM' || substring("code" from 4)
WHERE "code" ~ '^SOP-[A-Z]{2,5}-(AUTO|INTL|INTG|VIS|SPD|ACC|CMP|COLLAB)-[0-9]{4}$';
