-- Add canonicalKeyHash for semantic identity of price list items
ALTER TABLE "PriceListItem" ADD COLUMN "canonicalKeyHash" TEXT;

-- Allow one canonical key per PriceList per revision
CREATE UNIQUE INDEX "PriceListItem_priceList_canonical_hash_key"
  ON "PriceListItem"("priceListId", "canonicalKeyHash");