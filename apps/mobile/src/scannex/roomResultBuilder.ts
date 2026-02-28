/**
 * roomResultBuilder.ts
 *
 * Pure TypeScript transformer: CapturedRoomData (from native RoomPlan + Vision AI)
 * → ScanNEXRoomResult (estimate-ready structured data).
 *
 * Handles:
 * - Meters → feet conversion for all dimensions
 * - Wall SF (gross/net), floor SF, ceiling SF
 * - Perimeter LF, baseboard LF, trim LF, sill LF
 * - Door/window/opening deductions per wall
 * - Fixture mapping from RoomPlan objects + Vision rectangle detections
 * - Inferred HVAC duct runs and electrical wire runs for BOM generation
 * - Vision AI results merge (room type, materials, text)
 */

import { Platform } from "react-native";
import * as Device from "expo-device";
import {
  CapturedRoomData,
  RoomPlanWall,
  RoomPlanSurface,
  RoomPlanObject,
  VisionDetectionsRaw,
  VisionRectangle,
} from "../../modules/nexus-room-plan";
import {
  ScanNEXRoomResult,
  ScanNEXWall,
  ScanNEXWindow,
  ScanNEXDoor,
  ScanNEXOpening,
  ScanNEXFixture,
  VisionDetections,
  MaterialSuggestion,
  InferredInfrastructure,
  InferredHVAC,
  InferredElectrical,
  InferredPlumbing,
  InferredDuctRun,
  InferredDuctEndpoint,
  InferredWireRun,
  WireGauge,
  FixtureCategory,
  METERS_TO_FEET,
} from "./types";

// ── Public API ───────────────────────────────────────────────

export function buildScanNEXRoomResult(
  raw: CapturedRoomData,
  projectId: string,
  roomName: string,
): ScanNEXRoomResult {
  const sessionId = generateId();
  const now = new Date().toISOString();

  // 1. Build walls with conversions
  const walls = buildWalls(raw);

  // 2. Build accoutrements (doors, windows, openings) with wall adjacency
  const doors = buildDoors(raw, walls);
  const windows = buildWindows(raw, walls);
  const openings = buildOpenings(raw, walls);

  // 3. Apply deductions to walls
  applyDeductions(walls, doors, windows, openings);

  // 4. Build fixtures from RoomPlan objects + Vision detections
  const fixtures = buildFixtures(raw);

  // 5. Compute room-level totals
  const floorSF = computeFloorSF(raw.floorPolygon);
  const ceilingHeight = raw.ceilingHeight * METERS_TO_FEET;
  const ceilingSF = floorSF; // ceiling mirrors floor
  const grossWallSF = walls.reduce((sum, w) => sum + w.grossSF, 0);
  const netWallSF = walls.reduce((sum, w) => sum + w.netSF, 0);
  const perimeterLF = walls.reduce((sum, w) => sum + w.lengthLF, 0);
  const ceilingPerimeterLF = perimeterLF; // same as floor perimeter
  const totalBaseboardLF = walls.reduce((sum, w) => sum + w.baseboardLF, 0);
  const totalDoorTrimLF = doors.reduce((sum, d) => sum + d.trimLF, 0);
  const totalWindowTrimLF = windows.reduce((sum, w) => sum + w.trimLF, 0);
  const totalWindowSillLF = windows
    .filter((w) => w.sillPresent)
    .reduce((sum, w) => sum + w.sillLF, 0);

  // 6. Vision detections
  const visionDetections = buildVisionDetections(raw.visionDetections);

  // 7. Inferred infrastructure (HVAC, electrical, plumbing)
  const infrastructure = buildInfrastructure(fixtures, walls, ceilingHeight);

  return {
    roomId: sessionId,
    roomName,
    projectId,
    scannedAt: now,
    deviceModel: Device.modelName ?? "unknown",
    scanMethod: "roomplan",

    floorSF: round2(floorSF),
    ceilingSF: round2(ceilingSF),
    grossWallSF: round2(grossWallSF),
    netWallSF: round2(netWallSF),
    ceilingHeight: round2(ceilingHeight),
    ceilingHeightVaries: raw.ceilingHeightVaries,
    walls,

    perimeterLF: round2(perimeterLF),
    ceilingPerimeterLF: round2(ceilingPerimeterLF),
    totalBaseboardLF: round2(totalBaseboardLF),
    totalDoorTrimLF: round2(totalDoorTrimLF),
    totalWindowTrimLF: round2(totalWindowTrimLF),
    totalWindowSillLF: round2(totalWindowSillLF),

    windows,
    doors,
    openings,
    fixtures,

    affectedAreas: [], // user-marked later
    infrastructure,
    visionDetections,

    photos: [],
    synced: false,
  };
}

