-- Create PriceListComponent table to store per-line-item component breakdowns

CREATE TABLE "PriceListComponent" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "priceListItemId" TEXT NOT NULL,
  "componentCode" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DOUBLE PRECISION,
  "material" DOUBLE PRECISION,
  "labor" DOUBLE PRECISION,
  "equipment" DOUBLE PRECISION,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PriceListComponent_priceListItemId_fkey"
    FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PriceListComponent_item_idx"
  ON "PriceListComponent"("priceListItemId");

CREATE INDEX "PriceListComponent_code_idx"
  ON "PriceListComponent"("componentCode");

CREATE UNIQUE INDEX "PLComponent_item_code_key"
  ON "PriceListComponent"("priceListItemId", "componentCode");