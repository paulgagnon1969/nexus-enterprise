// ── ScanNEX Room Result ──────────────────────────────────────
// The structured output of a room scan. Every field is estimate-ready.
// All dimensions are in feet unless noted otherwise.

export interface ScanNEXRoomResult {
  roomId: string;
  roomName: string;
  projectId: string;
  scannedAt: string;
  deviceModel: string;
  scanMethod: "roomplan" | "manual" | "ai-extract";

  // — SF measurements —
  floorSF: number;
  ceilingSF: number;
  grossWallSF: number;
  netWallSF: number;
  ceilingHeight: number;
  ceilingHeightVaries: boolean;
  walls: ScanNEXWall[];

  // — LF measurements —
  perimeterLF: number;
  ceilingPerimeterLF: number;
  totalBaseboardLF: number;
  totalDoorTrimLF: number;
  totalWindowTrimLF: number;
  totalWindowSillLF: number;

  // — Accoutrements —
  windows: ScanNEXWindow[];
  doors: ScanNEXDoor[];
  openings: ScanNEXOpening[];
  fixtures: ScanNEXFixture[];

  // — Damage zones (user-marked) —
  affectedAreas: ScanNEXAffectedArea[];

  // — Inferred infrastructure (BOM generation) —
  infrastructure: InferredInfrastructure;

  // — Vision AI detections —
  visionDetections: VisionDetections;

  // — Raw data —
  floorPlanSVG?: string;
  meshUSDZ?: string;
  pointCloud?: string;
  photos: ScanNEXPhoto[];

  // — Enriched BOM (populated after Material Walk) —
  enrichedBOM: EnrichedLineItem[];

  // — Room-level component profiles (most common per type, from Material Walk) —
  roomProfiles: ComponentProfile[];

  // — Capture metadata —
  highResFramePaths: string[];
  lidarConfidence: number;  // 0.0–1.0; 0 if no LiDAR

  // — Sync —
  synced: boolean;
}

// ── Wall ─────────────────────────────────────────────────────

export interface ScanNEXWall {
  wallId: string;
  label: string;
  lengthLF: number;
  heightFT: number;
  grossSF: number;
  netSF: number;
  windowDeductionSF: number;
  doorDeductionSF: number;
  /** Baseboard LF = wall length minus door/opening widths on this wall */
  baseboardLF: number;
  adjacentWindowIds: string[];
  adjacentDoorIds: string[];
  adjacentOpeningIds: string[];
  /** Wall center position from RoomPlan transform (meters, for adjacency calc) */
  position: { x: number; y: number; z: number };
  /** LiDAR measurement confidence for this wall (0.0–1.0; 0 if unavailable) */
  measurementConfidence: number;
  /** Component profiles attached to this wall (baseboard, crown, casing) */
  componentProfiles: ComponentProfile[];
}

// ── Windows ──────────────────────────────────────────────────

export type WindowType =
  | "single-hung" | "double-hung" | "casement"
  | "picture" | "sliding" | "awning" | "unknown";

export interface ScanNEXWindow {
  windowId: string;
  wallId: string;
  widthFT: number;
  heightFT: number;
  areaSF: number;
  /** Casing trim LF = 2(w + h). Interior windows typically have casing on one side. */
  trimLF: number;
  /** Stool + apron sill LF = window width. Defaults present unless overridden. */
  sillLF: number;
  sillPresent: boolean;
  type: WindowType;
  position: { x: number; y: number; z: number };
}

// ── Doors ────────────────────────────────────────────────────

export type DoorType =
  | "interior" | "exterior" | "pocket" | "sliding"
  | "bifold" | "closet" | "french" | "unknown";

export interface ScanNEXDoor {
  doorId: string;
  wallId: string;
  widthFT: number;
  heightFT: number;
  areaSF: number;
  /** Casing trim LF = (2 × height) + width per side. singleSided=false doubles it. */
  trimLF: number;
  /** Whether trim is on one side only (e.g. closet) or both sides */
  singleSidedCasing: boolean;
  type: DoorType;
  swingDirection?: "left" | "right";
  position: { x: number; y: number; z: number };
}

