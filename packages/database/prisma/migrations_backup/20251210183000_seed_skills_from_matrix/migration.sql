-- Seed additional skills based on Skills Matrix ALL.csv job roles

-- General / structural
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_GENERAL_LABORER', 'CAT_STRUCTURAL', 'ROLE_GENERAL_LABORER', 'General laborer', 'General construction labor support.', 10, true),
  ('SKILL_ROLE_CARPENTER_ROUGH', 'CAT_STRUCTURAL', 'ROLE_CARPENTER_ROUGH', 'Carpenter – rough/framing', 'Rough carpentry and structural framing.', 20, true),
  ('SKILL_ROLE_CARPENTER_FINISH', 'CAT_STRUCTURAL', 'ROLE_CARPENTER_FINISH', 'Carpenter – finish/trim', 'Finish carpentry, trim, and casework.', 30, true),
  ('SKILL_ROLE_FRAMER_WOOD', 'CAT_STRUCTURAL', 'ROLE_FRAMER_WOOD', 'Framer – wood (stick)', 'Stick framing with dimensional lumber.', 40, true),
  ('SKILL_ROLE_FRAMER_METAL', 'CAT_STRUCTURAL', 'ROLE_FRAMER_LIGHT_GAUGE', 'Framer – light-gauge metal stud', 'Light-gauge metal stud framing.', 50, true),
  ('SKILL_ROLE_CONCRETE_FLATWORK', 'CAT_STRUCTURAL', 'ROLE_CONCRETE_FLATWORK', 'Concrete flatwork finisher', 'Place and finish concrete flatwork.', 60, true),
  ('SKILL_ROLE_CONCRETE_FORMWORK', 'CAT_STRUCTURAL', 'ROLE_CONCRETE_FORMWORK', 'Concrete formwork carpenter', 'Build and strip concrete forms.', 70, true),
  ('SKILL_ROLE_CONCRETE_PUMPER', 'CAT_STRUCTURAL', 'ROLE_CONCRETE_PUMPER', 'Concrete pumper / placement', 'Operate pump and place concrete.', 80, true),
  ('SKILL_ROLE_REBAR_INSTALLER', 'CAT_STRUCTURAL', 'ROLE_REBAR_INSTALLER', 'Rebar installer', 'Install reinforcing steel.', 90, true),
  ('SKILL_ROLE_MASON_BRICK_BLOCK', 'CAT_STRUCTURAL', 'ROLE_MASON_BRICK_BLOCK', 'Mason – brick / block', 'Install brick and block masonry.', 100, true)
ON CONFLICT ("code") DO NOTHING;

-- Drywall & finishes (mapped to FINISHES category)
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_DRYWALL_HANGER', 'CAT_FINISHES', 'ROLE_DRYWALL_HANGER', 'Drywall hanger', 'Hang gypsum board.', 10, true),
  ('SKILL_ROLE_DRYWALL_TAPER', 'CAT_FINISHES', 'ROLE_DRYWALL_TAPER', 'Drywall taper (hand & bazooka)', 'Tape and mud joints by hand or bazooka.', 20, true),
  ('SKILL_ROLE_DRYWALL_FLOATER', 'CAT_FINISHES', 'ROLE_DRYWALL_FLOATER', 'Drywall floater / skim coater', 'Skim coat and float drywall surfaces.', 30, true),
  ('SKILL_ROLE_DRYWALL_FINISHER', 'CAT_FINISHES', 'ROLE_DRYWALL_FINISHER', 'Drywall finisher (Level 4–5)', 'High-finish drywall finishing (Level 4–5).', 40, true),
  ('SKILL_ROLE_PAINTER_BRUSH_ROLL', 'CAT_FINISHES', 'ROLE_PAINTER_BRUSH_ROLL', 'Painter – brush/roll', 'Brush and roller paint application.', 50, true),
  ('SKILL_ROLE_PAINTER_SPRAY', 'CAT_FINISHES', 'ROLE_PAINTER_SPRAY', 'Painter – spray (airless/HVLP)', 'Spray application using airless/HVLP.', 60, true)
ON CONFLICT ("code") DO NOTHING;

