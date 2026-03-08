// ---------------------------------------------------------------------------
// Enhanced Video Assessment — NexCAD Geometry-Backed Measurements
// ---------------------------------------------------------------------------
// Orchestrates the combined pipeline:
//   1. Burst-extract full-res frames around a finding's timestamp
//   2. Run photogrammetry reconstruction (USDZ → OBJ)
//   3. Analyze mesh geometry (dimensions, edges, planes)
//   4. Map measured geometry to construction estimating units
//
// The AI tells you WHAT the damage is. NexCAD tells you HOW MUCH.
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A finding from the AI vision analysis (subset of GeminiAssessmentResult) */
export interface AiFinding {
  zone: string;
  category: string;
  severity: string;
  causation: string;
  description: string;
  frameIndex: number;
  boundingBox?: { x: number; y: number; w: number; h: number } | null;
  estimatedQuantity?: number | null;
  estimatedUnit?: string | null;
  confidence: number;
}

/** Result from the burst frame extraction Rust command */
interface BurstExtractionResult {
  frames: Array<{
    index: number;
    timestamp_secs: number;
    path: string;
    width: number;
    height: number;
  }>;
  temp_dir: string;
  source_width: number;
  source_height: number;
  center_timestamp: number;
  window_secs: number;
}

/** Result from photogrammetry reconstruction */
interface PhotogrammetryResult {
  job_id: string;
  usdz_path: string;
  obj_path: string;
  detail_level: string;
  processing_secs: number;
}

/** Result from mesh analysis */
interface MeshAnalysisResult {
  job_id: string;
  analysis_path: string;
  analysis: MeshAnalysis;
}

/** Parsed mesh analysis output from trimesh */
export interface MeshAnalysis {
  success: boolean;
  error?: string;
  geometry?: {
    vertexCount: number;
    faceCount: number;
    isWatertight: boolean;
    volume: number | null;
    surfaceArea: number;
  };
  dimensions?: {
    lengthMeters: number;
    widthMeters: number;
    heightMeters: number;
    lengthInches: number;
    widthInches: number;
    heightInches: number;
  };
  dominantPlanes?: Array<{
    plane: string;
    alignedFaces: number;
    alignedAreaM2: number;
    alignedAreaFt2: number;
  }>;
  sharpEdges?: { count: number; thresholdDegrees: number };
  verySharpEdges?: { count: number; thresholdDegrees: number };
}

/** The enhanced finding with photogrammetry-backed measurements */
export interface EnhancedFinding extends AiFinding {
  /** Measured quantity from photogrammetry (replaces AI estimate) */
  measuredQuantity: number | null;
  /** Unit for measured quantity */
  measuredUnit: string | null;
  /** How the measurement was obtained */
  measurementMethod: "photogrammetry" | "ai_estimate";
  /** Raw mesh analysis data */
  meshAnalysis: MeshAnalysis | null;
  /** Processing time for the enhancement pipeline */
  enhancementMs: number;
  /** Boosted confidence when measurements come from photogrammetry */
  measuredConfidence: number;
}

export type EnhancementProgress = {
  stage: "burst" | "photogrammetry" | "analysis" | "mapping" | "complete" | "failed";
  pct: number;
  message: string;
};

// ---------------------------------------------------------------------------
// Zones and categories that can be meaningfully measured
// ---------------------------------------------------------------------------

const MEASURABLE_ZONES = new Set([
  "ROOF",
  "SIDING",
  "WINDOWS",
  "GUTTERS",
  "FASCIA_SOFFIT",
  "FOUNDATION",
  "DECK_PATIO",
  "FENCING",
  "INTERIOR_WALLS",
  "INTERIOR_CEILING",
  "INTERIOR_FLOOR",
]);

/** Categories where linear measurement (LF) is more appropriate than area (SF) */
const LINEAR_CATEGORIES = new Set([
  "CRACKING",
  "MISSING_CAULK",
  "FLASHING",
  "CORROSION",
  "EFFLORESCENCE",
]);

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

/**
 * Determine if a finding qualifies for automated enhancement.
 * Users can still manually trigger enhancement on any finding via the UI.
 */
