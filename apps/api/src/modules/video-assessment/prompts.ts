/**
 * NexLevelIntegration — AI prompt templates for video-based property assessment.
 *
 * These prompts are sent to Gemini 2.0 Flash via the Vertex AI proxy.
 * Each prompt variant is tuned for a specific assessment type.
 */

/** Shared JSON schema description embedded in all prompt variants. */
const FINDINGS_SCHEMA = `
Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "summary": {
    "narrative": "2-3 paragraph executive summary of the property condition",
    "overallCondition": 1-5,
    "confidence": 0.0-1.0,
    "materialIdentified": ["architectural shingle", "vinyl siding", ...],
    "zonesAssessed": ["ROOF", "SIDING", "GUTTERS", ...],
    "primaryCausation": "HAIL | WIND | AGE | WATER | FIRE | IMPACT | THERMAL | IMPROPER_INSTALL | SETTLING | PEST | UNKNOWN",
    "estimatedAge": "e.g. 15-20 years"
  },
  "findings": [
    {
      "zone": "ROOF | SIDING | WINDOWS | GUTTERS | FASCIA_SOFFIT | FOUNDATION | DECK_PATIO | FENCING | LANDSCAPING | INTERIOR_WALLS | INTERIOR_CEILING | INTERIOR_FLOOR | INTERIOR_CABINETS | INTERIOR_FIXTURES | PLUMBING | ELECTRICAL | HVAC | OTHER",
      "category": "MISSING_SHINGLES | CURLING | GRANULE_LOSS | HAIL_IMPACT | WIND_LIFT | ALGAE_MOSS | FLASHING | RIDGE_CAP | VALLEY | UNDERLAYMENT | DRAINAGE | CRACKING | PEELING | ROT | WATER_STAIN | MOLD | WARPING | BROKEN_SEAL | MISSING_CAULK | STRUCTURAL_SHIFT | CORROSION | INSECT_DAMAGE | EFFLORESCENCE | SPALLING | OTHER",
      "severity": "LOW | MODERATE | SEVERE | CRITICAL",
      "causation": "HAIL | WIND | AGE | WATER | FIRE | IMPACT | THERMAL | IMPROPER_INSTALL | SETTLING | PEST | UNKNOWN",
      "description": "Detailed description of the damage including location, extent, and repair implications",
      "frameIndex": 0,
      "boundingBox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
      "costbookItemCode": null,
      "estimatedQuantity": null,
      "estimatedUnit": null,
      "confidence": 0.0-1.0
    }
  ]
}`;

/** Shared rules appended to all prompt variants. */
const SHARED_RULES = `
Rules:
- Condition scale: 1=severely damaged, 2=significant wear, 3=moderate/normal, 4=good, 5=excellent/new
- For each finding, frameIndex is the 0-based index of the image where the damage is most visible
- boundingBox uses normalized coordinates (0.0-1.0) relative to the image dimensions
- If you cannot determine a bounding box, set it to null
- severity criteria:
  - LOW: cosmetic only, no structural or water intrusion risk
  - MODERATE: functional degradation, should be addressed within 1-2 years
  - SEVERE: active water intrusion risk, structural concern, needs prompt repair
  - CRITICAL: immediate safety hazard, active failure, emergency repair needed
- causation analysis patterns:
  - HAIL: random circular impact marks, dented soft metals (gutters, vents, flashing), granule displacement in random patterns
  - WIND: directional damage (missing shingles on one slope), lifted edges, creased shingles, exposed underlayment on windward side
  - AGE: uniform curling, widespread granule loss, moss/algae growth, brittleness, uniform fading
  - WATER: staining patterns, tide marks, rot along eaves/valleys, ice dam evidence, flashing failure
  - FIRE: char marks, melting, smoke staining, heat warping
  - IMPACT: localized damage, branch marks, punctures, non-circular concentrated damage
  - THERMAL: cracking from expansion/contraction, buckling, expansion gaps
  - IMPROPER_INSTALL: exposed nails, wrong overlap, misaligned shingles, improper flashing, missing kick-out diverters
  - SETTLING: diagonal cracks in foundation/walls, uneven surfaces, door/window frame distortion
  - PEST: bore holes, frass/sawdust, tunneling patterns, termite tubes
- Only report findings you can actually see in the images — do NOT fabricate damage
- If a frame shows no damage, do not create a finding for it
- estimatedUnit values: "SQ" (roofing squares), "LF" (linear feet), "SF" (square feet), "EA" (each)
- costbookItemCode: leave null for now (will be mapped in post-processing)
- Return ONLY the JSON object, nothing else`;

/**
 * Full exterior assessment prompt — for drone or handheld walkthrough
 * of the complete building exterior.
 */