// ── Walls ────────────────────────────────────────────────────

function buildWalls(raw: CapturedRoomData): ScanNEXWall[] {
  return raw.walls.map((w, i) => {
    const lengthLF = w.dimensions.width * METERS_TO_FEET;
    const heightFT = w.dimensions.height * METERS_TO_FEET;
    const grossSF = lengthLF * heightFT;

    return {
      wallId: w.id,
      label: `Wall ${String.fromCharCode(65 + i)}`, // A, B, C...
      lengthLF: round2(lengthLF),
      heightFT: round2(heightFT),
      grossSF: round2(grossSF),
      netSF: round2(grossSF), // adjusted after deductions
      windowDeductionSF: 0,
      doorDeductionSF: 0,
      baseboardLF: round2(lengthLF), // adjusted after door/opening widths
      adjacentWindowIds: [],
      adjacentDoorIds: [],
      adjacentOpeningIds: [],
      position: w.position,
    };
  });
}

// ── Doors ────────────────────────────────────────────────────

function buildDoors(raw: CapturedRoomData, walls: ScanNEXWall[]): ScanNEXDoor[] {
  return raw.doors.map((d, i) => {
    const widthFT = d.dimensions.width * METERS_TO_FEET;
    const heightFT = d.dimensions.height * METERS_TO_FEET;
    const areaSF = widthFT * heightFT;
    // Default: two-sided casing (interior door between rooms)
    const singleSided = false;
    // Casing trim: (2 × height + width) per side
    const oneSideTrim = 2 * heightFT + widthFT;
    const trimLF = singleSided ? oneSideTrim : oneSideTrim * 2;

    return {
      doorId: d.id,
      wallId: d.wallId,
      widthFT: round2(widthFT),
      heightFT: round2(heightFT),
      areaSF: round2(areaSF),
      trimLF: round2(trimLF),
      singleSidedCasing: singleSided,
      type: "unknown" as const,
      position: d.position,
    };
  });
}

// ── Windows ──────────────────────────────────────────────────

function buildWindows(raw: CapturedRoomData, walls: ScanNEXWall[]): ScanNEXWindow[] {
  return raw.windows.map((w, i) => {
    const widthFT = w.dimensions.width * METERS_TO_FEET;
    const heightFT = w.dimensions.height * METERS_TO_FEET;
    const areaSF = widthFT * heightFT;
    // Casing trim: 2(w + h) perimeter
    const trimLF = 2 * (widthFT + heightFT);
    // Sill = window width (stool + apron), default present
    const sillLF = widthFT;

    return {
      windowId: w.id,
      wallId: w.wallId,
      widthFT: round2(widthFT),
      heightFT: round2(heightFT),
      areaSF: round2(areaSF),
      trimLF: round2(trimLF),
      sillLF: round2(sillLF),
      sillPresent: true,
      type: "unknown" as const,
      position: w.position,
    };
  });
}

// ── Openings ─────────────────────────────────────────────────

