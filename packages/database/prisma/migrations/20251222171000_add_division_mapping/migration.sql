-- Add CSI-style Division and CatDivision mapping tables

-- CreateTable: Division (01-16 construction divisions)
CREATE TABLE "Division" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- Ensure codes are unique
CREATE UNIQUE INDEX "Division_code_key" ON "Division" ("code");

-- CreateTable: CatDivision (global Cat -> Division mapping)
CREATE TABLE "CatDivision" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "cat" TEXT NOT NULL,
  "divisionCode" TEXT NOT NULL
);

-- One mapping per Cat code
CREATE UNIQUE INDEX "CatDivision_cat_key" ON "CatDivision" ("cat");

-- Fast lookup of all Cats for a given division
CREATE INDEX "CatDivision_division_code_idx" ON "CatDivision" ("divisionCode");

-- Foreign key from CatDivision.divisionCode -> Division.code
ALTER TABLE "CatDivision"
  ADD CONSTRAINT "CatDivision_divisionCode_fkey"
  FOREIGN KEY ("divisionCode") REFERENCES "Division" ("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed 16 standard CSI divisions
INSERT INTO "Division" ("id", "code", "name", "sortOrder") VALUES
  ('DIV_01', '01', 'General Requirements', 1),
  ('DIV_02', '02', 'Existing Conditions/Site Work', 2),
  ('DIV_03', '03', 'Concrete', 3),
  ('DIV_04', '04', 'Masonry', 4),
  ('DIV_05', '05', 'Metals', 5),
  ('DIV_06', '06', 'Wood, Plastics, and Composites', 6),
  ('DIV_07', '07', 'Thermal and Moisture Protection', 7),
  ('DIV_08', '08', 'Openings (Doors and Windows)', 8),
  ('DIV_09', '09', 'Finishes', 9),
  ('DIV_10', '10', 'Specialties', 10),
  ('DIV_11', '11', 'Equipment', 11),
  ('DIV_12', '12', 'Furnishings', 12),
  ('DIV_13', '13', 'Special Construction', 13),
  ('DIV_14', '14', 'Conveying Equipment', 14),
  ('DIV_15', '15', 'Mechanical (HVAC, Plumbing)', 15),
  ('DIV_16', '16', 'Electrical', 16);

-- Seed Cat -> Division mappings from Xactimate mapping doc
INSERT INTO "CatDivision" ("id", "cat", "divisionCode") VALUES
  ('CAT_ACC', 'ACC', '13'), -- Mobile home accessories
  ('CAT_ACT', 'ACT', '09'), -- Acoustical treatments
  ('CAT_AMA', 'AMA', '11'), -- Auto/motorcycle accessories
  ('CAT_ANT', 'ANT', '12'), -- Antiques
  ('CAT_APM', 'APM', '15'), -- Portable air conditioners/heaters
  ('CAT_APP', 'APP', '11'), -- Kitchen appliances
  ('CAT_APS', 'APS', '11'), -- Small appliances / air purifiers
  ('CAT_ARC', 'ARC', '12'), -- Fine art services
  ('CAT_ART', 'ART', '12'), -- Artwork and paintings
  ('CAT_AWN', 'AWN', '13'), -- Awnings and patio covers
  ('CAT_BGE', 'BGE', '11'), -- Business/agricultural equipment
  ('CAT_BMP', 'BMP', '12'), -- Books and media
  ('CAT_CAB', 'CAB', '06'), -- Cabinetry and wood panels
  ('CAT_CAP', 'CAP', '01'), -- Appliance cleaning
  ('CAT_CAS', 'CAS', '01'), -- Cash and securities
  ('CAT_CCE', 'CCE', '16'), -- Camera and film equipment
  ('CAT_CDC', 'CDC', '01'), -- Textile cleaning
  ('CAT_CEL', 'CEL', '01'), -- Electronics cleaning
  ('CAT_CGN', 'CGN', '01'), -- General cleaning
  ('CAT_CHF', 'CHF', '01'), -- Furniture cleaning
  ('CAT_CLH', 'CLH', '01'), -- Clothing cleaning
  ('CAT_CLM', 'CLM', '01'), -- Lamp cleaning
  ('CAT_CLN', 'CLN', '01'), -- Structural cleaning
  ('CAT_CMP', 'CMP', '16'), -- Computer hardware
  ('CAT_CNC', 'CNC', '03'), -- Concrete
  ('CAT_CON', 'CON', '01'), -- Content manipulation
  ('CAT_CPS', 'CPS', '01'), -- Packing and storage
  ('CAT_CRD', 'CRD', '01'), -- Credit-related
  ('CAT_CUP', 'CUP', '01'), -- Upholstery cleaning
  ('CAT_CWH', 'CWH', '01'), -- Wall hanging cleaning
  ('CAT_DMO', 'DMO', '02'), -- Demolition
  ('CAT_DOC', 'DOC', '10'), -- Documents and records
  ('CAT_DOR', 'DOR', '08'), -- Doors
  ('CAT_DRY', 'DRY', '09'), -- Drywall
  ('CAT_ELC', 'ELC', '16'), -- Electronics
  ('CAT_ELE', 'ELE', '16'), -- Electrical
  ('CAT_ELS', 'ELS', '16'), -- Electronic systems
  ('CAT_EQA', 'EQA', '11'), -- Agricultural equipment
  ('CAT_EQC', 'EQC', '11'), -- Commercial/athletic equipment
  ('CAT_EXC', 'EXC', '02'), -- Excavation
  ('CAT_FCC', 'FCC', '09'), -- Carpet flooring
  ('CAT_FCR', 'FCR', '09'), -- Resilient/rubber flooring
  ('CAT_FCS', 'FCS', '09'), -- Stone flooring
  ('CAT_FCT', 'FCT', '09'), -- Tile flooring
  ('CAT_FCV', 'FCV', '09'), -- Vinyl flooring
  ('CAT_FCW', 'FCW', '09'), -- Wood flooring
  ('CAT_FEC', 'FEC', '01'), -- Recycling fees
  ('CAT_FEE', 'FEE', '01'), -- Testing fees
  ('CAT_FEN', 'FEN', '05'), -- Fencing (metal)
  ('CAT_FNC', 'FNC', '06'), -- Finish carpentry/trim
  ('CAT_FNH', 'FNH', '10'), -- Bath accessories/hardware
  ('CAT_FPL', 'FPL', '13'), -- Fireplaces and chimneys
  ('CAT_FPS', 'FPS', '10'), -- Fire suppression systems
  ('CAT_FRM', 'FRM', '06'), -- Framing lumber
  ('CAT_FRN', 'FRN', '12'), -- Furniture
  ('CAT_GLS', 'GLS', '08'), -- Glazing
  ('CAT_GUN', 'GUN', '11'), -- Guns and ammo
  ('CAT_HDF', 'HDF', '12'), -- Housewares (dinnerware, etc.)
  ('CAT_HLT', 'HLT', '11'), -- Health devices
  ('CAT_HMR', 'HMR', '01'), -- Hazardous materials remediation
  ('CAT_HOB', 'HOB', '12'), -- Hobby items
  ('CAT_HSW', 'HSW', '12'), -- Housewares
  ('CAT_HVC', 'HVC', '15'), -- HVAC systems
  ('CAT_INF', 'INF', '12'), -- Infant items
  ('CAT_INS', 'INS', '07'), -- Insulation
  ('CAT_LAB', 'LAB', '01'), -- Labor charges
  ('CAT_LIT', 'LIT', '16'), -- Lighting
  ('CAT_LND', 'LND', '02'), -- Landscaping
  ('CAT_MAS', 'MAS', '04'), -- Masonry blocks
  ('CAT_MBL', 'MBL', '04'), -- Marble/granite
  ('CAT_MPR', 'MPR', '07'), -- Moisture barriers/caulking
  ('CAT_MSD', 'MSD', '08'), -- Mirrors and shower doors
  ('CAT_MSK', 'MSK', '13'), -- Mobile home setup/skirting
  ('CAT_MTL', 'MTL', '05'), -- Metal structures
  ('CAT_ORI', 'ORI', '05'), -- Ornamental iron
  ('CAT_PER', 'PER', '09'), -- Paint and stain materials
  ('CAT_PLA', 'PLA', '09'), -- Plaster and lath
  ('CAT_PLM', 'PLM', '15'), -- Plumbing
  ('CAT_PNL', 'PNL', '09'), -- Wall paneling
  ('CAT_PNT', 'PNT', '09'), -- Painting services
  ('CAT_POL', 'POL', '13'), -- Pools and spas
  ('CAT_RFG', 'RFG', '07'), -- Roofing
  ('CAT_SCF', 'SCF', '01'), -- Scaffolding
  ('CAT_SDG', 'SDG', '07'), -- Siding
  ('CAT_SFG', 'SFG', '07'), -- Soffit/fascia/gutters
  ('CAT_SPE', 'SPE', '11'), -- Specialty equipment
  ('CAT_STJ', 'STJ', '05'), -- Steel joists
  ('CAT_STL', 'STL', '05'), -- Steel channels/components
  ('CAT_STR', 'STR', '06'), -- Stairways
  ('CAT_STU', 'STU', '09'), -- Stucco
  ('CAT_TBA', 'TBA', '10'), -- Toilet and bath accessories
  ('CAT_TCR', 'TCR', '01'), -- Trauma/crime scene
  ('CAT_TIL', 'TIL', '09'), -- Tile work
  ('CAT_TMB', 'TMB', '06'), -- Timber beams
  ('CAT_TMP', 'TMP', '01'), -- Temporary repairs/board-ups
  ('CAT_USR', 'USR', '01'), -- Generic bid items
  ('CAT_VTC', 'VTC', '01'), -- Valuation totals
  ('CAT_WDA', 'WDA', '08'), -- Aluminum windows
  ('CAT_WDP', 'WDP', '08'), -- Patio doors
  ('CAT_WDR', 'WDR', '08'), -- Window repairs
  ('CAT_WDS', 'WDS', '08'), -- Skylights
  ('CAT_WDT', 'WDT', '12'), -- Window treatments
  ('CAT_WDV', 'WDV', '08'), -- Vinyl windows
  ('CAT_WDW', 'WDW', '08'), -- Wood windows
  ('CAT_WPR', 'WPR', '09'), -- Wallpaper
  ('CAT_WTR', 'WTR', '01'), -- Water damage removal
  ('CAT_XST', 'XST', '13');  -- Exterior structures
