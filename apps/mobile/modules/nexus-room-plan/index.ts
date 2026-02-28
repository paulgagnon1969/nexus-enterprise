import { NativeModulesProxy, requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

/** Shape of a single wall/door/window from RoomPlan */
export interface RoomPlanElement {
  type?: string;
  dimensions?: { width: number; height: number; length?: number };
  transform?: number[]; // 4x4 column-major matrix
}

/** Full captured room data from Apple RoomPlan */
export interface CapturedRoomData {
  walls: RoomPlanElement[];
  doors: RoomPlanElement[];
  windows: RoomPlanElement[];
  openings: RoomPlanElement[];
  objects: RoomPlanElement[];
  roomType?: string;
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