// ── Openings ─────────────────────────────────────────────────

export type OpeningType = "archway" | "pass-through" | "cased-opening" | "unknown";

export interface ScanNEXOpening {
  openingId: string;
  wallId: string;
  widthFT: number;
  heightFT: number;
  areaSF: number;
  trimLF: number;
  type: OpeningType;
  position: { x: number; y: number; z: number };
}

// ── Fixtures (RoomPlan objects + Vision detections) ──────────

export type FixtureCategory =
  // Plumbing — general
  | "sink" | "faucet" | "toilet" | "bathtub" | "shower" | "tub-shower-combo"
  // Plumbing — bath-specific
  | "bath-sink" | "bath-faucet" | "shower-head" | "shower-valve"
  | "tub-faucet" | "tub-drain" | "bidet"
  // Kitchen
  | "stove" | "oven" | "refrigerator" | "dishwasher" | "microwave"
  | "range-hood" | "garbage-disposal"
  // Laundry
  | "washer" | "dryer"
  // Storage
  | "cabinet" | "countertop" | "shelving" | "vanity" | "closet-shelf" | "wardrobe"
  | "medicine-cabinet" | "linen-closet"
  // Mirrors
  | "mirror-fixed" | "mirror-medicine-cabinet" | "mirror-vanity"
  // Bathroom accessories
  | "towel-bar" | "towel-ring" | "towel-hook"
  | "toilet-paper-holder" | "robe-hook"
  | "soap-dish" | "soap-dispenser" | "shower-caddy"
  | "grab-bar" | "shower-door" | "shower-curtain-rod"
  // Exhaust / ventilation
  | "exhaust-fan" | "exhaust-fan-with-light" | "exhaust-fan-with-heater"
  // Furniture
  | "table" | "chair" | "sofa" | "bed" | "nightstand" | "dresser" | "desk"
  // Infrastructure
  | "fireplace" | "stairs" | "column" | "radiator"
  // Electrical
  | "outlet-standard" | "outlet-gfci" | "outlet-usb" | "outlet-240v"
  | "switch-single" | "switch-double" | "switch-triple" | "switch-dimmer"
  // Low-voltage / data
  | "data-ethernet" | "data-coax" | "data-phone" | "data-combo"
  // Lighting
  | "light-ceiling" | "light-recessed" | "light-pendant" | "light-track"
  | "light-sconce" | "light-vanity" | "light-under-cabinet" | "light-chandelier"
  | "fan-only" | "fan-with-light"
  // Safety
  | "smoke-detector" | "co-detector" | "smoke-co-combo"
  // HVAC
  | "hvac-unit" | "hvac-condenser" | "hvac-air-handler"
  | "hvac-register" | "hvac-return" | "hvac-register-floor" | "hvac-register-ceiling"
  | "thermostat" | "thermostat-smart"
  // Electrical distribution
  | "electrical-panel" | "sub-panel" | "junction-box" | "disconnect"
  // Electronics
  | "television" | "screen"
  // Other
  | "other";

/** Sub-detail for lighting fixtures — Vision AI attempts to classify bulb/style */
export type LightBulbType = "led" | "incandescent" | "fluorescent" | "halogen" | "unknown";

export interface LightingDetail {
  bulbType: LightBulbType;
  bulbCount?: number;
  /** Fan+light combos: does it include a light kit? */
  hasLightKit?: boolean;
  /** Recessed: estimated can diameter in inches */
  canSizeInches?: number;
}

export interface ScanNEXFixture {
  fixtureId: string;
  category: FixtureCategory;
  /** Human-readable name, e.g. "Kitchen Sink", "GFCI Outlet", "Ceiling Fan w/ Light" */
  label: string;
  widthFT?: number;
  heightFT?: number;
  depthFT?: number;
  linearFT?: number;
  /** Surface mount location — Vision uses position in frame to infer */
  mountLocation?: "wall" | "ceiling" | "floor";
  /** Sub-detail for lighting/fan fixtures */
  lighting?: LightingDetail;
  /** Electrical: gang count for switch/outlet boxes */
  gangCount?: number;
  detectionSource: "roomplan" | "vision" | "manual";
  detectionConfidence: number;
  position: { x: number; y: number; z: number };
  /** Raw RoomPlan category string for debugging */
  rawCategory?: string;
}

