// ---------------------------------------------------------------------------
// Processor: precision_photogrammetry (NexCAD)
// ---------------------------------------------------------------------------
// Orchestrates the full precision scanning pipeline:
//   1. Download images from API → local SSD
//   2. Run photogrammetry reconstruction (USDZ → OBJ)
//   3. Convert to requested formats (DAE, DXF, STL, glTF, SKP)
//   4. Analyze mesh geometry (dimensions, edges, planes)
//   5. Upload results back to API
//   6. Cleanup (optional)
//
// Each step delegates to Tauri Rust commands in precision_scan.rs.
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { getBaseUrl, getAccessToken } from "../api";
import type { JobProcessor } from "../mesh-job-runner";

interface PrecisionScanPayload {
  /** Scan job ID */
  jobId: string;
  /** List of image URLs (absolute or API-relative) to download */
  imageUrls: string[];
  /** API base URL for resolving relative paths and uploading results */
  apiUrl?: string;
  /** Auth token for API calls */
  token?: string;
  /** Photogrammetry detail level: preview | reduced | medium | full | raw */
  detail?: string;
  /** Which export formats to produce (default: all) */
  formats?: string[];
  /** Whether to generate a SketchUp .skp file (default: true) */
  generateSketchup?: boolean;
  /** Whether to run mesh analysis (default: true) */
  analyzeMesh?: boolean;
  /** Whether to upload results to the API (default: true) */
  uploadResults?: boolean;
  /** Whether to clean up local files after upload (default: false) */
  cleanupAfter?: boolean;
}

interface DownloadResult {
  job_id: string;
  image_count: number;
  images_dir: string;
  total_bytes: number;
}

interface PhotogrammetryResult {
  job_id: string;
  usdz_path: string;
  obj_path: string;
  detail_level: string;
  processing_secs: number;
}

interface ConvertFormatResult {
  job_id: string;
  format: string;
  output_path: string;
  file_size_bytes: number;
}

interface SketchUpResult {
  job_id: string;
  skp_path: string;
  file_size_bytes: number;
}

interface MeshAnalysisResult {
  job_id: string;
  analysis_path: string;
  analysis: Record<string, unknown>;
}

interface UploadScanResult {
  job_id: string;
  uploaded_files: string[];
  api_response: Record<string, unknown>;
}

/** All available export formats (excluding USDZ and OBJ which are always produced) */
const DEFAULT_FORMATS = ["dae", "stl", "gltf", "glb", "step"];

