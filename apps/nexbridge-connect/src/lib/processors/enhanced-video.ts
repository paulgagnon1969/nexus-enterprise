// ---------------------------------------------------------------------------
// Processor: enhanced-video-assessment
// ---------------------------------------------------------------------------
// Mesh DCM processor that runs the full enhanced video assessment pipeline:
//   burst extraction → photogrammetry → mesh analysis → measurement mapping
//
// Requires canVideoProcess AND canPrecisionScan capabilities (ARM64 Mac).
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { enhanceFinding, type AiFinding } from "../enhanced-assessment";
import type { JobProcessor } from "../mesh-job-runner";

interface EnhancedVideoPayload {
  /** Path or presigned URL to the video file */
  videoUrl: string;
  /** Timestamp of the frame where the finding was identified */
  frameTimestampSecs: number;
  /** The AI finding to enhance with measurements */
  finding: AiFinding;
  /** Burst extraction window (default: 2.0 seconds) */
  windowSecs?: number;
}

export const enhancedVideoProcessor: JobProcessor = {
  canHandle(type: string): boolean {
    return type === "enhanced-video-assessment";
  },

  async process(
    jobId: string,
    _type: string,
    payload: Record<string, unknown>,
    onProgress: (pct: number, message?: string) => void,
  ): Promise<Record<string, unknown>> {
    const p = payload as unknown as EnhancedVideoPayload;

    onProgress(5, "Starting enhanced video assessment pipeline");

    // If the video is a URL (presigned), download it first
    let localVideoPath = p.videoUrl;
    if (p.videoUrl.startsWith("http://") || p.videoUrl.startsWith("https://")) {
      onProgress(5, "Downloading video for local processing...");
      // Download to a temp file
      const tempPath = await invoke<string>("download_temp_file", {
        url: p.videoUrl,
        prefix: "enhance-video",
      }).catch(() => null);

      if (!tempPath) {
        throw new Error("Failed to download video for local processing");
      }
      localVideoPath = tempPath;
    }

    // Run the enhancement pipeline
    const result = await enhanceFinding(
      localVideoPath,
      p.finding,
      p.frameTimestampSecs,
      (progress) => {
        onProgress(progress.pct, progress.message);
      },
    );

    onProgress(100, "Enhanced video assessment complete");

    return {
      jobId,
      measuredQuantity: result.measuredQuantity,
      measuredUnit: result.measuredUnit,
      measurementMethod: result.measurementMethod,
      meshAnalysis: result.meshAnalysis,
      enhancementMs: result.enhancementMs,
      measuredConfidence: result.measuredConfidence,
    };
  },
};