function buildOpenings(raw: CapturedRoomData, walls: ScanNEXWall[]): ScanNEXOpening[] {
  return raw.openings.map((o, i) => {
    const widthFT = o.dimensions.width * METERS_TO_FEET;
    const heightFT = o.dimensions.height * METERS_TO_FEET;
    const areaSF = widthFT * heightFT;
    // Casing trim: 2h + w (three sides — no sill)
    const trimLF = 2 * heightFT + widthFT;

    return {
      openingId: o.id,
      wallId: o.wallId,
      widthFT: round2(widthFT),
      heightFT: round2(heightFT),
      areaSF: round2(areaSF),
      trimLF: round2(trimLF),
      type: "unknown" as const,
      position: o.position,
    };
  });
}

// ── Apply Deductions ─────────────────────────────────────────

function applyDeductions(
  walls: ScanNEXWall[],
  doors: ScanNEXDoor[],
  windows: ScanNEXWindow[],
  openings: ScanNEXOpening[],
): void {
  // Map wall deductions
  for (const door of doors) {
    const wall = walls.find((w) => w.wallId === door.wallId);
    if (!wall) continue;
    wall.doorDeductionSF += door.areaSF;
    wall.adjacentDoorIds.push(door.doorId);
    // Baseboard: subtract door width (door sits on floor)
    wall.baseboardLF = round2(wall.baseboardLF - door.widthFT);
  }

  for (const win of windows) {
    const wall = walls.find((w) => w.wallId === win.wallId);
    if (!wall) continue;
    wall.windowDeductionSF += win.areaSF;
    wall.adjacentWindowIds.push(win.windowId);
    // Windows don't interrupt baseboard (above floor level)
  }

  for (const opening of openings) {
    const wall = walls.find((w) => w.wallId === opening.wallId);
    if (!wall) continue;
    wall.doorDeductionSF += opening.areaSF; // openings deduct like doors
    wall.adjacentOpeningIds.push(opening.openingId);
    // Baseboard: subtract opening width (pass-through goes to floor)
    wall.baseboardLF = round2(wall.baseboardLF - opening.widthFT);
  }

  // Finalize net SF and clamp baseboard
  for (const wall of walls) {
    wall.doorDeductionSF = round2(wall.doorDeductionSF);
    wall.windowDeductionSF = round2(wall.windowDeductionSF);
    wall.netSF = round2(wall.grossSF - wall.doorDeductionSF - wall.windowDeductionSF);
    wall.baseboardLF = round2(Math.max(0, wall.baseboardLF));
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function buildFixtures(raw: CapturedRoomData): ScanNEXFixture[] {
  const fixtures: ScanNEXFixture[] = [];

  // From RoomPlan objects (high confidence, 3D positioned)
  for (const obj of raw.objects) {
    fixtures.push({
      fixtureId: obj.id,
      category: (obj.category as FixtureCategory) || "other",
      label: obj.label,
      widthFT: round2(obj.dimensions.width * METERS_TO_FEET),
      heightFT: round2(obj.dimensions.height * METERS_TO_FEET),
      depthFT: round2(obj.dimensions.length * METERS_TO_FEET),
      detectionSource: "roomplan",
      detectionConfidence: obj.confidence,
      position: obj.position,
      rawCategory: obj.rawCategory,
    });
  }

  // From Vision rectangle detections (lower confidence, 2D only)
  if (raw.visionDetections?.additionalRectangles) {
    for (const rect of raw.visionDetections.additionalRectangles) {
      const inferred = inferFixtureFromRect(rect);
      if (inferred) {
        fixtures.push({
          fixtureId: rect.id,
          category: inferred.category,
          label: inferred.label,
          mountLocation: rect.frameRegion as "wall" | "ceiling" | "floor",
          detectionSource: "vision",
          detectionConfidence: rect.confidence,
          position: { x: 0, y: 0, z: 0 }, // 2D detection, no 3D position
        });
      }
    }
  }

  return fixtures;
}

/**
 * Infer fixture type from a Vision-detected rectangle based on
 * frame region, aspect ratio, and relative size.
 */
function inferFixtureFromRect(
  rect: VisionRectangle,
): { category: FixtureCategory; label: string } | null {
  const { frameRegion, aspectRatio, relativeSize } = rect;

  // Ceiling-mounted rectangles
  if (frameRegion === "ceiling") {
    if (relativeSize < 0.005) {
      // Small circle/square on ceiling → smoke detector or recessed light
      if (aspectRatio > 0.85 && aspectRatio <= 1.0) {
        return { category: "smoke-detector", label: "Smoke Detector" };
      }
      return { category: "light-recessed", label: "Recessed Light" };
    }
    if (relativeSize < 0.02) {
      return { category: "exhaust-fan", label: "Exhaust Fan" };
    }
    if (relativeSize < 0.05) {
      return { category: "hvac-register-ceiling", label: "Ceiling Register" };
    }
    return { category: "light-ceiling", label: "Ceiling Light" };
  }

  // Floor-mounted rectangles
  if (frameRegion === "floor") {
    if (relativeSize < 0.01) {
      return { category: "outlet-standard", label: "Floor Outlet" };
    }
    return { category: "hvac-register-floor", label: "Floor Register" };
  }

  // Wall-mounted rectangles (most detections)
  if (relativeSize < 0.003) {
    // Tiny rectangle → outlet or switch
    if (aspectRatio > 0.55 && aspectRatio < 0.75) {
      // Taller than wide → single switch/outlet cover plate
      return { category: "outlet-standard", label: "Outlet" };
    }
    if (aspectRatio >= 0.75) {
      // More square → GFCI or double gang
      return { category: "outlet-gfci", label: "GFCI Outlet" };
    }
    return { category: "switch-single", label: "Light Switch" };
  }

  if (relativeSize < 0.008) {
    // Small → thermostat, data plate, or double/triple gang
    if (aspectRatio > 0.8) {
      return { category: "thermostat", label: "Thermostat" };
    }
    return { category: "switch-double", label: "Double Switch" };
  }

  if (relativeSize < 0.03) {
    // Medium → register, mirror, panel
    if (aspectRatio < 0.5) {
      return { category: "hvac-register", label: "Wall Register" };
    }
    return { category: "mirror-fixed", label: "Wall Mirror" };
  }

  if (relativeSize < 0.08) {
    // Large wall rectangle → electrical panel, large mirror
    return { category: "electrical-panel", label: "Electrical Panel" };
  }

  // Very large or uncertain → skip
  return null;
}

// ── Vision Detections ────────────────────────────────────────

function buildVisionDetections(raw: VisionDetectionsRaw | undefined): VisionDetections {
  if (!raw) {
    return {
      roomType: null,
      roomTypeConfidence: 0,
      sceneAttributes: [],
      materials: { flooring: null, walls: null, ceiling: null },
      detectedText: [],
      additionalRectangles: [],
    };
  }

  const mapMaterial = (m: { type: string; confidence: number } | null): MaterialSuggestion | null =>
    m ? { type: m.type, confidence: m.confidence } : null;

  return {
    roomType: raw.roomType,
    roomTypeConfidence: raw.roomTypeConfidence,
    sceneAttributes: raw.sceneAttributes,
    materials: {
      flooring: mapMaterial(raw.materials.flooring),
      walls: mapMaterial(raw.materials.walls),
      ceiling: mapMaterial(raw.materials.ceiling),
    },
    detectedText: raw.detectedText,
    additionalRectangles: raw.additionalRectangles.map((r) => ({
      id: r.id,
      bounds: r.bounds,
      confidence: r.confidence,
    })),
  };
}

// ── Inferred Infrastructure ──────────────────────────────────

function buildInfrastructure(
  fixtures: ScanNEXFixture[],
  walls: ScanNEXWall[],
  ceilingHeightFT: number,
): InferredInfrastructure {
  return {
    hvac: buildHVAC(fixtures, ceilingHeightFT),
    electrical: buildElectrical(fixtures, ceilingHeightFT),
    plumbing: buildPlumbing(fixtures, walls),
  };
}

// — HVAC inference —

const HVAC_REGISTER_CATEGORIES: Set<string> = new Set([
  "hvac-register", "hvac-register-floor", "hvac-register-ceiling",
]);
const HVAC_RETURN_CATEGORIES: Set<string> = new Set(["hvac-return"]);
const HVAC_UNIT_CATEGORIES: Set<string> = new Set([
  "hvac-unit", "hvac-air-handler", "hvac-condenser",
]);

/** Default routing factor: run goes up wall + across ceiling + down to endpoint */
const DUCT_ROUTING_FACTOR = 1.4;

function buildHVAC(fixtures: ScanNEXFixture[], ceilingHeightFT: number): InferredHVAC {
  const unitFixture = fixtures.find((f) => HVAC_UNIT_CATEGORIES.has(f.category));
  const unitPos = unitFixture?.position ?? null;

  const registers: InferredDuctEndpoint[] = fixtures
    .filter((f) => HVAC_REGISTER_CATEGORIES.has(f.category))
    .map((f) => ({
      fixtureId: f.fixtureId,
      position: f.position,
      mountLocation: (f.mountLocation ?? "wall") as "floor" | "ceiling" | "wall",
    }));

  const returns: InferredDuctEndpoint[] = fixtures
    .filter((f) => HVAC_RETURN_CATEGORIES.has(f.category))
    .map((f) => ({
      fixtureId: f.fixtureId,
      position: f.position,
      mountLocation: (f.mountLocation ?? "wall") as "floor" | "ceiling" | "wall",
    }));

  // Infer duct runs from unit to each register/return
  const allEndpoints = [...registers, ...returns];
  const ductRuns: InferredDuctRun[] = unitPos
    ? allEndpoints.map((ep, i) => {
        const straightLine = distance3D(unitPos, ep.position) * METERS_TO_FEET;
        // Add ceiling height for vertical runs
        const verticalAdd = ep.mountLocation === "floor" ? ceilingHeightFT : 0;
        const estimatedLF = (straightLine + verticalAdd) * DUCT_ROUTING_FACTOR;
        return {
          runId: `duct_${i}`,
          fromId: unitFixture!.fixtureId,
          toId: ep.fixtureId,
          estimatedLF: round2(estimatedLF),
          routingFactor: DUCT_ROUTING_FACTOR,
        };
      })
    : [];

  const totalDuctLF = ductRuns.reduce((sum, r) => sum + r.estimatedLF, 0);

  return {
    unitPosition: unitPos,
    registers,
    returns,
    ductRuns,
    totalDuctLF: round2(totalDuctLF),
    estimatedDuctType: "unknown",
  };
}

// — Electrical inference —

/** Wire gauge rules based on device type */
const GAUGE_MAP: Record<string, WireGauge> = {
  // 15A circuits (14 gauge)
  "light-ceiling": "14/2",
  "light-recessed": "14/2",
  "light-pendant": "14/2",
  "light-track": "14/2",
  "light-sconce": "14/2",
  "light-vanity": "14/2",
  "light-under-cabinet": "14/2",
  "light-chandelier": "14/2",
  "fan-only": "14/2",
  "fan-with-light": "14/3", // needs 3-conductor for fan + light independent control
  "smoke-detector": "14/2",
  "co-detector": "14/2",
  "smoke-co-combo": "14/2",
  "exhaust-fan": "14/2",
  "exhaust-fan-with-light": "14/3",
  "exhaust-fan-with-heater": "12/2",

  // 20A circuits (12 gauge) — outlets, kitchen, bath
  "outlet-standard": "12/2",
  "outlet-gfci": "12/2",
  "outlet-usb": "12/2",
  "switch-single": "14/2",
  "switch-double": "14/2",
  "switch-triple": "14/2",
  "switch-dimmer": "14/2",
  "thermostat": "14/2",
  "thermostat-smart": "14/2",
  "data-ethernet": "14/2", // low voltage, but cat6 pull uses same routing
  "data-coax": "14/2",
  "data-phone": "14/2",

  // 30A circuits (10 gauge)
  "washer": "10/2",
  "dryer": "10/3",

  // 40-50A circuits
  "stove": "6/3",
  "oven": "8/3",
  "hvac-unit": "8/3",
  "hvac-air-handler": "8/3",
  "outlet-240v": "10/2",
};

const WIRE_ROUTING_FACTOR = 1.35; // up wall + through studs + across ceiling

function buildElectrical(fixtures: ScanNEXFixture[], ceilingHeightFT: number): InferredElectrical {
  const panelFixture = fixtures.find(
    (f) => f.category === "electrical-panel" || f.category === "sub-panel",
  );
  const panelPos = panelFixture?.position ?? null;

  // Only devices that need wiring
  const wireable = fixtures.filter((f) => f.category in GAUGE_MAP);

  // Group into circuits: adjacent same-gauge devices share a home run
  const circuitGroups = groupCircuits(wireable);

  const wireRuns: InferredWireRun[] = wireable.map((f, i) => {
    const gauge = GAUGE_MAP[f.category] ?? "unknown";
    const straightLine = panelPos
      ? distance3D(panelPos, f.position) * METERS_TO_FEET
      : 25; // default 25ft if no panel detected
    const verticalAdd = ceilingHeightFT; // run goes up to ceiling then over
    const estimatedLF = (straightLine + verticalAdd) * WIRE_ROUTING_FACTOR;

    return {
      runId: `wire_${i}`,
      fromId: panelFixture?.fixtureId ?? "panel_unknown",
      toId: f.fixtureId,
      gauge,
      estimatedLF: round2(estimatedLF),
      routingFactor: WIRE_ROUTING_FACTOR,
      deviceType: f.category,
      circuitGroup: circuitGroups.get(f.fixtureId),
    };
  });

  // Totals by gauge
  const wireTotalsByGauge = {} as Record<WireGauge, number>;
  for (const run of wireRuns) {
    wireTotalsByGauge[run.gauge] = (wireTotalsByGauge[run.gauge] ?? 0) + run.estimatedLF;
  }
  // Round totals
  for (const g of Object.keys(wireTotalsByGauge) as WireGauge[]) {
    wireTotalsByGauge[g] = round2(wireTotalsByGauge[g]);
  }

  // Estimate circuit count: unique circuit groups
  const uniqueCircuits = new Set(wireRuns.map((r) => r.circuitGroup).filter(Boolean));
  // Add 1 per high-amp dedicated circuit (stove, dryer, HVAC)
  const dedicatedCount = wireable.filter((f) =>
    ["stove", "oven", "dryer", "hvac-unit", "hvac-air-handler", "outlet-240v"].includes(f.category),
  ).length;

  return {
    panelPosition: panelPos,
    panelFixtureId: panelFixture?.fixtureId,
    wireRuns,
    wireTotalsByGauge,
    estimatedCircuitCount: uniqueCircuits.size + dedicatedCount,
  };
}

/**
 * Group fixtures into circuits. Same-gauge devices on the same wall
 * or nearby likely share a circuit (daisy-chained).
 */
function groupCircuits(fixtures: ScanNEXFixture[]): Map<string, string> {
  const groups = new Map<string, string>();
  let circuitNum = 0;

  // Simple grouping: cluster by gauge + proximity
  const byGauge = new Map<string, ScanNEXFixture[]>();
  for (const f of fixtures) {
    const gauge = GAUGE_MAP[f.category] ?? "unknown";
    if (!byGauge.has(gauge)) byGauge.set(gauge, []);
    byGauge.get(gauge)!.push(f);
  }

  for (const [gauge, members] of byGauge) {
    // Dedicated circuits for high-amp devices
    if (["6/3", "8/3", "10/2", "10/3"].includes(gauge)) {
      for (const f of members) {
        circuitNum++;
        groups.set(f.fixtureId, `circuit_${circuitNum}`);
      }
      continue;
    }

    // For 12/2, 14/2: group nearby fixtures (within 3m / ~10ft)
    const assigned = new Set<string>();
    for (const f of members) {
      if (assigned.has(f.fixtureId)) continue;
      circuitNum++;
      const groupId = `circuit_${circuitNum}`;
      groups.set(f.fixtureId, groupId);
      assigned.add(f.fixtureId);

      // Find neighbors within proximity
      for (const other of members) {
        if (assigned.has(other.fixtureId)) continue;
        if (distance3D(f.position, other.position) < 3.0) {
          groups.set(other.fixtureId, groupId);
          assigned.add(other.fixtureId);
        }
      }
    }
  }

  return groups;
}

// — Plumbing inference —

const PLUMBING_DRAIN_CATEGORIES: Set<string> = new Set([
  "sink", "bath-sink", "toilet", "bathtub", "shower", "tub-shower-combo",
  "tub-drain", "dishwasher", "washer", "bidet",
]);
const PLUMBING_HOT_COLD_CATEGORIES: Set<string> = new Set([
  "sink", "bath-sink", "faucet", "bath-faucet", "bathtub", "shower",
  "tub-shower-combo", "tub-faucet", "shower-head", "shower-valve",
  "dishwasher", "washer",
]);

function buildPlumbing(fixtures: ScanNEXFixture[], walls: ScanNEXWall[]): InferredPlumbing {
  const plumbingFixtures = fixtures.filter(
    (f) => PLUMBING_DRAIN_CATEGORIES.has(f.category) || PLUMBING_HOT_COLD_CATEGORIES.has(f.category),
  );

  // Identify wet walls: walls closest to plumbing fixtures
  const wetWallIds = new Set<string>();
  for (const f of plumbingFixtures) {
    const nearest = findNearestWall(f.position, walls);
    if (nearest) wetWallIds.add(nearest);
  }

  const fixtureEndpoints = plumbingFixtures.map((f) => ({
    fixtureId: f.fixtureId,
    position: f.position,
    requiresDrain: PLUMBING_DRAIN_CATEGORIES.has(f.category),
    requiresHotCold: PLUMBING_HOT_COLD_CATEGORIES.has(f.category),
  }));

  // Rough estimate: 8ft supply per fixture, 6ft drain per fixture
  const hotColdCount = fixtureEndpoints.filter((f) => f.requiresHotCold).length;
  const drainCount = fixtureEndpoints.filter((f) => f.requiresDrain).length;

  return {
    wetWallIds: Array.from(wetWallIds),
    fixtureEndpoints,
    estimatedSupplyLF: round2(hotColdCount * 8 * 2), // hot + cold
    estimatedDrainLF: round2(drainCount * 6),
  };
}

// ── Floor Area (Shoelace Formula) ────────────────────────────

function computeFloorSF(polygon: number[][]): number {
  if (!polygon || polygon.length < 3) return 0;

  // Shoelace formula for polygon area (vertices in XZ plane, meters)
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  area = Math.abs(area) / 2;

  // Convert m² → ft²
  return area * METERS_TO_FEET * METERS_TO_FEET;
}

// ── Utility ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function distance3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function findNearestWall(
  pos: { x: number; y: number; z: number },
  walls: ScanNEXWall[],
): string | null {
  let nearest: string | null = null;
  let minDist = Infinity;
  for (const wall of walls) {
    const d = distance3D(pos, wall.position);
    if (d < minDist) {
      minDist = d;
      nearest = wall.wallId;
    }
  }
  return nearest;
}