export const precisionScanProcessor: JobProcessor = {
  canHandle(type: string): boolean {
    return type === "precision_photogrammetry" || type === "nexcad_scan";
  },

  async process(
    jobId: string,
    _type: string,
    payload: Record<string, unknown>,
    onProgress: (pct: number, message?: string) => void,
  ): Promise<Record<string, unknown>> {
    const p = payload as unknown as PrecisionScanPayload;
    // The mesh job runner passes jobId (mesh job UUID) — use it for local file
    // storage.  The payload contains scanId (precision scan cuid) which is the
    // identity the API expects for the upload endpoint.
    const meshJobId = jobId;
    const scanId = (payload as any).scanId || p.jobId || jobId;
    const formats = p.formats || DEFAULT_FORMATS;
    const generateSkp = p.generateSketchup !== false;
    const doAnalyze = p.analyzeMesh !== false;
    const doUpload = p.uploadResults !== false;
    const doCleanup = p.cleanupAfter === true;

    // Use NexBRIDGE's own API credentials as fallback (the API doesn't
    // pass these in the payload — NexBRIDGE is already authenticated)
    const apiUrl = p.apiUrl || getBaseUrl();
    const token = p.token || getAccessToken();

    // -----------------------------------------------------------------------
    // Step 1: Download images (0–15%)
    // -----------------------------------------------------------------------
    onProgress(2, "Downloading scan images to local SSD...");

    const downloadResult = await invoke<DownloadResult>("download_scan_images", {
      jobId: meshJobId,
      imageUrls: p.imageUrls,
      apiUrl: p.apiUrl,
      token: p.token,
    });

    onProgress(15, `Downloaded ${downloadResult.image_count} images`);

    // -----------------------------------------------------------------------
    // Step 2: Photogrammetry reconstruction (15–60%)
    // -----------------------------------------------------------------------
    onProgress(16, "Starting photogrammetry reconstruction...");

    const photoResult = await invoke<PhotogrammetryResult>("run_photogrammetry", {
      jobId: meshJobId,
      detail: p.detail || "full",
    });

    onProgress(60, `Reconstruction complete (${Math.round(photoResult.processing_secs)}s)`);

    // -----------------------------------------------------------------------
    // Step 3: Format conversions (60–80%)
    // -----------------------------------------------------------------------
    const convertedFormats: ConvertFormatResult[] = [];
    const totalFormats = formats.length + (generateSkp ? 1 : 0);
    let formatsDone = 0;

    for (const fmt of formats) {
      const pct = 60 + Math.round((formatsDone / totalFormats) * 20);
      onProgress(pct, `Converting to ${fmt.toUpperCase()}...`);

      try {
        const result = await invoke<ConvertFormatResult>("convert_model", {
          jobId: meshJobId,
          format: fmt,
        });
        convertedFormats.push(result);
      } catch (err: any) {
        console.warn(`[nexcad] ${fmt} conversion failed:`, err?.message || err);
        // Non-fatal — continue with other formats
      }
      formatsDone++;
    }

    // -----------------------------------------------------------------------
    // Step 3b: SketchUp export (part of 60–80%)
    // -----------------------------------------------------------------------
    let sketchupResult: SketchUpResult | null = null;
    if (generateSkp) {
      const pct = 60 + Math.round((formatsDone / totalFormats) * 20);
      onProgress(pct, "Generating SketchUp .skp file...");

      try {
        sketchupResult = await invoke<SketchUpResult>("generate_sketchup", {
          jobId: meshJobId,
        });
      } catch (err: any) {
        console.warn("[nexcad] SketchUp generation failed:", err?.message || err);
      }
      formatsDone++;
    }

    onProgress(80, `Exported to ${formatsDone} formats`);

    // -----------------------------------------------------------------------
    // Step 4: Mesh analysis (80–90%)
    // -----------------------------------------------------------------------
    let analysisResult: MeshAnalysisResult | null = null;
    if (doAnalyze) {
      onProgress(82, "Analyzing mesh geometry...");

      try {
        analysisResult = await invoke<MeshAnalysisResult>("analyze_mesh", {
          jobId: meshJobId,
        });
      } catch (err: any) {
        console.warn("[nexcad] Mesh analysis failed:", err?.message || err);
      }
    }

    onProgress(90, "Analysis complete");

    // -----------------------------------------------------------------------
    // Step 5: Upload results (90–98%)
    // -----------------------------------------------------------------------
    let uploadResult: UploadScanResult | null = null;
    if (doUpload && apiUrl && token) {
      onProgress(91, "Uploading results to API...");

      try {
        // Upload all formats that were produced (including USDZ, OBJ, SKP)
        const allFormats = [
          "usdz",
          "obj",
          ...formats,
          ...(sketchupResult ? ["skp"] : []),
        ];

        uploadResult = await invoke<UploadScanResult>("upload_scan_results", {
          jobId: meshJobId,
          scanId,
          apiUrl,
          token,
          formats: allFormats,
        });

        onProgress(98, `Uploaded ${uploadResult.uploaded_files.length} files`);
      } catch (err: any) {
        console.warn("[nexcad] Upload failed:", err?.message || err);
      }
    }

    // -----------------------------------------------------------------------
    // Step 6: Cleanup (optional)
    // -----------------------------------------------------------------------
    if (doCleanup) {
      try {
        await invoke("cleanup_scan", { jobId: meshJobId });
      } catch (err: any) {
        console.warn("[nexcad] Cleanup failed:", err?.message || err);
      }
    }

    onProgress(100, "NexCAD pipeline complete");

    // -----------------------------------------------------------------------
    // Build result payload
    // -----------------------------------------------------------------------
    return {
      jobId: meshJobId,
      scanId,
      imageCount: downloadResult.image_count,
      photogrammetry: {
        usdzPath: photoResult.usdz_path,
        objPath: photoResult.obj_path,
        detailLevel: photoResult.detail_level,
        processingSecs: photoResult.processing_secs,
      },
      exports: convertedFormats.map((r) => ({
        format: r.format,
        path: r.output_path,
        sizeBytes: r.file_size_bytes,
      })),
      sketchup: sketchupResult
        ? {
            skpPath: sketchupResult.skp_path,
            sizeBytes: sketchupResult.file_size_bytes,
          }
        : null,
      analysis: analysisResult?.analysis || null,
      upload: uploadResult
        ? {
            uploadedFiles: uploadResult.uploaded_files,
            apiResponse: uploadResult.api_response,
          }
        : null,
    };
  },
};
