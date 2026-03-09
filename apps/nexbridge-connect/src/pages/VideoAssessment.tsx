import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, exists } from "@tauri-apps/plugin-fs";
import {
  analyzeFrames,
  createAssessment,
  getAssessment,
  getSignedUrl,
  updateAssessment,
  overrideFinding,
  uploadFrame,
  teachAssessment,
  confirmTeach,
  type AnalyzeFramesResponse,
  type AssessmentType,
  type TeachResponse,
} from "../lib/api";
import {
  enhanceFinding,
  canEnhance,
  type EnhancedFinding,
  type EnhancementProgress,
} from "../lib/enhanced-assessment";
import { registerVideo, findVideoByAssessmentId } from "../lib/video-index";

type Stage =
  | "pick"
  | "preview"
  | "extracting"
  | "uploading"
  | "analyzing"
  | "review"
  | "saving"
  | "done";
type SourceType = "DRONE" | "HANDHELD" | "UPLOAD" | "SECURITY_CAM";
type PromptType = AssessmentType;

// Enum options for finding edit dropdowns (must match Prisma enums)
const ZONE_OPTIONS = [
  "ROOF","SIDING","WINDOWS","GUTTERS","FASCIA_SOFFIT","FOUNDATION",
  "DECK_PATIO","FENCING","LANDSCAPING","INTERIOR_WALLS","INTERIOR_CEILING",
  "INTERIOR_FLOOR","INTERIOR_CABINETS","INTERIOR_FIXTURES","PLUMBING",
  "ELECTRICAL","HVAC","OTHER",
] as const;
const CATEGORY_OPTIONS = [
  "MISSING_SHINGLES","CURLING","GRANULE_LOSS","HAIL_IMPACT","WIND_LIFT",
  "ALGAE_MOSS","FLASHING","RIDGE_CAP","VALLEY","UNDERLAYMENT","DRAINAGE",
  "CRACKING","PEELING","ROT","WATER_STAIN","MOLD","WARPING","BROKEN_SEAL",
  "MISSING_CAULK","STRUCTURAL_SHIFT","CORROSION","INSECT_DAMAGE",
  "EFFLORESCENCE","SPALLING","OTHER",
] as const;
const SEVERITY_OPTIONS = ["LOW","MODERATE","SEVERE","CRITICAL"] as const;
const CAUSATION_OPTIONS = [
  "HAIL","WIND","AGE","WATER","FIRE","IMPACT","THERMAL",
  "IMPROPER_INSTALL","SETTLING","PEST","UNKNOWN",
] as const;

interface FindingDraft {
  zone: string;
  category: string;
  severity: string;
  causation: string;
  description: string;
}

interface VideoMeta {
  duration_secs: number;
  width: number;
  height: number;
  codec: string;
  file_name: string;
  file_size_bytes: number;
}

interface ExtractedFrame {
  index: number;
  timestamp_secs: number;
  path: string;
  base64: string;
  mime_type: string;
}

interface ExtractionResult {
  metadata: VideoMeta;
  frames: ExtractedFrame[];
  temp_dir: string;
}

