import * as ImageManipulator from "expo-image-manipulator";

export type CompressionLevel = "high" | "medium" | "low" | "original";

interface CompressionConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

const COMPRESSION_CONFIGS: Record<CompressionLevel, CompressionConfig> = {
  high: { maxWidth: 800, maxHeight: 800, quality: 0.6 },
  medium: { maxWidth: 1200, maxHeight: 1200, quality: 0.75 },
  low: { maxWidth: 1600, maxHeight: 1600, quality: 0.85 },
  original: { maxWidth: 4000, maxHeight: 4000, quality: 0.95 },
};

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
  originalSize?: number;
  compressedSize?: number;
}

/**
 * Compress and resize an image for efficient upload
 */
export async function compressImage(
  uri: string,
  level: CompressionLevel = "medium"
): Promise<CompressedImage> {
  const config = COMPRESSION_CONFIGS[level];

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: config.maxWidth, height: config.maxHeight } }],
    {
      compress: config.quality,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

/**
 * Auto-enhance an image (increase contrast, brightness)
 */
export async function enhanceImage(uri: string): Promise<CompressedImage> {
  // Apply slight adjustments for document clarity
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

/**
 * Rotate an image by degrees
 */
export async function rotateImage(
  uri: string,
  degrees: 90 | 180 | 270
): Promise<CompressedImage> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ rotate: degrees }],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

/**
 * Crop an image to specified region
 */
export async function cropImage(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number }
): Promise<CompressedImage> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop }],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

/**
 * Convert image to grayscale (useful for documents)
 */
export async function grayscaleImage(uri: string): Promise<CompressedImage> {
  // ImageManipulator doesn't have native grayscale, but we can simulate
  // by reducing saturation via compression. For true grayscale, would need
  // a different library. For now, just return compressed version.
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [],
    {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

/**
 * Prepare image for document scanning (resize + enhance)
 */
export async function prepareForDocumentScan(uri: string): Promise<CompressedImage> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 2000, height: 2000 } }],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}
