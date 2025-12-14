-- Seed initial skill categories
INSERT INTO "SkillCategory" ("id", "code", "label", "sortOrder", "active") VALUES
  ('CAT_STRUCTURAL', 'STRUCTURAL', 'Structural & framing', 10, true),
  ('CAT_ROOFING', 'ROOFING', 'Roofing', 20, true),
  ('CAT_FINISHES', 'FINISHES', 'Finishes & interiors', 30, true),
  ('CAT_MANAGEMENT', 'MANAGEMENT', 'Management & supervision', 40, true),
  ('CAT_ESTIMATING', 'ESTIMATING', 'Estimating & planning', 50, true)
ON CONFLICT ("code") DO NOTHING;

-- Seed a small set of global skills
INSERT INTO "SkillDefinition" ("id", "categoryId", "code", "label", "description", "sortOrder", "active") VALUES
  ('SKILL_FRAMING_WALLS', 'CAT_STRUCTURAL', 'FRAMING_WALLS', 'Wall framing (wood/metal)', 'Layout and install structural wall framing.', 10, true),
  ('SKILL_FRAMING_TRUSSES', 'CAT_STRUCTURAL', 'FRAMING_TRUSSES', 'Roof trusses & structural', 'Install and brace roof trusses / structural assemblies.', 20, true),
  ('SKILL_ROOFING_SHINGLES', 'CAT_ROOFING', 'ROOFING_SHINGLES', 'Asphalt shingles', 'Tear-off and install asphalt shingle roofing.', 10, true),
  ('SKILL_ROOFING_METAL', 'CAT_ROOFING', 'ROOFING_METAL', 'Metal roofing', 'Install standing seam / metal panel roofing.', 20, true),
  ('SKILL_DRYWALL', 'CAT_FINISHES', 'DRYWALL', 'Drywall hang & finish', 'Hang, tape, and finish drywall ready for paint.', 10, true),
  ('SKILL_PAINT', 'CAT_FINISHES', 'PAINT', 'Interior/exterior paint', 'Surface prep and paint/coatings.', 20, true),
  ('SKILL_PM_SITE', 'CAT_MANAGEMENT', 'PM_SITE', 'Site project management', 'Run day-to-day site operations and coordination.', 10, true),
  ('SKILL_FOREMAN_CREW', 'CAT_MANAGEMENT', 'FOREMAN_CREW', 'Crew foreman / lead', 'Lead a small field crew safely and efficiently.', 20, true),
  ('SKILL_ESTIMATING_XACT', 'CAT_ESTIMATING', 'ESTIMATING_XACTIMATE', 'Xactimate estimating', 'Prepare estimates in Xactimate / similar tools.', 10, true)
ON CONFLICT ("code") DO NOTHING;