export function shouldAutoEnhance(
  finding: AiFinding,
  videoWidth: number,
): boolean {
  // Only SEVERE or CRITICAL findings
  if (finding.severity !== "SEVERE" && finding.severity !== "CRITICAL") {
    return false;
  }
  // Only measurable zones
  if (!MEASURABLE_ZONES.has(finding.zone)) {
    return false;
  }
  // Only if the video is at least 1080p
  if (videoWidth < 1920) {
    return false;
  }
  return true;
}

/**
 * Check if this finding CAN be enhanced (less strict than auto — for manual trigger).
 */
export function canEnhance(finding: AiFinding): boolean {
  return MEASURABLE_ZONES.has(finding.zone);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full enhancement pipeline for a single finding.
 *
 * @param videoPath - Path to the source video file
 * @param finding - The AI finding to enhance
 * @param frameTimestampSecs - Actual timestamp of the finding's frame
 * @param onProgress - Progress callback for UI updates
 * @returns Enhanced finding with measured quantities, or original finding on failure
 */
export async function enhanceFinding(
  videoPath: string,
  finding: AiFinding,
  frameTimestampSecs: number,
  onProgress: (p: EnhancementProgress) => void,
): Promise<EnhancedFinding> {
  const startMs = performance.now();

  try {
    // -----------------------------------------------------------------------
    // Step 1: Burst extraction (0–20%)
    // -----------------------------------------------------------------------
    onProgress({
      stage: "burst",
      pct: 5,
      message: "Extracting full-resolution frames for 3D reconstruction...",
    });

    const burst = await invoke<BurstExtractionResult>("extract_burst_frames", {
      videoPath,
      centerTimestampSecs: frameTimestampSecs,
      windowSecs: 2.0,
      fps: 4.0,
      maxFrames: 24,
    });

    if (burst.frames.length < 3) {
      throw new Error(
        `Insufficient frames for photogrammetry (got ${burst.frames.length}, need ≥3)`,
      );
    }

    onProgress({
      stage: "burst",
      pct: 20,
      message: `Extracted ${burst.frames.length} full-res frames`,
    });

    // -----------------------------------------------------------------------
    // Step 2: Photogrammetry reconstruction (20–65%)
    // -----------------------------------------------------------------------
    onProgress({
      stage: "photogrammetry",
      pct: 22,
      message: "Reconstructing 3D mesh from overlapping frames...",
    });

    // Create a temporary job ID for the photogrammetry pipeline
    const jobId = `enhance-${Date.now()}`;

    // The burst frames are already on disk — we need to copy them to the
    // precision scan images directory format that run_photogrammetry expects.
    // We use download_scan_images with local file:// URLs.
    const frameUrls = burst.frames.map((f) => `file://${f.path}`);

    await invoke("download_scan_images", {
      jobId,
      imageUrls: frameUrls,
      apiUrl: null,
      token: null,
    });

    onProgress({
      stage: "photogrammetry",
      pct: 30,
      message: "Running photogrammetry reconstruction (reduced detail)...",
    });

    let photoResult: PhotogrammetryResult;
    try {
      photoResult = await invoke<PhotogrammetryResult>("run_photogrammetry", {
        jobId,
        detail: "reduced", // Faster for measurement — ~30s vs ~120s for full
      });
    } catch (err: any) {
      // Photogrammetry failed — likely Intel Mac or insufficient overlap
      console.warn("[enhance] photogrammetry failed:", err?.message || err);
      return fallbackResult(finding, startMs, "Photogrammetry unavailable");
    }

    onProgress({
      stage: "photogrammetry",
      pct: 65,
      message: `3D mesh built in ${Math.round(photoResult.processing_secs)}s`,
    });

    // -----------------------------------------------------------------------
    // Step 3: Mesh analysis (65–85%)
    // -----------------------------------------------------------------------
    onProgress({
      stage: "analysis",
      pct: 68,
      message: "Analyzing mesh geometry for measurements...",
    });

    let meshResult: MeshAnalysisResult;
    try {
      meshResult = await invoke<MeshAnalysisResult>("analyze_mesh", {
        jobId,
        inputFile: null, // defaults to model.obj
      });
    } catch (err: any) {
      console.warn("[enhance] mesh analysis failed:", err?.message || err);
      return fallbackResult(finding, startMs, "Mesh analysis failed");
    }

    const analysis = meshResult.analysis;
    if (!analysis.success) {
      return fallbackResult(
        finding,
        startMs,
        analysis.error || "Mesh analysis returned no data",
      );
    }

    onProgress({
      stage: "analysis",
      pct: 85,
      message: "Geometry analysis complete, mapping measurements...",
    });

    // -----------------------------------------------------------------------
    // Step 4: Map measurements to construction units (85–95%)
    // -----------------------------------------------------------------------
    onProgress({
      stage: "mapping",
      pct: 88,
      message: "Converting geometry to construction quantities...",
    });

    const { quantity, unit } = mapMeasurements(finding, analysis);
    const enhancementMs = Math.round(performance.now() - startMs);

    // Confidence boost — photogrammetry-backed measurements are more reliable
    const measuredConfidence = Math.min(finding.confidence + 0.15, 0.98);

    onProgress({
      stage: "complete",
      pct: 100,
      message: quantity
        ? `Measured: ${quantity.toFixed(1)} ${unit}`
        : "Measurement complete (no measurable area detected)",
    });

    // -----------------------------------------------------------------------
    // Cleanup burst frames (non-blocking)
    // -----------------------------------------------------------------------
    invoke("cleanup_frames", { tempDir: burst.temp_dir }).catch(() => {});
    invoke("cleanup_scan", { jobId }).catch(() => {});

    return {
      ...finding,
      measuredQuantity: quantity,
      measuredUnit: unit,
      measurementMethod: "photogrammetry",
      meshAnalysis: analysis,
      enhancementMs,
      measuredConfidence,
    };
  } catch (err: any) {
    console.error("[enhance] pipeline failed:", err);
    onProgress({
      stage: "failed",
      pct: 0,
      message: err?.message || "Enhancement failed",
    });
    return fallbackResult(
      finding,
      startMs,
      err?.message || "Enhancement failed",
    );
  }
}

// ---------------------------------------------------------------------------
// Measurement mapping
// ---------------------------------------------------------------------------

/**
 * Map raw mesh geometry to construction estimating units based on the
 * finding's zone and category.
 */
function mapMeasurements(
  finding: AiFinding,
  analysis: MeshAnalysis,
): { quantity: number | null; unit: string | null } {
  if (!analysis.dimensions || !analysis.geometry) {
    return { quantity: null, unit: null };
  }

  const dims = analysis.dimensions;
  const geo = analysis.geometry;

  // Linear damage → use longest bounding box dimension in LF
  if (LINEAR_CATEGORIES.has(finding.category)) {
    const longestInches = Math.max(
      dims.lengthInches,
      dims.widthInches,
      dims.heightInches,
    );
    const lf = longestInches / 12; // inches to feet
    if (lf > 0.5) {
      return { quantity: Math.round(lf * 10) / 10, unit: "LF" };
    }
  }

  // Roofing zones → use dominant plane area, convert to SQ if large enough
  if (finding.zone === "ROOF") {
    const roofPlane = analysis.dominantPlanes?.find(
      (p) => p.plane === "XY" || p.plane === "XZ",
    );
    const areaFt2 = roofPlane?.alignedAreaFt2 ?? geo.surfaceArea * 10.7639;
    if (areaFt2 >= 100) {
      // Report in roofing squares
      return {
        quantity: Math.round((areaFt2 / 100) * 10) / 10,
        unit: "SQ",
      };
    }
    if (areaFt2 > 1) {
      return { quantity: Math.round(areaFt2 * 10) / 10, unit: "SF" };
    }
  }

  // All other zones → surface area in SF
  // Use the dominant plane area that most likely represents the damaged surface
  const bestPlane = analysis.dominantPlanes?.[0];
  const areaFt2 = bestPlane?.alignedAreaFt2 ?? geo.surfaceArea * 10.7639;

  if (areaFt2 > 0.5) {
    return { quantity: Math.round(areaFt2 * 10) / 10, unit: "SF" };
  }

  // Individual items (windows, fixtures)
  return { quantity: 1, unit: "EA" };
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function fallbackResult(
  finding: AiFinding,
  startMs: number,
  _reason: string,
): EnhancedFinding {
  return {
    ...finding,
    measuredQuantity: finding.estimatedQuantity ?? null,
    measuredUnit: finding.estimatedUnit ?? null,
    measurementMethod: "ai_estimate",
    meshAnalysis: null,
    enhancementMs: Math.round(performance.now() - startMs),
    measuredConfidence: finding.confidence,
  };
}
