import { apiFetch, apiJson } from "./client";
import type { CapturedRoomData } from "../../modules/nexus-room-plan";

export interface RoomScanResult {
  id: string;
  companyId: string;
  projectId: string;
  particleId: string | null;
  label: string | null;
  scanMode: "AI_VISION" | "LIDAR";
  status: "PROCESSING" | "COMPLETE" | "FAILED";
  photoUrls: string[] | null;
  assessmentJson: RoomAssessmentData | null;
  confidenceScore: number | null;
  errorMessage: string | null;
  notes: string | null;
  createdAt: string;
  project?: { id: string; name: string };
  particle?: { id: string; name: string; fullLabel: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string };
}

export interface RoomAssessmentData {
  roomType: string;
  estimatedDimensions: {
    lengthFt: number;
    widthFt: number;
    heightFt: number;
    sqFt: number;
  };
  features: Array<{
    type: string;
    subType?: string;
    location?: string;
    widthFt?: number;
    heightFt?: number;
    condition?: number;
    notes?: string;
  }>;
  flooring?: { type: string; condition?: number };
  ceiling?: { type: string; heightFt?: number; condition?: number };
  walls?: { material: string; condition?: number };
  damageNotes?: string[];
  overallCondition?: number;
  confidence: number;
}

/**
 * Submit room photos for AI Vision analysis.
 * Photos are uploaded as multipart form data.
 */
export async function createVisionScan(
  projectId: string,
  photos: Array<{ uri: string; name: string; mimeType: string }>,
  opts?: { particleId?: string; label?: string; notes?: string },
): Promise<RoomScanResult> {
  const form = new FormData();

  for (const photo of photos) {
    form.append("photos", {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType,
    } as any);
  }

  if (opts?.particleId) form.append("particleId", opts.particleId);
  if (opts?.label) form.append("label", opts.label);
  if (opts?.notes) form.append("notes", opts.notes);

  const res = await apiFetch(`/projects/${projectId}/room-scans/vision`, {
    method: "POST",
    body: form,
    _skipRetry: true, // FormData not re-readable
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Room scan failed: ${res.status} ${text}`);
  }

  return (await res.json()) as RoomScanResult;
}

/**
 * Submit LiDAR room data from the native RoomPlan module.
 */
export async function createLidarScan(
  projectId: string,
  lidarRoomData: CapturedRoomData,
  opts?: { particleId?: string; label?: string; notes?: string; photoUrls?: string[] },
): Promise<RoomScanResult> {
  return apiJson<RoomScanResult>(`/projects/${projectId}/room-scans/lidar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lidarRoomData,
      particleId: opts?.particleId,
      label: opts?.label,
      notes: opts?.notes,
      photoUrls: opts?.photoUrls,
    }),
  });
}

/**
 * Submit AR measurement data from a ScanNEX measurement session.
 */
export async function createMeasurementScan(
  projectId: string,
  measurements: Array<{
    id: string;
    distanceMeters: number;
    distanceFeet: number;
    distanceFormatted: string;
    label?: string;
  }>,
  opts?: {
    screenshotUri?: string;
    usedLiDAR?: boolean;
    notes?: string;
    particleId?: string;
  },
): Promise<RoomScanResult> {
  const form = new FormData();

  form.append("scanMode", "MEASUREMENT");
  form.append("measurements", JSON.stringify(measurements));
  if (opts?.usedLiDAR != null) form.append("usedLiDAR", String(opts.usedLiDAR));
  if (opts?.particleId) form.append("particleId", opts.particleId);
  if (opts?.notes) form.append("notes", opts.notes);

  if (opts?.screenshotUri) {
    form.append("photos", {
      uri: opts.screenshotUri,
      name: `scannex_measure_${Date.now()}.jpg`,
      type: "image/jpeg",
    } as any);
  }

  const res = await apiFetch(`/projects/${projectId}/room-scans/measurement`, {
    method: "POST",
    body: form,
    _skipRetry: true,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Measurement scan failed: ${res.status} ${text}`);
  }

  return (await res.json()) as RoomScanResult;
}

/** Fetch a single room scan by ID. */
export async function getRoomScan(
  projectId: string,
  scanId: string,
): Promise<RoomScanResult> {
  return apiJson<RoomScanResult>(`/projects/${projectId}/room-scans/${scanId}`);
}

/** List all room scans for a project. */
export async function listRoomScans(
  projectId: string,
): Promise<RoomScanResult[]> {
  return apiJson<RoomScanResult[]>(`/projects/${projectId}/room-scans`);
}
