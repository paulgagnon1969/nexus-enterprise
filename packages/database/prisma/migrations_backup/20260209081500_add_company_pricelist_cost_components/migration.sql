-- Add cost component fields to CompanyPriceListItem used by tenant Cost Book search/UI.
-- Safe to apply repeatedly; guards avoid errors if a column already exists (e.g., on dev where db push was used).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CompanyPriceListItem' AND column_name = 'workersWage'
  ) THEN
    ALTER TABLE "CompanyPriceListItem" ADD COLUMN "workersWage" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CompanyPriceListItem' AND column_name = 'laborBurden'
  ) THEN
    ALTER TABLE "CompanyPriceListItem" ADD COLUMN "laborBurden" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CompanyPriceListItem' AND column_name = 'laborOverhead'
  ) THEN
    ALTER TABLE "CompanyPriceListItem" ADD COLUMN "laborOverhead" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CompanyPriceListItem' AND column_name = 'materialCost'
  ) THEN
    ALTER TABLE "CompanyPriceListItem" ADD COLUMN "materialCost" DOUBLE PRECISION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CompanyPriceListItem' AND column_name = 'equipmentCost'
  ) THEN
    ALTER TABLE "CompanyPriceListItem" ADD COLUMN "equipmentCost" DOUBLE PRECISION;
  END IF;
END $$;