"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignatureMethod = "TYPED" | "DRAWN" | "UPLOADED";

export interface SignaturePadProps {
  /** Called when the user confirms their signature */
  onSave: (base64: string, method: SignatureMethod) => void;
  /** Called when the user cancels */
  onCancel?: () => void;
  /** Whether to show a compact initials-only variant */
  initialsOnly?: boolean;
  /** Pre-fill typed name */
  defaultName?: string;
  /** Width of the drawing canvas (default 460) */
  width?: number;
  /** Height of the drawing canvas (default 180) */
  height?: number;
}

// Cursive fonts available for typed signatures
const CURSIVE_FONTS = [
  { name: "Brush Script", value: "'Brush Script MT', 'Brush Script Std', cursive" },
  { name: "Segoe Script", value: "'Segoe Script', 'Apple Chancery', cursive" },
  { name: "Comic Sans", value: "'Comic Sans MS', 'Comic Neue', cursive" },
  { name: "Georgia Italic", value: "Georgia, 'Times New Roman', serif" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignaturePad({
  onSave,
  onCancel,
  initialsOnly = false,
  defaultName = "",
  width = 460,
  height = 180,
}: SignaturePadProps) {
  const [method, setMethod] = useState<SignatureMethod>("DRAWN");
  const [typedText, setTypedText] = useState(defaultName);
  const [selectedFont, setSelectedFont] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Fabric.js refs
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);

  // ---------------------------------------------------------------------------
  // Initialize Fabric.js canvas for DRAWN mode
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (method !== "DRAWN") return;
    if (!canvasElRef.current) return;

    // Dynamic import to avoid SSR issues (Fabric.js uses window)
    let disposed = false;

    (async () => {
      const fabric = await import("fabric");
      if (disposed || !canvasElRef.current) return;

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width,
        height: initialsOnly ? 100 : height,
        isDrawingMode: true,
        backgroundColor: "#ffffff",
      });

      const brush = new fabric.PencilBrush(canvas);
      brush.color = "#1e3a5f";
      brush.width = 2.5;
      canvas.freeDrawingBrush = brush;

      canvas.on("path:created", () => {
        setHasDrawn(true);
      });

      fabricRef.current = canvas;
    })();

    return () => {
      disposed = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
      setHasDrawn(false);
    };
  }, [method, width, height, initialsOnly]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleClear = useCallback(() => {
    if (method === "DRAWN" && fabricRef.current) {
      fabricRef.current.clear();
      fabricRef.current.backgroundColor = "#ffffff";
      fabricRef.current.renderAll();
      setHasDrawn(false);
    } else if (method === "TYPED") {
      setTypedText("");
    } else if (method === "UPLOADED") {
      setUploadPreview(null);
    }
  }, [method]);

  const handleSave = useCallback(() => {
    if (method === "DRAWN") {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
      onSave(dataUrl, "DRAWN");
    } else if (method === "TYPED") {
      if (!typedText.trim()) return;
      // Render typed signature to a canvas for consistent output
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = width * 2;
      tmpCanvas.height = (initialsOnly ? 100 : height) * 2;
      const ctx = tmpCanvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
      ctx.fillStyle = "#1e3a5f";
      const fontSize = initialsOnly ? 48 : 56;
      ctx.font = `${fontSize}px ${CURSIVE_FONTS[selectedFont].value}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedText, tmpCanvas.width / 2, tmpCanvas.height / 2);
      onSave(tmpCanvas.toDataURL("image/png"), "TYPED");
    } else if (method === "UPLOADED" && uploadPreview) {
      onSave(uploadPreview, "UPLOADED");
    }
  }, [method, typedText, selectedFont, uploadPreview, onSave, width, height, initialsOnly]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const canSave =
    (method === "DRAWN" && hasDrawn) ||
    (method === "TYPED" && typedText.trim().length > 0) ||
    (method === "UPLOADED" && uploadPreview !== null);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Method toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["DRAWN", "TYPED", "UPLOADED"] as SignatureMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: method === m ? 700 : 500,
              cursor: "pointer",
              border: method === m ? "2px solid #2563eb" : "1px solid #d1d5db",
              background: method === m ? "#eff6ff" : "#fff",
              color: method === m ? "#1e40af" : "#4b5563",
              transition: "all 0.15s",
            }}
          >
            {m === "DRAWN" ? "✍️ Draw" : m === "TYPED" ? "⌨️ Type" : "📎 Upload"}
          </button>
        ))}
      </div>

      {/* Canvas area */}
      <div
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 8,
          overflow: "hidden",
          background: "#fff",
          position: "relative",
        }}
      >
        {/* DRAWN mode */}
        {method === "DRAWN" && (
          <div>
            <canvas
              ref={canvasElRef}
              style={{ display: "block", cursor: "crosshair" }}
            />
            {!hasDrawn && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  color: "#9ca3af",
                  fontSize: 14,
                }}
              >
                {initialsOnly ? "Draw your initials here" : "Draw your signature here"}
              </div>
            )}
          </div>
        )}

        {/* TYPED mode */}
        {method === "TYPED" && (
          <div style={{ padding: 16 }}>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(initialsOnly ? e.target.value.slice(0, 4) : e.target.value)}
              placeholder={initialsOnly ? "Initials (e.g. JD)" : "Type your full legal name"}
              maxLength={initialsOnly ? 4 : 100}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                boxSizing: "border-box",
                marginBottom: 10,
              }}
              autoFocus
            />
            {/* Font selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {CURSIVE_FONTS.map((font, i) => (
                <button
                  key={font.name}
                  onClick={() => setSelectedFont(i)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: "pointer",
                    border: selectedFont === i ? "2px solid #2563eb" : "1px solid #e5e7eb",
                    background: selectedFont === i ? "#eff6ff" : "#f9fafb",
                    fontFamily: font.value,
                    color: "#374151",
                  }}
                >
                  {font.name}
                </button>
              ))}
            </div>
            {/* Live preview */}
            {typedText && (
              <div
                style={{
                  height: initialsOnly ? 60 : height - 90,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f9fafb",
                  borderRadius: 6,
                  fontFamily: CURSIVE_FONTS[selectedFont].value,
                  fontSize: initialsOnly ? 32 : 40,
                  fontStyle: CURSIVE_FONTS[selectedFont].name === "Georgia Italic" ? "italic" : "normal",
                  color: "#1e3a5f",
                  userSelect: "none",
                }}
              >
                {typedText}
              </div>
            )}
          </div>
        )}

        {/* UPLOADED mode */}
        {method === "UPLOADED" && (
          <div style={{ padding: 16 }}>
            {!uploadPreview ? (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: initialsOnly ? 80 : height - 32,
                  border: "2px dashed #d1d5db",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "#6b7280",
                  fontSize: 13,
                  gap: 6,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget.style.borderColor = "#2563eb"); }}
                onMouseLeave={(e) => { (e.currentTarget.style.borderColor = "#d1d5db"); }}
              >
                📎 Click or drag to upload signature image
                <span style={{ fontSize: 11, color: "#9ca3af" }}>PNG, JPG, or SVG</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>
            ) : (
              <div style={{ textAlign: "center" }}>
                <img
                  src={uploadPreview}
                  alt="Signature preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: initialsOnly ? 80 : height - 32,
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={handleClear}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 12,
            color: "#6b7280",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: canSave ? "#059669" : "#d1d5db",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              cursor: canSave ? "pointer" : "not-allowed",
              transition: "background 0.15s",
            }}
          >
            {initialsOnly ? "Confirm Initials" : "Confirm Signature"}
          </button>
        </div>
      </div>

      {/* Legal note */}
      <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, textAlign: "center" }}>
        By signing, you agree that this electronic signature is the legal equivalent of your handwritten signature.
      </p>
    </div>
  );
}