// ── Affected Areas ───────────────────────────────────────────

export interface ScanNEXAffectedArea {
  areaId: string;
  surface: "floor" | "wall" | "ceiling";
  wallId?: string;
  areaSF: number;
  perimeterLF: number;
  description?: string;
}

// ── Inferred Infrastructure ──────────────────────────────────
// Uses 3D positions of visible endpoints to estimate hidden runs.
// HVAC: unit position → register positions = duct runs.
// Electrical: PDB position → outlet/switch/light positions = wire runs.

export interface InferredInfrastructure {
  hvac: InferredHVAC;
  electrical: InferredElectrical;
  plumbing: InferredPlumbing;
}

// — HVAC —

export interface InferredHVAC {
  /** Detected HVAC unit position (from RoomPlan or manual placement) */
  unitPosition: { x: number; y: number; z: number } | null;
  /** All supply registers in this room */
  registers: InferredDuctEndpoint[];
  /** All return air grilles in this room */
  returns: InferredDuctEndpoint[];
  /** Inferred duct runs from unit to each register/return */
  ductRuns: InferredDuctRun[];
  /** Totals */
  totalDuctLF: number;
  estimatedDuctType: "flex" | "rigid" | "unknown";
}

export interface InferredDuctEndpoint {
  fixtureId: string;
  position: { x: number; y: number; z: number };
  /** Register size in inches, e.g. "4x10", "6x12", "round-6" */
  size?: string;
  mountLocation: "floor" | "ceiling" | "wall";
}

export interface InferredDuctRun {
  runId: string;
  fromId: string;  // hvac-unit fixture ID or "trunk"
  toId: string;    // register/return fixture ID
  /** Estimated run length in LF (3D distance + routing factor) */
  estimatedLF: number;
  /** Routing factor accounts for wall/ceiling routing vs straight line */
  routingFactor: number;
  ductDiameterInches?: number;
}

// — Electrical —

export type WireGauge =
  | "14/2" | "14/3"   // 15A circuits (lighting)
  | "12/2" | "12/3"   // 20A circuits (outlets, kitchen, bath)
  | "10/2" | "10/3"   // 30A circuits (dryer, large appliance)
  | "8/3"  | "6/3"    // 40-50A circuits (range, HVAC)
  | "unknown";

export interface InferredElectrical {
  /** PDB / main panel position (may be in another room — cross-room reference) */
  panelPosition: { x: number; y: number; z: number } | null;
  panelFixtureId?: string;
  /** Inferred wire runs from panel to each device */
  wireRuns: InferredWireRun[];
  /** Totals by gauge */
  wireTotalsByGauge: Record<WireGauge, number>;
  /** Estimated circuit count for this room */
  estimatedCircuitCount: number;
}

export interface InferredWireRun {
  runId: string;
  fromId: string;    // panel fixture ID
  toId: string;      // outlet/switch/light fixture ID
  /** Wire gauge inferred from device type */
  gauge: WireGauge;
  /** Estimated run length in LF (3D distance + routing through walls/ceiling) */
  estimatedLF: number;
  routingFactor: number;
  /** What type of device determines the gauge */
  deviceType: string;
  /** Can daisy-chain: multiple outlets on same circuit share one home run */
  circuitGroup?: string;
}

// — Plumbing (future: infer supply/drain runs) —

export interface InferredPlumbing {
  /** Detected wet wall positions (walls with plumbing fixtures) */
  wetWallIds: string[];
  /** Fixture positions for rough-in estimation */
  fixtureEndpoints: Array<{
    fixtureId: string;
    position: { x: number; y: number; z: number };
    requiresDrain: boolean;
    requiresHotCold: boolean;
  }>;
  /** Estimated supply line LF (hot + cold) */
  estimatedSupplyLF: number;
  /** Estimated drain/waste/vent LF */
  estimatedDrainLF: number;
}

