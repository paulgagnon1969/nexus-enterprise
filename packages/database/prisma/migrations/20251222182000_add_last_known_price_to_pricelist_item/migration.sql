-- Add lastKnownUnitPrice column to PriceListItem so we can
-- show previous price alongside the current Golden unitPrice.

ALTER TABLE "PriceListItem"
  ADD COLUMN "lastKnownUnitPrice" DOUBLE PRECISION;