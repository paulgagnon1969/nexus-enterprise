import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

// ── Types ────────────────────────────────────────────────────

/** A single point-to-point measurement captured during an AR session. */
export interface ARMeasurement {
  /** Unique ID for this measurement line. */
  id: string;
  /** Start point in world coordinates (meters). */
  startPoint: { x: number; y: number; z: number };
  /** End point in world coordinates (meters). */
  endPoint: { x: number; y: number; z: number };
  /** Distance in meters. */
  distanceMeters: number;
  /** Distance in feet. */
  distanceFeet: number;
  /** Human-readable string, e.g. "8' 4\"" */
  distanceFormatted: string;
}

/** Result returned when the measurement session completes. */
export interface ARMeasureResult {
  /** Whether the device supports AR measurement. */
  supported: boolean;
  /** True if the user dismissed without saving. */
  cancelled?: boolean;
  /** Whether LiDAR was used (better accuracy). */
  usedLiDAR?: boolean;
  /** All measurements taken during the session. */
  measurements?: ARMeasurement[];
  /** Local file URI of the annotated AR screenshot. */
  screenshotUri?: string;
  /** Error message if something went wrong. */
  error?: string;
}

// ── Native module ────────────────────────────────────────────

const NexusARMeasureModule =
  Platform.OS === "ios"
    ? requireNativeModule("NexusARMeasure")
    : null;

/**
 * Check if the current device supports AR measurement.
 * Returns true on any ARKit-capable iOS device (iPhone 6s+).
 * Returns false on Android and non-AR iOS devices.
 */
export async function isARMeasureSupported(): Promise<boolean> {
  if (!NexusARMeasureModule) return false;
  try {
    return await NexusARMeasureModule.isSupported();
  } catch {
    return false;
  }
}

/**
 * Check if the current device has LiDAR (for accuracy badge in UI).
 */
export async function hasLiDAR(): Promise<boolean> {
  if (!NexusARMeasureModule) return false;
  try {
    return await NexusARMeasureModule.hasLiDAR();
  } catch {
    return false;
  }
}

/**
 * Launch the full-screen AR measurement UI.
 * User taps to place points and measure distances.
 * Returns measurements + annotated screenshot on completion.
 */
export async function startMeasurement(): Promise<ARMeasureResult> {
  if (!NexusARMeasureModule) {
    return { supported: false, error: "AR measurement is only available on iOS" };
  }
  try {
    const result = await NexusARMeasureModule.startMeasurement();
    return { supported: true, ...result };
  } catch (err: any) {
    if (err?.code === "CANCELLED" || err?.message?.includes("cancel")) {
      return { supported: true, cancelled: true };
    }
    return { supported: true, error: err?.message || String(err) };
  }
}
