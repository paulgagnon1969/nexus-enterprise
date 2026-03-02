import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  analyzeFrames,
  createAssessment,
  getPresignedUploadUrl,
  teachAssessment,
  confirmTeach,
  type AnalyzeFramesResponse,
  type AssessmentType,
  type TeachResponse,
} from "../lib/api";

type Stage =
  | "pick"
  | "extracting"
  | "uploading"
  | "analyzing"
  | "review"
  | "saving"
  | "done";
type SourceType = "DRONE" | "HANDHELD" | "UPLOAD" | "SECURITY_CAM";
type PromptType = AssessmentType;

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
  const [savedAssessmentId, setSavedAssessmentId] = useState<string | null>(null);

  // Zoom & Teach state
  const [teachFrame, setTeachFrame] = useState<number | null>(null);
  const [teachHint, setTeachHint] = useState("");
  const [teachLoading, setTeachLoading] = useState(false);
  const [teachResult, setTeachResult] = useState<TeachResponse | null>(null);
  const [supplementalFindings, setSupplementalFindings] = useState<
    Array<{ finding: any; narrative: string; webSources: Array<{ url: string; title: string }>; teachId: string }>
  >([]);

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
        intervalSecs: sourceType === "DRONE" ? 6 : 12,
        maxFrames: 24,
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

  function safeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  }

  function base64ToBytes(b64: string): Uint8Array {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
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

        const { uploadUrl, fileUri } = await getPresignedUploadUrl({
          fileName,
          contentType: frame.mime_type || "image/jpeg",
        });

        // Decode the base64 frame data to binary and upload to GCS.
        const bytes = base64ToBytes(frame.base64);
        const putRes = await tauriFetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": frame.mime_type || "image/jpeg",
          },
          body: bytes as unknown as BodyInit,
        });

        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => "");
          throw new Error(`GCS upload failed (${putRes.status}): ${errText}`);
        }

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

      const saved = await createAssessment({
        sourceType: sourceTypeForApi,
        videoFileName: extraction.metadata.file_name,
        videoDurationSecs: extraction.metadata.duration_secs,
        videoResolution: `${extraction.metadata.width}x${extraction.metadata.height}`,
        frameCount: extraction.frames.length,
        assessmentJson: analysis.assessment,
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

      {/* Stage: Review */}
      {stage === "review" && analysis && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <h3 className="mb-2 font-medium text-gray-800">AI Summary</h3>
            <p className="text-sm text-gray-600">
              {analysis.assessment.summary.narrative}
            </p>
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

              return (
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
                    </div>
                    <span className="text-xs text-gray-400">
                      {confidencePct}% confidence
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{f.description}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Causation: {f.causation} · Frame {f.frameIndex}
                    {ts != null ? ` (${Math.round(ts)}s)` : ""}
                  </p>
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
                    />
                    <p className="text-center text-[10px] text-gray-500">
                      {Math.round(frame.timestamp_secs)}s
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Teach Panel — shown when a frame is selected */}
          {teachFrame !== null && extraction && (
            <div className="rounded-lg border-2 border-nexus-200 bg-nexus-50 p-4">
              <div className="flex items-start gap-4">
                <img
                  src={`data:${extraction.frames[teachFrame]?.mime_type};base64,${extraction.frames[teachFrame]?.base64}`}
                  alt="Selected frame"
                  className="h-40 w-60 rounded border object-contain bg-white"
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
                          // Upload the frame to GCS for Gemini
                          const fileName = safeFileName(
                            `teach-${extraction.metadata.file_name}-frame${teachFrame}.jpg`
                          );
                          const { uploadUrl, fileUri } = await getPresignedUploadUrl({
                            fileName,
                            contentType: frame.mime_type || "image/jpeg",
                          });
                          const bytes = base64ToBytes(frame.base64);
                          await tauriFetch(uploadUrl, {
                            method: "PUT",
                            headers: { "Content-Type": frame.mime_type || "image/jpeg" },
                            body: bytes as unknown as BodyInit,
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
            <button
              onClick={saveAssessment}
              className="rounded bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
            >
              {savedAssessmentId ? "Update Assessment" : "Save Assessment to NCC"}
            </button>
            <button
              onClick={() => {
                setStage("pick");
                setVideoPath(null);
                setExtraction(null);
                setAnalysis(null);
                setSavedAssessmentId(null);
                setSupplementalFindings([]);
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
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => {
                setStage("review");
              }}
              className="rounded bg-amber-500 px-6 py-2 text-sm font-medium text-white hover:bg-amber-600"
            >
              🔍 Zoom & Teach
            </button>
            <button
              onClick={() => navigate("/")}
              className="rounded bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
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
