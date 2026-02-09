import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  current_file: string | null;
  is_paused: boolean;
}

interface UploadQueueProps {
  isUploading: boolean;
  onComplete?: () => void;
}

export function UploadQueue({ isUploading, onComplete }: UploadQueueProps) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isUploading) {
      // Start polling for progress
      const poll = async () => {
        try {
          const p = await invoke<UploadProgress>("get_upload_progress");
          setProgress(p);
          
          // Check if complete
          if (p.total > 0 && p.completed + p.failed >= p.total) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            onComplete?.();
          }
        } catch (err) {
          console.error("Failed to get upload progress:", err);
        }
      };

      poll(); // Initial fetch
      pollRef.current = setInterval(poll, 500);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isUploading, onComplete]);

  const handlePause = async () => {
    try {
      await invoke("pause_upload");
      setProgress((p) => (p ? { ...p, is_paused: true } : p));
    } catch (err) {
      console.error("Failed to pause:", err);
    }
  };

  const handleResume = async () => {
    try {
      await invoke("resume_upload");
      setProgress((p) => (p ? { ...p, is_paused: false } : p));
    } catch (err) {
      console.error("Failed to resume:", err);
    }
  };

  if (!isUploading || !progress || progress.total === 0) {
    return null;
  }

  const percent = Math.round(((progress.completed + progress.failed) / progress.total) * 100);
  const isComplete = progress.completed + progress.failed >= progress.total;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isComplete && (
            <div className="w-4 h-4 border-2 border-nexus-600 border-t-transparent rounded-full animate-spin" />
          )}
          <span className="font-medium text-slate-900">
            {isComplete ? "Upload Complete" : progress.is_paused ? "Upload Paused" : "Uploading Documents..."}
          </span>
        </div>
        
        {!isComplete && (
          <div className="flex gap-2">
            {progress.is_paused ? (
              <button
                type="button"
                onClick={handleResume}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                ▶ Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePause}
                className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                ⏸ Pause
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full transition-all duration-300 ${
            isComplete ? "bg-green-500" : "bg-nexus-600"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span className="text-slate-600">
          <span className="font-medium">{progress.completed}</span> completed
        </span>
        {progress.failed > 0 && (
          <span className="text-red-600">
            <span className="font-medium">{progress.failed}</span> failed
          </span>
        )}
        <span className="text-slate-400">
          {progress.completed + progress.failed} / {progress.total}
        </span>
        <span className="text-slate-500 ml-auto">{percent}%</span>
      </div>

      {progress.current_file && !isComplete && (
        <div className="text-xs text-slate-400 truncate">
          Current: {progress.current_file}
        </div>
      )}
    </div>
  );
}
