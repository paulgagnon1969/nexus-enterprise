-- Add divisionCode to PriceListItem and enforce FK to Division.code
ALTER TABLE "PriceListItem"
  ADD COLUMN "divisionCode" TEXT;

ALTER TABLE "PriceListItem"
  ADD CONSTRAINT "PriceListItem_divisionCode_fkey"
  FOREIGN KEY ("divisionCode") REFERENCES "Division"("code")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PriceListItem_division_code_idx"
  ON "PriceListItem"("divisionCode");