-- Roofing
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_ROOFER_SHINGLES', 'CAT_ROOFING', 'ROLE_ROOFER_SHINGLES', 'Roofer – asphalt shingles', 'Install asphalt shingle roofing.', 10, true),
  ('SKILL_ROLE_ROOFER_METAL', 'CAT_ROOFING', 'ROLE_ROOFER_METAL', 'Roofer – metal (standing seam, etc.)', 'Install standing seam and metal roofing.', 20, true),
  ('SKILL_ROLE_ROOFER_SINGLE_PLY', 'CAT_ROOFING', 'ROLE_ROOFER_SINGLE_PLY', 'Roofer – single-ply (TPO/EPDM)', 'Install single-ply roofing systems.', 30, true),
  ('SKILL_ROLE_ROOFER_TILE_SLATE', 'CAT_ROOFING', 'ROLE_ROOFER_TILE_SLATE', 'Roofer – tile / slate', 'Install tile and slate roofing.', 40, true),
  ('SKILL_ROLE_ROOFER_LOW_SLOPE', 'CAT_ROOFING', 'ROLE_ROOFER_LOW_SLOPE', 'Roofer – low-slope / built-up', 'Install low-slope and built-up roofing.', 50, true)
ON CONFLICT ("code") DO NOTHING;

-- Siding & exterior
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_SIDING_VINYL_FIBER', 'CAT_STRUCTURAL', 'ROLE_SIDING_VINYL_FIBER', 'Siding installer – vinyl / fiber cement', 'Install vinyl and fiber cement siding.', 110, true),
  ('SKILL_ROLE_SIDING_WOOD_COMPOSITE', 'CAT_STRUCTURAL', 'ROLE_SIDING_WOOD_COMPOSITE', 'Siding installer – wood / composite', 'Install wood and composite siding.', 120, true),
  ('SKILL_ROLE_EXTERIOR_TRIM', 'CAT_STRUCTURAL', 'ROLE_EXTERIOR_TRIM', 'Exterior trim & soffit/fascia', 'Install exterior trim, soffit, and fascia.', 130, true),
  ('SKILL_ROLE_WINDOW_DOOR_INSTALLER', 'CAT_STRUCTURAL', 'ROLE_WINDOW_DOOR_INSTALLER', 'Window & exterior door installer', 'Install exterior windows and doors.', 140, true),
  ('SKILL_ROLE_GLAZIER_CURTAIN_WALL', 'CAT_STRUCTURAL', 'ROLE_GLAZIER_CURTAIN_WALL', 'Glazier – commercial curtain wall', 'Install commercial curtain wall glazing.', 150, true)
ON CONFLICT ("code") DO NOTHING;

-- MEP & welding
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_ELECTRICIAN', 'CAT_STRUCTURAL', 'ROLE_ELECTRICIAN', 'Electrician', 'Electrical rough-in and trim.', 160, true),
  ('SKILL_ROLE_PLUMBER_PIPEFITTER', 'CAT_STRUCTURAL', 'ROLE_PLUMBER_PIPEFITTER', 'Plumber / pipefitter', 'Plumbing and pipefitting work.', 170, true),
  ('SKILL_ROLE_HVAC_SHEET_METAL', 'CAT_STRUCTURAL', 'ROLE_HVAC_SHEET_METAL', 'HVAC / sheet metal', 'Install ductwork and HVAC systems.', 180, true),
  ('SKILL_ROLE_WELDER_STRUCTURAL_PIPE', 'CAT_STRUCTURAL', 'ROLE_WELDER_STRUCTURAL_PIPE', 'Welder – structural / pipe', 'Structural and pipe welding.', 190, true)
ON CONFLICT ("code") DO NOTHING;

-- Equipment
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_HEAVY_EQUIPMENT_OPERATOR', 'CAT_STRUCTURAL', 'ROLE_HEAVY_EQUIPMENT_OPERATOR', 'Heavy equipment operator', 'Operate heavy construction equipment.', 200, true),
  ('SKILL_ROLE_CRANE_OPERATOR', 'CAT_STRUCTURAL', 'ROLE_CRANE_OPERATOR', 'Crane operator (NCCCO)', 'Operate cranes (NCCCO certified).', 210, true)
ON CONFLICT ("code") DO NOTHING;

-- Management & safety
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_ROLE_FOREMAN_LEADMAN', 'CAT_MANAGEMENT', 'ROLE_FOREMAN_LEADMAN', 'Foreman / leadman', 'Field foreman / lead for small crews.', 10, true),
  ('SKILL_ROLE_SUPERINTENDENT', 'CAT_MANAGEMENT', 'ROLE_SUPERINTENDENT', 'Superintendent', 'Site superintendent overseeing projects.', 20, true),
  ('SKILL_ROLE_PROJECT_MANAGER', 'CAT_MANAGEMENT', 'ROLE_PROJECT_MANAGER', 'Project manager', 'Project management and coordination.', 30, true),
  ('SKILL_ROLE_SAFETY_MANAGER', 'CAT_MANAGEMENT', 'ROLE_SAFETY_MANAGER', 'Safety manager', 'Lead safety and OSHA compliance.', 40, true)
ON CONFLICT ("code") DO NOTHING;