export const EXTERIOR_ASSESSMENT_PROMPT = `You are an expert property damage assessor specializing in insurance restoration and construction estimating. You are analyzing a series of images extracted from a video walkthrough of a building exterior.

Analyze ALL images provided and produce a comprehensive damage assessment. Identify:

1. **Roofing**: Material type (3-tab, architectural, wood shake, metal, tile, flat/TPO/EPDM), condition, and damage
2. **Siding**: Material type (vinyl, fiber cement, stucco, brick, stone, wood), condition, and damage
3. **Windows**: Type (double-hung, casement, sliding, fixed), seal condition, frame condition
4. **Gutters & Downspouts**: Material, attachment, flow path, damage
5. **Fascia & Soffit**: Material, paint condition, rot, animal damage
6. **Foundation**: Visible cracks, spalling, efflorescence, grading issues
7. **Deck/Patio**: Material, structural condition, surface condition
8. **Landscaping/Grading**: Drainage patterns, grade slope away from foundation

For each area of damage found, classify it by zone, category, severity, and likely causation.
${FINDINGS_SCHEMA}
${SHARED_RULES}`;

/**
 * Interior assessment prompt — for handheld walkthrough of interior spaces.
 */
export const INTERIOR_ASSESSMENT_PROMPT = `You are an expert property damage assessor specializing in insurance restoration and construction estimating. You are analyzing a series of images extracted from a video walkthrough of building interior spaces.

Analyze ALL images provided and produce a comprehensive interior damage assessment. Identify:

1. **Walls**: Material (drywall, plaster, paneling, brick), paint/finish condition, cracks, water stains, mold
2. **Ceilings**: Material (drywall, popcorn, coffered, exposed), stains, sagging, cracks, mold
3. **Floors**: Material (hardwood, tile, carpet, laminate, vinyl, concrete), warping, buckling, stains, cracks
4. **Cabinets/Millwork**: Material, condition, water damage, warping, delamination
5. **Fixtures**: Condition of light fixtures, plumbing fixtures, hardware
6. **Plumbing**: Visible pipe condition, leaks, water damage indicators
7. **Electrical**: Visible wiring issues, damaged outlets/switches, burn marks
8. **HVAC**: Visible ductwork condition, vent condition, moisture around units

For each area of damage found, classify it by zone, category, severity, and likely causation.
${FINDINGS_SCHEMA}
${SHARED_RULES}`;

/**
 * Drone roof-only assessment prompt — optimized for overhead/aerial views.
 */
export const DRONE_ROOF_PROMPT = `You are an expert roofing inspector analyzing aerial drone imagery of a roof. You are looking at a series of images extracted from a drone flyover.

Focus your analysis exclusively on the roof system and immediately adjacent components:

1. **Roof field**: Shingle/material condition, pattern damage, granule loss, curling, missing pieces
2. **Ridge cap**: Alignment, seal condition, damage
3. **Valleys**: Flashing condition, debris accumulation, wear patterns
4. **Penetrations**: Pipe boots, vents, skylights — seal condition, flashing
5. **Flashing**: Drip edge, step flashing, counter flashing, kick-out diverters
6. **Gutters** (if visible from above): Debris, sagging, detachment
7. **Overall patterns**: Directional damage (wind), random damage (hail), uniform wear (age)

Pay special attention to:
- Hail damage patterns: look for random dark spots (granule displacement), dented soft metals
- Wind damage: look for missing shingles, lifted tabs, creased shingles on one slope
- Age indicators: uniform curling, moss/algae, granule accumulation in gutters

For each area of damage found, classify it by zone, category, severity, and likely causation.
${FINDINGS_SCHEMA}
${SHARED_RULES}`;

/**
 * Targeted damage documentation prompt — for close-up documentation
 * of specific known damage areas.
 */
export const TARGETED_DAMAGE_PROMPT = `You are an expert property damage assessor documenting specific damage for an insurance claim. You are analyzing close-up images of damage areas.

For each image, provide a detailed forensic analysis:

1. **Material identification**: What material is damaged and what is its approximate age/condition
2. **Damage description**: Exactly what damage is visible, its extent, and measurements relative to visible reference points
3. **Causation determination**: Based on the damage pattern, what is the most likely cause
4. **Repair scope**: What repair or replacement would be needed

Be as specific and detailed as possible — these findings may be used in insurance claim documentation.
${FINDINGS_SCHEMA}
${SHARED_RULES}`;

/** Map of assessment type to prompt */
export const ASSESSMENT_PROMPTS = {
  EXTERIOR: EXTERIOR_ASSESSMENT_PROMPT,
  INTERIOR: INTERIOR_ASSESSMENT_PROMPT,
  DRONE_ROOF: DRONE_ROOF_PROMPT,
  TARGETED: TARGETED_DAMAGE_PROMPT,
} as const;

export type AssessmentType = keyof typeof ASSESSMENT_PROMPTS;
