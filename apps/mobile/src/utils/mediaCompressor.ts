import NetInfo from "@react-native-community/netinfo";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkTier = "cellular" | "wifi";

export interface CompressionConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  label: string;
}

export interface CompressedMedia {
  uri: string;
  width: number;
  height: number;
  estimatedBytes: number;
  networkTier: NetworkTier;
}

// ---------------------------------------------------------------------------
// Compression tiers
// ---------------------------------------------------------------------------

const COMPRESSION_TIERS: Record<NetworkTier, CompressionConfig> = {
  cellular: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.7,
    label: "📶 Cellular Mode",
  },
  wifi: {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.85,
    label: "📡 WiFi Mode",
  },
};

/**
 * Video quality setting for ImagePicker.
 * 0 = Low (~480p), 1 = Medium (~720p).
 */
const VIDEO_QUALITY: Record<NetworkTier, number> = {
  cellular: 0,
  wifi: 1,
};

/** Max video file size allowed for cellular upload (skip → queue for WiFi). */
const CELLULAR_VIDEO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Network detection
// ---------------------------------------------------------------------------

/**
 * Determine current network tier.
 * Returns "wifi" only when actively connected to WiFi; everything else
 * (cellular, ethernet, vpn, none, unknown) returns "cellular" to be safe.
 */
export async function getNetworkTier(): Promise<NetworkTier> {
  const state = await NetInfo.fetch();
  return state.type === "wifi" && state.isConnected ? "wifi" : "cellular";
}

/**
 * Get the compression config for the current network.
 */
export async function getNetworkCompressionConfig(): Promise<CompressionConfig> {
  const tier = await getNetworkTier();
  return COMPRESSION_TIERS[tier];
}

/**
 * Get the compression config for a specific tier (useful when you already
 * know the network state).
 */
export function getCompressionConfigForTier(tier: NetworkTier): CompressionConfig {
  return COMPRESSION_TIERS[tier];
}

/**
 * Get the label describing current compression mode (for UI display).
 */
export async function getNetworkModeLabel(): Promise<string> {
  const config = await getNetworkCompressionConfig();
  return config.label;
}

/**
 * Get ImagePicker videoQuality for current network.
 */
export async function getVideoQuality(): Promise<number> {
  const tier = await getNetworkTier();
  return VIDEO_QUALITY[tier];
}

// ---------------------------------------------------------------------------
// Image compression
// ---------------------------------------------------------------------------

/**
 * Compress an image using the network-appropriate quality tier.
 * This is the primary function screens should call instead of manually
 * choosing a compression level.
 */
export async function compressForNetwork(uri: string): Promise<CompressedMedia> {
  const tier = await getNetworkTier();
  return compressWithTier(uri, tier);
}

/**
 * Compress an image with a specific tier (useful when the network state
 * was already captured, e.g. at capture time).
 */
export async function compressWithTier(
  uri: string,
  tier: NetworkTier,
): Promise<CompressedMedia> {
  const config = COMPRESSION_TIERS[tier];

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: config.maxWidth, height: config.maxHeight } }],
    {
      compress: config.quality,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  // Get actual file size
  let estimatedBytes = 0;
  try {
    const info = await FileSystem.getInfoAsync(result.uri);
    if (info.exists && "size" in info) {
      estimatedBytes = (info as any).size ?? 0;
    }
  } catch {
    // Estimate based on dimensions and quality
    estimatedBytes = Math.round(result.width * result.height * config.quality * 0.15);
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    estimatedBytes,
    networkTier: tier,
  };
}

// ---------------------------------------------------------------------------
// Video helpers
// ---------------------------------------------------------------------------

/**
 * Generate a thumbnail from a video file.
 * Returns a JPEG URI suitable for display in the UI.
 */
export async function generateVideoThumbnail(
  videoUri: string,
  timeMs = 0,
): Promise<{ uri: string; width: number; height: number }> {
  const result = await VideoThumbnails.getThumbnailAsync(videoUri, {
    time: timeMs,
    quality: 0.5,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

/**
 * Check if a video file is small enough to upload on cellular.
 */
export async function canUploadVideoOnCellular(videoUri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(videoUri);
    if (info.exists && "size" in info) {
      return ((info as any).size ?? 0) <= CELLULAR_VIDEO_MAX_BYTES;
    }
  } catch {
    // Can't determine size — be conservative
  }
  return false;
}

/**
 * Get file size in bytes, or 0 if unknown.
 */
export async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info) {
      return (info as any).size ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

/**
 * Format bytes as a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
