-- Add premium Master Costbook modules to ModuleCatalog
-- These are ONE_TIME_PURCHASE modules that give lifetime access

INSERT INTO "ModuleCatalog" (
  "id",
  "code",
  "label",
  "description",
  "pricingModel",
  "monthlyPrice",
  "projectUnlockPrice",
  "isCore",
  "sortOrder",
  "active"
) VALUES
-- Master Costbook (BWC Cabinets, Xactimate line items, etc.)
(
  'clmcat-master-costbook',
  'MASTER_COSTBOOK',
  'Master Costbook Access',
  'Lifetime access to the Nexus Master Costbook with 50,000+ pre-priced line items including BWC Cabinets, Xactimate components, and construction materials. Includes all future updates.',
  'ONE_TIME_PURCHASE',
  NULL,  -- no monthly fee
  NULL,  -- not per-project
  false,
  100,
  true
),
-- Golden PETL (pre-built estimate templates)
(
  'clmcat-golden-petl',
  'GOLDEN_PETL',
  'Golden PETL Library',
  'Lifetime access to pre-built estimate templates (Golden PETL) for common project types. Import and customize for fast estimate creation. Includes all future templates.',
  'ONE_TIME_PURCHASE',
  NULL,
  NULL,
  false,
  101,
  true
),
-- Golden BOM (pre-built BOMs for common scopes)
(
  'clmcat-golden-bom',
  'GOLDEN_BOM',
  'Golden BOM Library',
  'Lifetime access to pre-built Bill of Materials templates for common scopes (kitchen remodel, bath remodel, roofing, etc.). Includes all future BOMs.',
  'ONE_TIME_PURCHASE',
  NULL,
  NULL,
  false,
  102,
  true
)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "pricingModel" = EXCLUDED."pricingModel",
  "active" = EXCLUDED."active",
  "sortOrder" = EXCLUDED."sortOrder";

-- Add new pricing model enum value if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'PricingModel' AND e.enumlabel = 'ONE_TIME_PURCHASE'
  ) THEN
    ALTER TYPE "PricingModel" ADD VALUE 'ONE_TIME_PURCHASE';
  END IF;
END$$;
