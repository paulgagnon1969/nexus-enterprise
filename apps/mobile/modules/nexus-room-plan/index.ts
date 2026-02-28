import { NativeModulesProxy, requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

// ── Raw element types from enhanced NexusRoomPlanModule.swift serialization ──

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface RoomPlanWall {
  id: string;
  dimensions: { width: number; height: number; length: number };
  position: Position3D;
  transform: number[]; // 4x4 column-major
}

export interface RoomPlanSurface {
  id: string;
  category: string;
  dimensions: { width: number; height: number };
  position: Position3D;
  wallId: string; // nearest wall adjacency
  transform: number[];
}

export interface RoomPlanObject {
  id: string;
  category: string;      // mapped ScanNEX fixture category
  rawCategory: string;   // raw RoomPlan enum string
  label: string;         // human-readable
  dimensions: { width: number; height: number; length: number };
  position: Position3D;
  transform: number[];
  confidence: number;
}

export interface VisionRectangle {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
  frameRegion: "ceiling" | "wall" | "floor";
  aspectRatio: number;
  relativeSize: number;
}

export interface VisionMaterial {
  type: string;
  confidence: number;
}

export interface VisionDetectionsRaw {
  roomType: string | null;
  roomTypeConfidence: number;
  sceneAttributes: Array<{ label: string; confidence: number }>;
  materials: {
    flooring: VisionMaterial | null;
    walls: VisionMaterial | null;
    ceiling: VisionMaterial | null;
  };
  detectedText: string[];
  additionalRectangles: VisionRectangle[];
  framesAnalyzed: number;
}

export interface RoomSummary {
  wallCount: number;
  doorCount: number;
  windowCount: number;
  openingCount: number;
  objectCount: number;
}

/** Full captured room data from Apple RoomPlan + Vision AI */
export interface CapturedRoomData {
  walls: RoomPlanWall[];
  doors: RoomPlanSurface[];
  windows: RoomPlanSurface[];
  openings: RoomPlanSurface[];
  objects: RoomPlanObject[];
  ceilingHeight: number;         // meters (avg wall height)
  ceilingHeightVaries: boolean;
  floorPolygon: number[][];      // [[x,z], ...] wall centers projected to XZ plane
  summary: RoomSummary;
  visionDetections: VisionDetectionsRaw;
}

export interface RoomPlanResult {
  supported: boolean;
  cancelled?: boolean;
  roomData?: CapturedRoomData;
  error?: string;
}

// Only load native module on iOS — Android has no RoomPlan
const NexusRoomPlanModule =
  Platform.OS === "ios"
    ? requireNativeModule("NexusRoomPlan")
    : null;

/**
 * Check if the current device supports RoomPlan (LiDAR).
 * Returns false on Android, non-LiDAR iOS devices, and iOS < 16.
 */
export async function isRoomPlanSupported(): Promise<boolean> {
  if (!NexusRoomPlanModule) return false;
  try {
    return await NexusRoomPlanModule.isSupported();
  } catch {
    return false;
  }
}

/**
 * Launch the RoomPlan scanning UI (full-screen native capture session).
 * Returns structured room data on completion, or { cancelled: true } if dismissed.
 * Throws on Android or unsupported devices.
 */
export async function startRoomCapture(): Promise<RoomPlanResult> {
  if (!NexusRoomPlanModule) {
    return { supported: false, error: "RoomPlan is only available on iOS with LiDAR" };
  }
  try {
    const result = await NexusRoomPlanModule.startCapture();
    return { supported: true, ...result };
  } catch (err: any) {
    if (err?.code === "CANCELLED" || err?.message?.includes("cancel")) {
      return { supported: true, cancelled: true };
    }
    return { supported: true, error: err?.message || String(err) };
  }
}
