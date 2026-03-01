import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  analyzeFrames,
  createAssessment,
  type AnalyzeFramesResponse,
} from "../lib/api";

type Stage = "pick" | "extracting" | "analyzing" | "review" | "saving" | "done";
type SourceType = "DRONE" | "HANDHELD" | "UPLOAD" | "SECURITY_CAM";
type PromptType = "EXTERIOR" | "INTERIOR" | "DRONE_ROOF" | "TARGETED";

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

  // Pipeline state
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  // Config
  const [sourceType, setSourceType] = useState<SourceType>("HANDHELD");
  const [promptType, setPromptType] = useState<PromptType>("EXTERIOR");

  // Data flowing through the pipeline
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeFramesResponse | null>(null);

  // Listen for extraction progress events from Rust
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open file picker");
    }
  }

  // Step 2: Extract frames via Rust/FFmpeg
  async function extractFrames() {
    if (!videoPath) return;
    setStage("extracting");
    setError(null);
    setProgress("Starting extraction…");

    try {
      const result = await invoke<ExtractionResult>("extract_frames", {
        videoPath,
        intervalSecs: sourceType === "DRONE" ? 5 : 10,
        maxFrames: 120,
        useSceneDetection: false,
      });
      setExtraction(result);
      setStage("analyzing");
      await runAnalysis(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      console.error("[extract_frames] error:", err);
      setError(`Extraction failed: ${msg}`);
      setStage("pick");
    }
  }

  // Step 3: Send frames to NCC API → Gemini
  async function runAnalysis(ext: ExtractionResult) {
    setProgress("Sending frames to NCC for AI analysis…");
    try {
      const resp = await analyzeFrames({
        frames: ext.frames.map((f) => ({
          base64: f.base64,
          mimeType: f.mime_type,
          timestampSecs: f.timestamp_secs,
        })),
        promptType,
        videoFileName: ext.metadata.file_name,
        durationSecs: ext.metadata.duration_secs,
      });
      setAnalysis(resp);
      setStage("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStage("pick");
    }
  }

  // Step 4: Save assessment to NCC
  async function saveAssessment() {
    if (!extraction || !analysis) return;
    setStage("saving");
    setError(null);

    try {
      await createAssessment({
        sourceType,
        videoFileName: extraction.metadata.file_name,
        videoDurationSecs: extraction.metadata.duration_secs,
        videoResolution: `${extraction.metadata.width}x${extraction.metadata.height}`,
        frameCount: extraction.frames.length,
        promptType,
        findings: analysis.findings,
        aiSummary: analysis.summary,
      });

      // Cleanup temp frames
      await invoke("cleanup_frames", { tempDir: extraction.temp_dir });
      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStage("review");
    }
  }

  // -- Render --

  return (
    <div className="mx-auto max-w-3xl p-6">
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
          {/* Source + prompt config */}
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

          {/* File picker */}
          {!videoPath ? (
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
          ) : (
            <div className="rounded-lg border bg-white px-5 py-4 shadow-sm">
              <p className="font-medium text-gray-800">
                {videoPath.split("/").pop()}
              </p>
              <p className="mt-1 text-xs text-gray-500">{videoPath}</p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={extractFrames}
                  className="rounded bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700"
                >
                  Start Analysis
                </button>
                <button
                  onClick={() => setVideoPath(null)}
                  className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Choose Different File
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage: Extracting / Analyzing */}
      {(stage === "extracting" || stage === "analyzing") && (
        <div className="flex flex-col items-center py-16">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
          <p className="text-sm font-medium text-gray-700">
            {stage === "extracting" ? "Extracting Frames" : "AI Analysis"}
          </p>
          <p className="mt-1 text-xs text-gray-500">{progress}</p>
        </div>
      )}

      {/* Stage: Review */}
      {stage === "review" && analysis && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <h3 className="mb-2 font-medium text-gray-800">AI Summary</h3>
            <p className="text-sm text-gray-600">{analysis.summary}</p>
            <p className="mt-2 text-xs text-gray-400">
              {analysis.findings.length} findings ·{" "}
              {analysis.tokenUsage.totalTokens.toLocaleString()} tokens
            </p>
          </div>

          {/* Findings list */}
          <div className="space-y-2">
            <h3 className="font-medium text-gray-800">
              Findings ({analysis.findings.length})
            </h3>
            {analysis.findings.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        f.severity === "CRITICAL"
                          ? "bg-red-100 text-red-700"
                          : f.severity === "MAJOR"
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
                  </div>
                  <span className="text-xs text-gray-400">
                    {f.confidence}% confidence
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{f.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Causation: {f.causation} · Frame {f.frameIndex} (
                  {f.timestampSecs.toFixed(0)}s)
                </p>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={saveAssessment}
              className="rounded bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
            >
              Save Assessment to NCC
            </button>
            <button
              onClick={() => {
                setStage("pick");
                setVideoPath(null);
                setExtraction(null);
                setAnalysis(null);
              }}
              className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Discard
            </button>
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
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate("/")}
              className="rounded bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => {
                setStage("pick");
                setVideoPath(null);
                setExtraction(null);
                setAnalysis(null);
                setError(null);
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
