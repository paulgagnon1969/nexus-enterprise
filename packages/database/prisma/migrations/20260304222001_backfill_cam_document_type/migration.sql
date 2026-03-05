-- Backfill existing CAM docs that were previously synced as SOP
-- (split from 20260304222000 to avoid Postgres enum-in-same-txn issue)
UPDATE "DocumentTemplate"
SET "type" = 'CAM',
    "code" = 'CAM' || substring("code" from 4)
WHERE "code" ~ '^SOP-[A-Z]{2,5}-(AUTO|INTL|INTG|VIS|SPD|ACC|CMP|COLLAB)-[0-9]{4}$';
