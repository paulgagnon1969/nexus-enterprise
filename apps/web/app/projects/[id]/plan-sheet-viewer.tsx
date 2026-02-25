"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ---------- Types ----------

interface PlanSheet {
  id: string;
  pageNo: number;
  sheetId: string | null;
  title: string | null;
  section: string | null;
  status: string;
  thumbPath: string | null;
  standardPath: string | null;
  masterPath: string | null;
  thumbBytes: number;
  standardBytes: number;
  masterBytes: number;
  sortOrder: number;
}

interface Props {
  projectId: string;
  uploadId: string;
  sheets: PlanSheet[];
  initialSheetIndex?: number;
  onClose: () => void;
}

type ImageTier = "thumb" | "standard" | "master";

// HD trigger: when zoom exceeds this ratio of fit-to-screen, fetch master tier
const HD_ZOOM_THRESHOLD = 1.8;

// ---------- Hook: signed image URL fetcher ----------

function useSheetImageUrl(
  projectId: string,
  uploadId: string,
  sheetId: string | null,
  tier: ImageTier,
) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sheetId) return;
    let cancelled = false;
    setLoading(true);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;

    fetch(
      `${API_BASE}/projects/${projectId}/plan-sheets/${uploadId}/sheets/${sheetId}/image?tier=${tier}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.url) setUrl(data.url);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, uploadId, sheetId, tier]);

  return { url, loading };
}

// ---------- Component ----------

export function PlanSheetViewer({
  projectId,
  uploadId,
  sheets,
  initialSheetIndex = 0,
  onClose,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialSheetIndex);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [needsHd, setNeedsHd] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDistRef = useRef<number | null>(null);

  const sheet = sheets[currentIndex] ?? null;

  // Fetch standard-tier URL
  const { url: standardUrl } = useSheetImageUrl(
    projectId,
    uploadId,
    sheet?.id ?? null,
    "standard",
  );

  // Fetch master-tier URL only when zoom exceeds threshold
  const { url: masterUrl } = useSheetImageUrl(
    projectId,
    uploadId,
    needsHd ? (sheet?.id ?? null) : null,
    "master",
  );

  // The active image src — master when zoomed in + loaded, otherwise standard
  const imageSrc = useMemo(() => {
    if (needsHd && masterUrl) return masterUrl;
    return standardUrl;
  }, [needsHd, masterUrl, standardUrl]);

  // Check if we should trigger HD loading based on zoom level
  useEffect(() => {
    if (scale >= HD_ZOOM_THRESHOLD && !needsHd) {
      setNeedsHd(true);
    }
  }, [scale, needsHd]);

  // Reset state when switching sheets
  useEffect(() => {
    setScale(1);
    setPanX(0);
    setPanY(0);
    setNeedsHd(false);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          setCurrentIndex((i) => Math.max(0, i - 1));
          break;
        case "ArrowRight":
          setCurrentIndex((i) => Math.min(sheets.length - 1, i + 1));
          break;
        case "Escape":
          onClose();
          break;
        case "+":
        case "=":
          setScale((s) => Math.min(10, s * 1.25));
          break;
        case "-":
          setScale((s) => Math.max(0.1, s / 1.25));
          break;
        case "0":
          setScale(1);
          setPanX(0);
          setPanY(0);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sheets.length]);

  // Scroll-wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setScale((s) => Math.max(0.1, Math.min(10, s * factor)));
  }, []);

  // Mouse drag for pan
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panX, panY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanX(dragStartRef.current.panX + dx);
      setPanY(dragStartRef.current.panY + dy);
    },
    [isDragging],
  );

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch pinch-to-zoom
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastPinchDistRef.current = null;
      return;
    }
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (lastPinchDistRef.current !== null) {
      const ratio = dist / lastPinchDistRef.current;
      setScale((s) => Math.max(0.1, Math.min(10, s * ratio)));
    }
    lastPinchDistRef.current = dist;
  }, []);

  const onTouchEnd = useCallback(() => {
    lastPinchDistRef.current = null;
  }, []);

  const sheetLabel =
    sheet?.sheetId || sheet?.title || `Page ${sheet?.pageNo ?? "?"}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#111827",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "#1f2937",
          color: "#f9fafb",
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#f9fafb",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
          <span style={{ fontWeight: 600 }}>{sheetLabel}</span>
          <span style={{ color: "#9ca3af" }}>
            {currentIndex + 1} / {sheets.length}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            style={{
              background: "#374151",
              border: "none",
              color: "#f9fafb",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: currentIndex === 0 ? "default" : "pointer",
              opacity: currentIndex === 0 ? 0.4 : 1,
            }}
          >
            ◀ Prev
          </button>
          <button
            type="button"
            onClick={() =>
              setCurrentIndex((i) => Math.min(sheets.length - 1, i + 1))
            }
            disabled={currentIndex === sheets.length - 1}
            style={{
              background: "#374151",
              border: "none",
              color: "#f9fafb",
              borderRadius: 4,
              padding: "4px 10px",
              cursor:
                currentIndex === sheets.length - 1 ? "default" : "pointer",
              opacity: currentIndex === sheets.length - 1 ? 0.4 : 1,
            }}
          >
            Next ▶
          </button>

          <span style={{ color: "#9ca3af", fontSize: 12, marginLeft: 8 }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(10, s * 1.25))}
            style={zoomBtnStyle}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.1, s / 1.25))}
            style={zoomBtnStyle}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setPanX(0);
              setPanY(0);
            }}
            style={zoomBtnStyle}
          >
            Reset
          </button>
          {needsHd && (
            <span
              style={{
                fontSize: 10,
                background: "#059669",
                color: "#fff",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              HD
            </span>
          )}
        </div>
      </div>

      {/* Image viewport */}
      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          flex: 1,
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {imageSrc ? (
          <img
            ref={imgRef}
            src={imageSrc}
            alt={sheetLabel}
            draggable={false}
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
              transformOrigin: "center center",
              maxWidth: "none",
              maxHeight: "none",
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
          />
        ) : (
          <div style={{ color: "#9ca3af", fontSize: 14 }}>
            Loading sheet image…
          </div>
        )}
      </div>

      {/* Bottom sheet strip */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 16px",
          background: "#1f2937",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {sheets.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setCurrentIndex(i)}
            style={{
              border:
                i === currentIndex
                  ? "2px solid #3b82f6"
                  : "2px solid transparent",
              borderRadius: 4,
              padding: 2,
              background: "transparent",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 48,
                height: 36,
                background: "#374151",
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "#d1d5db",
              }}
            >
              {s.sheetId || s.pageNo}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  background: "#374151",
  border: "none",
  color: "#f9fafb",
  borderRadius: 4,
  padding: "4px 8px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1,
};