export default function VideoAssessment() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Pipeline state
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [loadingAssessment, setLoadingAssessment] = useState(false);

  // Config
  const [sourceType, setSourceType] = useState<SourceType>("HANDHELD");
  const [promptType, setPromptType] = useState<PromptType>("EXTERIOR");

  // Data flowing through the pipeline
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeFramesResponse | null>(null);
  const [savedAssessmentId, setSavedAssessmentId] = useState<string | null>(null);
  const [uploadedFrameUris, setUploadedFrameUris] = useState<
    Array<{ gcsUri: string; mimeType: string; timestampSecs: number }>
  >([]);
  // Signed URL fallback frames (when local video is gone)
  const [fallbackFrames, setFallbackFrames] = useState<
    Array<{ url: string; timestampSecs: number }>
  >([]);

  // Zoom & Teach state
  const [teachFrame, setTeachFrame] = useState<number | null>(null);
  const [teachHint, setTeachHint] = useState("");
  const [teachLoading, setTeachLoading] = useState(false);
  const [teachResult, setTeachResult] = useState<TeachResponse | null>(null);
  const [supplementalFindings, setSupplementalFindings] = useState<
    Array<{ finding: any; narrative: string; webSources: Array<{ url: string; title: string }>; teachId: string }>
  >([]);

  // NexCAD measurement enhancement state
  const [enhancingIndex, setEnhancingIndex] = useState<number | null>(null);
  const [enhanceProgress, setEnhanceProgress] = useState<EnhancementProgress | null>(null);
  const [enhancedFindings, setEnhancedFindings] = useState<Map<number, EnhancedFinding>>(new Map());

  // Zoom lightbox state
  const [zoomedFrame, setZoomedFrame] = useState<number | null>(null);

  // Editable narrative state (for reopened assessments)
  const [editingNarrative, setEditingNarrative] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState("");
  const [savingUpdate, setSavingUpdate] = useState(false);

  // Finding editing state
  const [dbFindingIds, setDbFindingIds] = useState<Map<number, string>>(new Map());
  const [editingFindingIdx, setEditingFindingIdx] = useState<number | null>(null);
  const [findingDraft, setFindingDraft] = useState<FindingDraft | null>(null);
  const [savingFinding, setSavingFinding] = useState(false);

  // Video preview / time range state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [markEnd, setMarkEnd] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  // Load video as blob URL for proper playback (asset protocol lacks range requests)
  useEffect(() => {
    if (!videoPath || stage !== "preview") return;
    let revoke: string | null = null;
    setVideoLoading(true);

    readFile(videoPath)
      .then((bytes) => {
        const ext = videoPath.split(".").pop()?.toLowerCase() || "mp4";
        const mime = ext === "mov" ? "video/quicktime"
          : ext === "webm" ? "video/webm"
          : ext === "avi" ? "video/x-msvideo"
          : ext === "mkv" ? "video/x-matroska"
          : "video/mp4";
        const blob = new Blob([bytes], { type: mime });
        revoke = URL.createObjectURL(blob);
        setVideoBlobUrl(revoke);
      })
      .catch((err) => {
        console.error("[video] failed to load:", err);
        setError(`Failed to load video: ${err}`);
      })
      .finally(() => setVideoLoading(false));

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
      setVideoBlobUrl(null);
    };
  }, [videoPath, stage]);

  // Listen for extraction progress
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<{ stage: string; message: string }>("extraction-progress", (e) => {
      setProgress(e.payload.message);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Load an existing assessment if ?id= is in the URL
  useEffect(() => {
    const assessmentId = searchParams.get("id");
    if (!assessmentId || stage !== "pick") return;
    let cancelled = false;

    setLoadingAssessment(true);
    getAssessment(assessmentId)
      .then(async (record) => {
        if (cancelled) return;
        // Hydrate the review stage from the saved assessment
        const json = record.assessmentJson as any;
        if (json) {
          // Merge DB findings (source of truth after overrides) back into
          // the assessmentJson findings array used for rendering.
          const dbFindings = record.findings ?? [];
          const idMap = new Map<number, string>();
          if (dbFindings.length > 0) {
            // Build finding ID map and overwrite assessmentJson findings with DB values
            const mergedFindings = dbFindings.map((dbf, i) => {
              idMap.set(i, dbf.id);
              // Map DB finding shape back to the Gemini finding shape the UI expects
              const original = json.findings?.[i];
              return {
                zone: dbf.zone,
                category: dbf.category,
                severity: dbf.severity,
                causation: dbf.causation,
                description: dbf.description ?? "",
                frameIndex: original?.frameIndex ?? i,
                boundingBox: original?.boundingBox ?? null,
                costbookItemCode: original?.costbookItemCode ?? null,
                estimatedQuantity: original?.estimatedQuantity ?? null,
                estimatedUnit: original?.estimatedUnit ?? null,
                confidence: dbf.confidenceScore ?? original?.confidence ?? 0,
              };
            });
            json.findings = mergedFindings;
            setDbFindingIds(idMap);
          }
          setAnalysis({
            assessment: json,
            rawResponse: "",
          } as AnalyzeFramesResponse);
        }
        setSavedAssessmentId(record.id);
        setStage("review");

        // ---- Restore frames: local re-extraction or signed URL fallback ----
        if (cancelled) return;
        try {
          // 1) Check the video index for a local video tied to this assessment
          const indexed = await findVideoByAssessmentId(assessmentId);
          const localPath = indexed?.videoPath ?? json?.localVideoPath;

          if (localPath && (await exists(localPath))) {
            console.log("[reopen] re-extracting frames from local video:", localPath);
            setVideoPath(localPath);
            setProgress("Re-extracting frames from local video…");
            const result = await invoke<ExtractionResult>("extract_frames", {
              videoPath: localPath,
              mode: "fixed",
              intervalSecs: 8,
              maxFrames: 30,
            });
            if (!cancelled) {
              setExtraction(result);
              console.log(`[reopen] restored ${result.frames.length} frames`);
            }
          } else if (json?.frameUris?.length) {
            // 2) No local video — fetch signed URLs for the stored frame URIs
            console.log("[reopen] fetching signed URLs for", json.frameUris.length, "frames");
            const signed = await Promise.all(
              (json.frameUris as string[]).map(async (uri: string, i: number) => {
                try {
                  const url = await getSignedUrl(uri);
                  return { url, timestampSecs: i * 8 };
                } catch (e) {
                  console.warn("[reopen] signed URL failed for", uri, e);
                  return null;
                }
              }),
            );
            if (!cancelled) {
              setFallbackFrames(signed.filter(Boolean) as Array<{ url: string; timestampSecs: number }>);
              console.log(`[reopen] loaded ${signed.filter(Boolean).length} fallback frames`);
            }
          }
        } catch (frameErr) {
          console.warn("[reopen] frame restoration failed:", frameErr);
          // Non-fatal — assessment review still works without frames
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load assessment: ${msg}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingAssessment(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Format seconds as MM:SS.s
  const fmtTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
  }, []);

  // Step 1: Pick video file
  async function pickVideo() {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"],
          },
        ],
      });
      if (!selected) return;
      const path = typeof selected === "string" ? selected : selected;
      setVideoPath(path);
      setStage("preview");
      setMarkStart(null);
      setMarkEnd(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open file picker");
    }
  }

  // Step 2: Extract frames via Rust/FFmpeg (with optional time range)
  async function extractFrames() {
    if (!videoPath) return;
    setStage("extracting");
    setError(null);
    setProgress("Starting extraction…");

    try {
      const isDrone = sourceType === "DRONE";
      const result = await invoke<ExtractionResult>("extract_frames", {
        videoPath,
        mode: isDrone ? "adaptive" : "fixed",
        minInterval: isDrone ? 2.0 : undefined,
        maxInterval: isDrone ? 8.0 : undefined,
        sceneThreshold: isDrone ? 0.15 : undefined,
        intervalSecs: isDrone ? undefined : 8,
        maxFrames: isDrone ? 60 : 30,
        // Time range from preview stage
        startSecs: markStart ?? undefined,
        endSecs: markEnd ?? undefined,
      });
      setExtraction(result);
      setStage("analyzing");
      await runAnalysis(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      console.error("[extract_frames] error:", err);
      setError(`Extraction failed: ${msg}`);
      setStage("preview");
    }
  }

  function safeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  }

  async function uploadFramesToGcs(ext: ExtractionResult) {
    const frames = ext.frames;
    const results: Array<{ gcsUri: string; mimeType: string; timestampSecs: number }> =
      new Array(frames.length);

    let completed = 0;
    const concurrency = Math.min(4, frames.length);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= frames.length) break;

        const frame = frames[idx]!;
        const fileName = safeFileName(
          `${ext.metadata.file_name || "video"}-frame_${String(idx).padStart(4, "0")}.jpg`
        );

        // Upload frame directly through the API (avoids unreachable
        // presigned MinIO URLs from inside Docker).
        const { fileUri } = await uploadFrame({
          fileName,
          contentType: frame.mime_type || "image/jpeg",
          base64: frame.base64,
        });

        results[idx] = {
          gcsUri: fileUri,
          mimeType: frame.mime_type || "image/jpeg",
          timestampSecs: frame.timestamp_secs,
        };

        completed += 1;
        setProgress(`Uploading frames… (${completed}/${frames.length})`);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }

  // Step 3: Send frames to NCC API → Gemini
  async function runAnalysis(ext: ExtractionResult) {
    try {
      setStage("uploading");
      setProgress(`Uploading ${ext.frames.length} frames…`);
      const uploaded = await uploadFramesToGcs(ext);
      setUploadedFrameUris(uploaded);

      setStage("analyzing");
      setProgress("Sending frames to NCC for AI analysis…");

      const resp = await analyzeFrames({
        frames: uploaded.map((f) => ({
          gcsUri: f.gcsUri,
          mimeType: f.mimeType,
        })),
        assessmentType: promptType,
      });

      setAnalysis(resp);
      setStage("review");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      setError(msg);
      setStage("pick");
    }
  }

  // Step 4: Save assessment to NCC
  async function saveAssessment() {
    if (!extraction || !analysis) return;
    setStage("saving");
    setError(null);

    try {
      const sourceTypeForApi =
        sourceType === "DRONE" ? "DRONE" : sourceType === "HANDHELD" ? "HANDHELD" : "OTHER";

      // Include frame URIs and local video path in assessmentJson for reopen
      const assessmentJsonWithMeta = {
        ...analysis.assessment,
        frameUris: uploadedFrameUris.map((f) => f.gcsUri),
        localVideoPath: videoPath,
        videoResolution: `${extraction.metadata.width}x${extraction.metadata.height}`,
        videoDurationSecs: extraction.metadata.duration_secs,
      };

      const saved = await createAssessment({
        sourceType: sourceTypeForApi,
        videoFileName: extraction.metadata.file_name,
        videoDurationSecs: extraction.metadata.duration_secs,
        videoResolution: `${extraction.metadata.width}x${extraction.metadata.height}`,
        frameCount: extraction.frames.length,
        assessmentJson: assessmentJsonWithMeta,
        rawAiResponse: analysis.rawResponse,
        confidenceScore: analysis.assessment.summary?.confidence,
        findings: analysis.assessment.findings.map((f, i) => ({
          zone: f.zone,
          category: f.category,
          severity: f.severity,
          causation: f.causation,
          description: f.description,
          frameTimestamp:
            extraction.frames[f.frameIndex]?.timestamp_secs ?? undefined,
          boundingBoxJson: f.boundingBox ?? undefined,
          costbookItemCode: f.costbookItemCode ?? undefined,
          estimatedQuantity: f.estimatedQuantity ?? undefined,
          estimatedUnit: f.estimatedUnit ?? undefined,
          confidenceScore: f.confidence,
          sortOrder: i,
        })),
      });

      setSavedAssessmentId(saved.id);

      // Register video in local index for future re-extraction
      if (videoPath) {
        try {
          await registerVideo(
            videoPath,
            {
              fileName: extraction.metadata.file_name,
              durationSecs: extraction.metadata.duration_secs,
              resolution: `${extraction.metadata.width}x${extraction.metadata.height}`,
            },
            saved.id,
          );
          console.log("[video-index] registered", videoPath, "→", saved.id);
        } catch (indexErr) {
          console.warn("[video-index] failed to register:", indexErr);
        }
      }

      // Don't cleanup yet — user may want to Zoom & Teach
      setStage("done");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      setError(msg);
      setStage("review");
    }
  }

  // -- Render --

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Zoom Lightbox — supports both extracted and fallback frames */}
      {zoomedFrame !== null && (() => {
        const extractedFrame = extraction?.frames[zoomedFrame];
        const fallbackFrame = fallbackFrames[zoomedFrame];
        const imgSrc = extractedFrame
          ? `data:${extractedFrame.mime_type};base64,${extractedFrame.base64}`
          : fallbackFrame?.url;
        const ts = extractedFrame?.timestamp_secs ?? fallbackFrame?.timestampSecs;
        if (!imgSrc) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setZoomedFrame(null)}
          >
            <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <img
                src={imgSrc}
                alt={`Frame ${zoomedFrame} zoomed`}
                className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-white/80">
                  Frame {zoomedFrame}{ts != null ? ` — ${Math.round(ts)}s` : ""}
                </span>
                <button
                  onClick={() => setZoomedFrame(null)}
                  className="rounded bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30"
                >
                  Close (Esc)
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <button
        onClick={() => navigate("/")}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700"
      >
        ← Back to Dashboard
      </button>

      <h2 className="mb-6 text-xl font-semibold text-gray-800">
        New Video Assessment
      </h2>

      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stage: Pick */}
      {stage === "pick" && (
        <div className="space-y-6">
          <button
            onClick={pickVideo}
            className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16 text-gray-500 hover:border-nexus-400 hover:text-nexus-600"
          >
            <span className="text-3xl">🎬</span>
            <span className="mt-2 text-sm font-medium">
              Click to select a video file
            </span>
            <span className="mt-1 text-xs text-gray-400">
              MP4, MOV, AVI, MKV, WebM
            </span>
          </button>
        </div>
      )}

      {/* Stage: Preview — scrub video, mark start/end for analysis */}
      {stage === "preview" && videoPath && (
        <div className="space-y-5">
          {/* File info */}
          <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-800">
                {videoPath.split("/").pop()}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">{videoPath}</p>
            </div>
            <button
              onClick={() => { setVideoPath(null); setStage("pick"); }}
              className="ml-3 shrink-0 rounded border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Choose Different File
            </button>
          </div>

          {/* Video player */}
          <div className="overflow-hidden rounded-lg border bg-black">
            {videoLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-white" />
                <span className="ml-3 text-sm text-gray-400">Loading video…</span>
              </div>
            )}
            {videoBlobUrl && (
              <video
                ref={videoRef}
                src={videoBlobUrl}
                controls
                preload="auto"
                playsInline
                className="mx-auto max-h-[400px] w-full"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setVideoDuration(v.duration);
                  if (markStart === null) setMarkStart(0);
                  if (markEnd === null) setMarkEnd(v.duration);
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            )}
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.paused ? v.play() : v.pause();
              }}
              className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>

            <select
              value={playbackRate}
              onChange={(e) => {
                const rate = parseFloat(e.target.value);
                setPlaybackRate(rate);
                if (videoRef.current) videoRef.current.playbackRate = rate;
              }}
              className="rounded border px-2 py-1.5 text-xs"
            >
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>

            <span className="font-mono text-sm text-gray-600">
              {fmtTime(currentTime)} / {fmtTime(videoDuration)}
            </span>
          </div>

          {/* Timeline scrubber with range overlay */}
          {videoDuration > 0 && (
            <div className="space-y-1">
              <div className="relative h-6">
                {/* Selected range highlight */}
                {markStart !== null && markEnd !== null && (
                  <div
                    className="pointer-events-none absolute top-1 h-4 rounded bg-nexus-200/60"
                    style={{
                      left: `${(markStart / videoDuration) * 100}%`,
                      width: `${(((markEnd - markStart) / videoDuration) * 100)}%`,
                    }}
                  />
                )}
                {/* Range input (transparent, handles scrub) */}
                <input
                  type="range"
                  min={0}
                  max={videoDuration}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const t = parseFloat(e.target.value);
                    setCurrentTime(t);
                    if (videoRef.current) videoRef.current.currentTime = t;
                  }}
                  className="relative z-10 h-6 w-full cursor-pointer accent-nexus-600"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{fmtTime(0)}</span>
                {markStart !== null && (
                  <span className="font-medium text-green-600">IN: {fmtTime(markStart)}</span>
                )}
                {markEnd !== null && (
                  <span className="font-medium text-red-600">OUT: {fmtTime(markEnd)}</span>
                )}
                <span>{fmtTime(videoDuration)}</span>
              </div>
            </div>
          )}

          {/* Mark Start / End buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMarkStart(currentTime)}
              className="rounded bg-green-50 px-4 py-2 text-sm font-medium text-green-700 ring-1 ring-green-200 hover:bg-green-100"
            >
              Mark Start ({fmtTime(currentTime)})
            </button>
            <button
              onClick={() => setMarkEnd(currentTime)}
              className="rounded bg-red-50 px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100"
            >
              Mark End ({fmtTime(currentTime)})
            </button>
            {(markStart !== null || markEnd !== null) && (
              <button
                onClick={() => {
                  setMarkStart(null);
                  setMarkEnd(null);
                }}
                className="rounded border px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                Reset to Full Video
              </button>
            )}
          </div>

          {/* Range summary */}
          {markStart !== null && markEnd !== null && markEnd > markStart && (
            <div className="rounded bg-nexus-50 px-4 py-2 text-sm text-nexus-700">
              Analyzing <strong>{fmtTime(markStart)}</strong> → <strong>{fmtTime(markEnd)}</strong>
              {" "}({fmtTime(markEnd - markStart)} of {fmtTime(videoDuration)} total)
            </div>
          )}
          {markStart !== null && markEnd !== null && markEnd <= markStart && (
            <div className="rounded bg-amber-50 px-4 py-2 text-sm text-amber-700">
              End must be after start — adjust your marks.
            </div>
          )}

          {/* Source + Analysis type selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Source Type
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                <option value="HANDHELD">Handheld / Phone</option>
                <option value="DRONE">Drone</option>
                <option value="UPLOAD">Uploaded File</option>
                <option value="SECURITY_CAM">Security Camera</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Analysis Type
              </label>
              <select
                value={promptType}
                onChange={(e) => setPromptType(e.target.value as PromptType)}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                <option value="EXTERIOR">Exterior</option>
                <option value="INTERIOR">Interior</option>
                <option value="DRONE_ROOF">Drone / Roof</option>
                <option value="TARGETED">Targeted Area</option>
              </select>
            </div>
          </div>

          {/* Extract button */}
          <button
            onClick={extractFrames}
            disabled={markStart !== null && markEnd !== null && markEnd <= markStart}
            className="w-full rounded bg-nexus-600 px-4 py-3 text-sm font-medium text-white hover:bg-nexus-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markStart !== null && markEnd !== null && markEnd > markStart
              ? `Extract & Analyze Selection (${fmtTime(markStart)} → ${fmtTime(markEnd)})`
              : markStart === null && markEnd === null
                ? "Extract & Analyze Full Video"
                : "Extract & Analyze Selection"}
          </button>
        </div>
      )}

      {/* Stage: Extracting / Uploading / Analyzing */}
      {(stage === "extracting" || stage === "uploading" || stage === "analyzing") && (
        <div className="flex flex-col items-center py-16">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
          <p className="text-sm font-medium text-gray-700">
            {stage === "extracting"
              ? "Extracting Frames"
              : stage === "uploading"
                ? "Uploading Frames"
                : "AI Analysis"}
          </p>
          <p className="mt-1 text-xs text-gray-500">{progress}</p>
        </div>
      )}

      {/* Loading existing assessment */}
      {loadingAssessment && (
        <div className="flex flex-col items-center py-16">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
          <p className="text-sm font-medium text-gray-700">Loading assessment…</p>
        </div>
      )}

      {/* Stage: Review */}
      {stage === "review" && analysis && (
        <div className="space-y-6">
          {/* Reopened badge */}
          {savedAssessmentId && !extraction && (
            <div className="flex items-center gap-2 rounded bg-blue-50 px-4 py-2 text-sm text-blue-700">
              <span>Reopened saved assessment</span>
              <span className="text-xs text-blue-500">({savedAssessmentId})</span>
            </div>
          )}

          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium text-gray-800">AI Summary</h3>
              {!editingNarrative && (
                <button
                  onClick={() => {
                    setNarrativeDraft(analysis.assessment.summary.narrative || "");
                    setEditingNarrative(true);
                  }}
                  className="rounded border px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Edit
                </button>
              )}
            </div>
            {editingNarrative ? (
              <div className="space-y-2">
                <textarea
                  value={narrativeDraft}
                  onChange={(e) => setNarrativeDraft(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm text-gray-700"
                  rows={5}
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!savedAssessmentId) {
                        // Not yet saved — just update local state
                        analysis.assessment.summary.narrative = narrativeDraft;
                        setEditingNarrative(false);
                        return;
                      }
                      setSavingUpdate(true);
                      try {
                        const updatedJson = {
                          ...analysis.assessment,
                          summary: { ...analysis.assessment.summary, narrative: narrativeDraft },
                        };
                        await updateAssessment(savedAssessmentId, { assessmentJson: updatedJson });
                        // Update local state to reflect the save
                        setAnalysis({ ...analysis, assessment: updatedJson } as AnalyzeFramesResponse);
                        setEditingNarrative(false);
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        setError(`Failed to update: ${msg}`);
                      } finally {
                        setSavingUpdate(false);
                      }
                    }}
                    disabled={savingUpdate}
                    className="rounded bg-nexus-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-700 disabled:opacity-50"
                  >
                    {savingUpdate ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingNarrative(false)}
                    className="rounded border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {analysis.assessment.summary.narrative}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400">
              {analysis.assessment.findings.length} findings · overall condition{" "}
              {analysis.assessment.summary.overallCondition}/5 · confidence{" "}
              {Math.round((analysis.assessment.summary.confidence ?? 0) * 100)}%
            </p>
          </div>

          {/* Findings list */}
          <div className="space-y-2">
            <h3 className="font-medium text-gray-800">
              Findings ({analysis.assessment.findings.length})
            </h3>
            {analysis.assessment.findings.map((f, i) => {
              const ts = extraction?.frames[f.frameIndex]?.timestamp_secs ?? null;
              const confidencePct = Math.round((f.confidence ?? 0) * 100);

              const enhanced = enhancedFindings.get(i);
              const isEnhancing = enhancingIndex === i;
              const isEditing = editingFindingIdx === i;

              return (
                <div
                  key={i}
                  className={`rounded-lg border bg-white px-4 py-3 shadow-sm ${
                    isEditing ? "ring-2 ring-nexus-300" : ""
                  }`}
                >
                  {isEditing && findingDraft ? (
                    /* ── Inline edit mode ────────────────── */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Zone</label>
                          <select
                            value={findingDraft.zone}
                            onChange={(e) => setFindingDraft({ ...findingDraft, zone: e.target.value })}
                            className="w-full rounded border px-2 py-1.5 text-xs"
                          >
                            {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Category</label>
                          <select
                            value={findingDraft.category}
                            onChange={(e) => setFindingDraft({ ...findingDraft, category: e.target.value })}
                            className="w-full rounded border px-2 py-1.5 text-xs"
                          >
                            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Severity</label>
                          <select
                            value={findingDraft.severity}
                            onChange={(e) => setFindingDraft({ ...findingDraft, severity: e.target.value })}
                            className="w-full rounded border px-2 py-1.5 text-xs"
                          >
                            {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Causation</label>
                          <select
                            value={findingDraft.causation}
                            onChange={(e) => setFindingDraft({ ...findingDraft, causation: e.target.value })}
                            className="w-full rounded border px-2 py-1.5 text-xs"
                          >
                            {CAUSATION_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Description</label>
                        <textarea
                          value={findingDraft.description}
                          onChange={(e) => setFindingDraft({ ...findingDraft, description: e.target.value })}
                          className="w-full rounded border px-2 py-1.5 text-sm"
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={savingFinding}
                          onClick={async () => {
                            setSavingFinding(true);
                            try {
                              const dbId = dbFindingIds.get(i);
                              if (savedAssessmentId && dbId) {
                                // Persist to API
                                await overrideFinding(savedAssessmentId, dbId, {
                                  zone: findingDraft.zone,
                                  category: findingDraft.category,
                                  severity: findingDraft.severity,
                                  causation: findingDraft.causation,
                                  description: findingDraft.description,
                                });
                              }
                              // Update local state
                              const updatedFindings = [...analysis.assessment.findings];
                              updatedFindings[i] = { ...updatedFindings[i], ...findingDraft };
                              const updatedAssessment = { ...analysis.assessment, findings: updatedFindings };
                              setAnalysis({ ...analysis, assessment: updatedAssessment } as AnalyzeFramesResponse);
                              // Also persist the assessmentJson if saved
                              if (savedAssessmentId) {
                                await updateAssessment(savedAssessmentId, { assessmentJson: updatedAssessment }).catch(() => {});
                              }
                              setEditingFindingIdx(null);
                              setFindingDraft(null);
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : String(err);
                              setError(`Failed to update finding: ${msg}`);
                            } finally {
                              setSavingFinding(false);
                            }
                          }}
                          className="rounded bg-nexus-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-700 disabled:opacity-50"
                        >
                          {savingFinding ? "Saving…" : "Save Finding"}
                        </button>
                        <button
                          onClick={() => { setEditingFindingIdx(null); setFindingDraft(null); }}
                          className="rounded border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── View mode ──────────────────────────── */
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                              f.severity === "CRITICAL"
                                ? "bg-red-100 text-red-700"
                                : f.severity === "SEVERE"
                                  ? "bg-orange-100 text-orange-700"
                                  : f.severity === "MODERATE"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="ml-2 text-xs text-gray-500">
                            {f.zone} · {f.category}
                          </span>
                          {enhanced?.measurementMethod === "photogrammetry" && (
                            <span className="ml-2 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              📐 Measured
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {enhanced ? Math.round(enhanced.measuredConfidence * 100) : confidencePct}% confidence
                          </span>
                          <button
                            onClick={() => {
                              setEditingFindingIdx(i);
                              setFindingDraft({
                                zone: f.zone || "OTHER",
                                category: f.category || "OTHER",
                                severity: f.severity || "MODERATE",
                                causation: f.causation || "UNKNOWN",
                                description: f.description || "",
                              });
                            }}
                            className="rounded border px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                            title="Edit this finding"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{f.description}</p>

                      {/* Measurement comparison — AI vs NexCAD */}
                      {enhanced?.measurementMethod === "photogrammetry" && enhanced.measuredQuantity != null && (
                        <div className="mt-2 flex items-center gap-3 rounded bg-blue-50 px-3 py-2">
                          <div className="text-xs text-gray-500">
                            <span className="line-through">AI: ~{f.estimatedQuantity ?? "?"} {f.estimatedUnit ?? ""}</span>
                          </div>
                          <div className="text-sm font-semibold text-blue-700">
                            📐 NexCAD: {enhanced.measuredQuantity.toFixed(1)} {enhanced.measuredUnit}
                          </div>
                          <span className="text-[10px] text-gray-400">
                            ({Math.round(enhanced.enhancementMs / 1000)}s)
                          </span>
                        </div>
                      )}

                      {/* Enhancement progress */}
                      {isEnhancing && enhanceProgress && (
                        <div className="mt-2 rounded bg-blue-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                            <span className="text-xs text-blue-700">{enhanceProgress.message}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-blue-200">
                            <div
                              className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${enhanceProgress.pct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                          Causation: {f.causation} · Frame {f.frameIndex}
                          {ts != null ? ` (${Math.round(ts)}s)` : ""}
                        </p>

                        {/* Measure with NexCAD button */}
                        {!enhanced && !isEnhancing && canEnhance(f) && videoPath && (
                          <button
                            onClick={async () => {
                              if (!videoPath || !extraction) return;
                              setEnhancingIndex(i);
                              setEnhanceProgress(null);
                              const frameTs = extraction.frames[f.frameIndex]?.timestamp_secs ?? 0;
                              const result = await enhanceFinding(
                                videoPath,
                                f,
                                frameTs,
                                (p) => setEnhanceProgress(p),
                              );
                              setEnhancedFindings((prev) => new Map(prev).set(i, result));
                              setEnhancingIndex(null);
                              setEnhanceProgress(null);
                            }}
                            className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                          >
                            📐 Measure with NexCAD
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Frame Gallery for Zoom & Teach */}
          {extraction && (
            <div>
              <h3 className="mb-2 font-medium text-gray-800">
                Frames — Click to Zoom & Teach
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {extraction.frames.map((frame, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTeachFrame(i);
                      setTeachHint("");
                      setTeachResult(null);
                    }}
                    className={`flex-none rounded border-2 transition-all ${
                      teachFrame === i
                        ? "border-nexus-600 ring-2 ring-nexus-300"
                        : "border-gray-200 hover:border-nexus-400"
                    }`}
                  >
                  <img
                      src={`data:${frame.mime_type};base64,${frame.base64}`}
                      alt={`Frame ${i}`}
                      className="h-16 w-24 rounded object-cover"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setZoomedFrame(i);
                      }}
                    />
                    <p className="text-center text-[10px] text-gray-500">
                      {Math.round(frame.timestamp_secs)}s
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fallback Frame Gallery — signed URLs when local video is gone */}
          {!extraction && fallbackFrames.length > 0 && (
            <div>
              <h3 className="mb-2 font-medium text-gray-800">
                Frames (from server) — Double-click to Zoom
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {fallbackFrames.map((frame, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTeachFrame(i);
                      setTeachHint("");
                      setTeachResult(null);
                    }}
                    className={`flex-none rounded border-2 transition-all ${
                      teachFrame === i
                        ? "border-nexus-600 ring-2 ring-nexus-300"
                        : "border-gray-200 hover:border-nexus-400"
                    }`}
                  >
                    <img
                      src={frame.url}
                      alt={`Frame ${i}`}
                      className="h-16 w-24 rounded object-cover"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setZoomedFrame(i);
                      }}
                    />
                    <p className="text-center text-[10px] text-gray-500">
                      {Math.round(frame.timestampSecs)}s
                    </p>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-amber-600">
                Original video not found locally. Showing uploaded frames from server (read-only).
              </p>
            </div>
          )}

          {/* Teach Panel — shown when a frame is selected */}
          {teachFrame !== null && extraction && (
            <div className="rounded-lg border-2 border-nexus-200 bg-nexus-50 p-4">
              <div className="flex items-start gap-4">
                <img
                  src={`data:${extraction.frames[teachFrame]?.mime_type};base64,${extraction.frames[teachFrame]?.base64}`}
                  alt="Selected frame — click to zoom"
                  className="h-40 w-60 cursor-zoom-in rounded border object-contain bg-white hover:ring-2 hover:ring-nexus-400"
                  title="Click to zoom"
                  onClick={() => setZoomedFrame(teachFrame)}
                />
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      What do you see? (hint for the AI)
                    </label>
                    <textarea
                      value={teachHint}
                      onChange={(e) => setTeachHint(e.target.value)}
                      placeholder="e.g. 'hail damage on rake edge' or 'these are 3-tab shingles not architectural'"
                      className="w-full rounded border px-3 py-2 text-sm"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!teachHint.trim() || !savedAssessmentId) return;
                        setTeachLoading(true);
                        setTeachResult(null);
                        try {
                          const frame = extraction.frames[teachFrame]!;
                          // Upload the frame via API (avoids presigned MinIO URLs)
                          const fileName = safeFileName(
                            `teach-${extraction.metadata.file_name}-frame${teachFrame}.jpg`
                          );
                          const { fileUri } = await uploadFrame({
                            fileName,
                            contentType: frame.mime_type || "image/jpeg",
                            base64: frame.base64,
                          });

                          const result = await teachAssessment(savedAssessmentId, {
                            frameIndex: teachFrame,
                            imageUri: fileUri,
                            userHint: teachHint,
                            assessmentType: promptType,
                          });
                          setTeachResult(result);
                          if (result.finding) {
                            setSupplementalFindings((prev) => [
                              ...prev,
                              {
                                finding: result.finding,
                                narrative: result.narrative,
                                webSources: result.webSources,
                                teachId: result.teachingExample.id,
                              },
                            ]);
                          }
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : String(err);
                          setError(`Teach failed: ${msg}`);
                        } finally {
                          setTeachLoading(false);
                        }
                      }}
                      disabled={teachLoading || !teachHint.trim() || !savedAssessmentId}
                      className="rounded bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700 disabled:opacity-50"
                    >
                      {teachLoading ? "Analyzing…" : "🔍 Analyze This"}
                    </button>
                    <button
                      onClick={() => {
                        setTeachFrame(null);
                        setTeachResult(null);
                      }}
                      className="rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                  {!savedAssessmentId && (
                    <p className="text-xs text-amber-600">
                      Save the assessment first to enable Zoom & Teach
                    </p>
                  )}
                </div>
              </div>

              {/* Teach loading */}
              {teachLoading && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-200 border-t-nexus-600" />
                  <span className="text-xs text-gray-600">
                    AI is analyzing with web reference materials…
                  </span>
                </div>
              )}

              {/* Teach result */}
              {teachResult && (
                <div className="mt-4 space-y-3">
                  <div className="rounded border bg-white p-3">
                    <h4 className="text-xs font-semibold text-nexus-700">AI Forensic Analysis</h4>
                    <p className="mt-1 text-sm text-gray-700">{teachResult.narrative}</p>
                  </div>

                  {teachResult.webSources.length > 0 && (
                    <div className="rounded border bg-white p-3">
                      <h4 className="text-xs font-semibold text-gray-500">Reference Sources Used</h4>
                      <ul className="mt-1 space-y-1">
                        {teachResult.webSources.map((src, i) => (
                          <li key={i} className="text-xs text-blue-600">
                            <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {src.title || src.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Confirm / Correct */}
                  {savedAssessmentId && (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await confirmTeach(savedAssessmentId, teachResult.teachingExample.id, true);
                          setTeachFrame(null);
                          setTeachResult(null);
                        }}
                        className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                      >
                        ✓ Accurate — Teach This
                      </button>
                      <button
                        onClick={() => {
                          setTeachFrame(null);
                          setTeachResult(null);
                        }}
                        className="rounded border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        ✗ Not Quite
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Supplemental findings from Teach */}
          {supplementalFindings.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-800">
                Supplemental Findings ({supplementalFindings.length})
              </h3>
              {supplementalFindings.map((sf, i) => (
                <div
                  key={i}
                  className="rounded-lg border-2 border-nexus-200 bg-nexus-50 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-nexus-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      TAUGHT
                    </span>
                    <span className="text-xs text-gray-500">
                      {sf.finding?.zone} · {sf.finding?.category}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{sf.finding?.description}</p>
                  {sf.webSources.length > 0 && (
                    <p className="mt-1 text-[10px] text-gray-400">
                      Based on {sf.webSources.length} web reference(s)
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            {/* Only show Save/Update for new assessments or those with extraction data */}
            {extraction && (
              <button
                onClick={saveAssessment}
                className="rounded bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
              >
                {savedAssessmentId ? "Update Assessment" : "Save Assessment to NCC"}
              </button>
            )}
            <button
              onClick={() => navigate("/")}
              className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
            {extraction && (
              <button
                onClick={() => {
                  setStage("pick");
                  setVideoPath(null);
                  setExtraction(null);
                  setAnalysis(null);
                  setSavedAssessmentId(null);
                  setSupplementalFindings([]);
                  setSearchParams({});
                }}
                className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Discard & Start New
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stage: Saving */}
      {stage === "saving" && (
        <div className="flex flex-col items-center py-16">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
          <p className="text-sm font-medium text-gray-700">
            Saving to NCC…
          </p>
        </div>
      )}

      {/* Stage: Done */}
      {stage === "done" && (
        <div className="flex flex-col items-center py-16">
          <span className="text-5xl">✅</span>
          <p className="mt-4 text-lg font-medium text-gray-800">
            Assessment Saved
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Your video assessment has been synced to NCC.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => {
                setStage("review");
              }}
              className="rounded bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
            >
              Continue Editing
            </button>
            <button
              onClick={() => navigate("/")}
              className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
            <button
              onClick={async () => {
                if (extraction) {
                  await invoke("cleanup_frames", { tempDir: extraction.temp_dir }).catch(() => {});
                }
                setStage("pick");
                setVideoPath(null);
                setExtraction(null);
                setAnalysis(null);
                setError(null);
                setSavedAssessmentId(null);
                setSupplementalFindings([]);
                setSearchParams({});
              }}
              className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              New Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
