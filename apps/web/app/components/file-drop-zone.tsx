"use client";

import React, { useCallback, useState, useRef } from "react";

export interface FileDropZoneProps {
  /** Called when files are dropped or selected */
  onFiles: (files: File[]) => void;
  /** Accepted file types (e.g., "image/*,application/pdf") */
  accept?: string;
  /** Allow multiple files */
  multiple?: boolean;
  /** Whether the drop zone is disabled */
  disabled?: boolean;
  /** Custom label for the upload button */
  buttonLabel?: string;
  /** Custom icon/emoji for the button */
  buttonIcon?: string;
  /** Show camera capture option on mobile */
  enableCamera?: boolean;
  /** Hint text shown below the drop zone */
  hint?: string;
  /** Children to render inside (for custom content) */
  children?: React.ReactNode;
  /** Minimum height of drop zone */
  minHeight?: number;
}

/**
 * FileDropZone - A drag-and-drop file upload component
 * 
 * Supports:
 * - Drag and drop from Finder (macOS) / File Explorer (Windows)
 * - Drag and drop from Apple Photos / Windows Photos
 * - Click to open file picker
 * - Mobile camera capture
 * - Visual feedback during drag
 */
export function FileDropZone({
  onFiles,
  accept = "image/*,application/pdf",
  multiple = true,
  disabled = false,
  buttonLabel = "Upload Files",
  buttonIcon = "📁",
  enableCamera = true,
  hint,
  children,
  minHeight = 80,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      const next = prev - 1;
      if (next === 0) {
        setIsDragging(false);
      }
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    if (disabled) return;

    const files: File[] = [];

    // Handle DataTransferItemList (preferred - supports Photos app)
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
            if (!multiple) break;
          }
        }
      }
    } 
    // Fallback to FileList (older browsers)
    else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
        if (!multiple) break;
      }
    }

    if (files.length > 0) {
      onFiles(files);
    }
  }, [disabled, multiple, onFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      files.push(fileList[i]);
    }

    onFiles(files);

    // Reset input so same file can be selected again
    e.target.value = "";
  }, [onFiles]);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        position: "relative",
        minHeight,
        padding: 12,
        borderRadius: 8,
        border: isDragging 
          ? "2px dashed #2563eb" 
          : "2px dashed #d1d5db",
        backgroundColor: isDragging 
          ? "#eff6ff" 
          : disabled 
            ? "#f9fafb" 
            : "#ffffff",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "default",
      }}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(37, 99, 235, 0.1)",
            borderRadius: 6,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
            }}
          >
            Drop files here
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {children || (
          <>
            <div style={{ fontSize: 28, opacity: 0.6 }}>
              {isDragging ? "📥" : "📂"}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>
              Drag & drop files here
              <br />
              <span style={{ fontSize: 11 }}>or</span>
            </div>
          </>
        )}

        {/* Upload button */}
        <button
          type="button"
          onClick={openFilePicker}
          disabled={disabled}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontSize: 12,
            fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => !disabled && (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={e => (e.currentTarget.style.background = "#ffffff")}
        >
          <span>{buttonIcon}</span>
          <span>{buttonLabel}</span>
        </button>

        {hint && (
          <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 4 }}>
            {hint}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={enableCamera ? "environment" : undefined}
        onChange={handleFileInputChange}
        style={{ display: "none" }}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Compact variant for inline use
 */
export function FileDropZoneCompact({
  onFiles,
  accept = "image/*,application/pdf",
  multiple = true,
  disabled = false,
  buttonLabel = "Upload",
  buttonIcon = "📷",
  enableCamera = true,
}: Omit<FileDropZoneProps, "minHeight" | "hint" | "children">) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files: File[] = [];
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
            if (!multiple) break;
          }
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
        if (!multiple) break;
      }
    }

    if (files.length > 0) {
      onFiles(files);
    }
  }, [disabled, multiple, onFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      files.push(fileList[i]);
    }

    onFiles(files);
    e.target.value = "";
  }, [onFiles]);

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 4,
        border: isDragging ? "1px solid #2563eb" : "1px solid #d1d5db",
        background: isDragging ? "#eff6ff" : "#f9fafb",
        fontSize: 11,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.1s",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span>{isDragging ? "📥" : buttonIcon}</span>
      <span>{isDragging ? "Drop here" : buttonLabel}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={enableCamera ? "environment" : undefined}
        onChange={handleFileInputChange}
        style={{ display: "none" }}
        disabled={disabled}
      />
    </label>
  );
}

export default FileDropZone;