// ── Photos ───────────────────────────────────────────────────

export interface ScanNEXPhoto {
  photoId: string;
  url: string;
  annotations: Array<{ label: string; x: number; y: number }>;
  capturedAt: string;
}

// ── Vision AI Detections ─────────────────────────────────────

export interface VisionDetections {
  /** Top room type classification, e.g. "kitchen", "bathroom" */
  roomType: string | null;
  roomTypeConfidence: number;
  /** Detected scene attributes from VNClassifyImageRequest */
  sceneAttributes: Array<{ label: string; confidence: number }>;
  /** Material suggestions for surfaces */
  materials: {
    flooring: MaterialSuggestion | null;
    walls: MaterialSuggestion | null;
    ceiling: MaterialSuggestion | null;
  };
  /** Any text detected in the room (model numbers, labels, etc.) */
  detectedText: string[];
  /** Additional rectangular features detected by Vision */
  additionalRectangles: Array<{
    id: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  /** Trim profile bands detected via contour analysis */
  trimBands: TrimBandDetection[];
}

export interface TrimBandDetection {
  trimType: "baseboard" | "crown-molding" | "chair-rail";
  /** Fraction of frame height occupied by the trim band */
  estimatedHeightFraction: number;
  confidence: number;
}

export interface MaterialSuggestion {
  type: string;
  confidence: number;
  /** Field tech can override */
  userOverride?: string;
}

// ── Unit conversion ──────────────────────────────────────────

// ── Component Profile (Material Walk output) ─────────────────────────

export type ComponentType =
  | "baseboard"
  | "crown-molding"
  | "casing"
  | "chair-rail"
  | "shoe-molding"
  | "quarter-round";

export type ProfileStyle =
  | "colonial"
  | "ranch"
  | "craftsman"
  | "ogee"
  | "cove"
  | "flat"
  | "square"
  | "beaded"
  | "shaker"
  | "custom"
  | "unknown";

export interface ComponentProfile {
  componentType: ComponentType;
  /** Measured profile height in inches (e.g., 3.5 for 3½" baseboard) */
  heightInches: number;
  /** Measured depth/projection in inches (e.g., for crown molding) */
  widthInches?: number;
  /** AI-identified profile style */
  profileStyle: ProfileStyle;
  /** AI-identified material (e.g., "MDF", "pine", "PVC", "oak") */
  material: string;
  /** AI-identified finish (e.g., "painted", "stained", "natural", "primed") */
  finish: string;
  /** AI-identified color (e.g., "white", "off-white", "natural oak") */
  color: string;
  /** How the measurement was obtained */
  measurementSource: "lidar" | "manual" | "ai-inferred";
  /** Overall confidence 0.0–1.0 */
  confidence: number;
  /** Path to close-up reference photo used for identification */
  capturePhotoUrl?: string;
  /** Xactimate line item code suggested by AI */
  xactimateCode?: string;
  /** AI-assessed condition */
  condition?: "new" | "good" | "fair" | "damaged";
}

// ── Enriched BOM Line Item ─────────────────────────────────

export type BOMCategory =
  | "baseboard"
  | "crown"
  | "casing"
  | "chair-rail"
  | "shoe-molding"
  | "flooring"
  | "wall-surface"
  | "ceiling-surface"
  | "door"
  | "window";

export interface EnrichedLineItem {
  category: BOMCategory;
  quantity: number;
  unit: "LF" | "SF" | "EA";
  /** Full description: "3½" colonial MDF baseboard, painted semi-gloss white" */
  description: string;
  profileStyle?: string;
  material?: string;
  finish?: string;
  /** Profile dimension in inches (height for baseboard, width for casing, etc.) */
  dimensionInches?: number;
  /** Closest Xactimate line item code */
  xactimateCode?: string;
  /** Combined confidence from measurement + material identification */
  confidence: number;
  /** Which walls this line item applies to */
  walls?: string[];
}

// ── Unit conversion ────────────────────────────────────────

export const METERS_TO_FEET = 3.28084;
export const FEET_TO_METERS = 0.3048;
