"use client";

import React from "react";
import type { DrawingTool } from "./drawing-layer-canvas";

// ---------- Types ----------

interface Props {
  tool: DrawingTool;
  brushColor: string;
  brushSize: number;
  activeLayerName: string | null;
  canEdit: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
}

// ---------- Preset colors ----------

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#000000", // black
  "#ffffff", // white
];

// ---------- Tool Button ----------

function ToolButton({
  icon,
  label,
  isActive,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 4,
        border: "none",
        background: isActive ? "#3b82f6" : "#374151",
        color: isActive ? "#fff" : "#d1d5db",
        fontSize: 16,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.1s",
      }}
    >
      {icon}
    </button>
  );
}

// ---------- Drawing Toolbar ----------

export function DrawingToolbar({
  tool,
  brushColor,
  brushSize,
  activeLayerName,
  canEdit,
  onToolChange,
  onColorChange,
  onSizeChange,
  onDeleteSelected,
  onUndo,
}: Props) {
  return (
    <div
      style={{
        padding: 12,
        borderTop: "1px solid #374151",
        background: "#1f2937",
      }}
    >
      {/* Active layer indicator */}
      {activeLayerName && (
        <div
          style={{
            fontSize: 10,
            color: "#9ca3af",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Editing: <span style={{ color: "#f9fafb" }}>{activeLayerName}</span>
        </div>
      )}

      {!canEdit && (
        <div
          style={{
            fontSize: 11,
            color: "#fbbf24",
            marginBottom: 8,
            background: "#78350f",
            padding: "4px 8px",
            borderRadius: 4,
          }}
        >
          Select a layer you own to edit
        </div>
      )}

      {/* Tool buttons */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <ToolButton
          icon="✎"
          label="Pen (draw freehand)"
          isActive={tool === "pen"}
          disabled={!canEdit}
          onClick={() => onToolChange("pen")}
        />
        <ToolButton
          icon="T"
          label="Text (click to add text)"
          isActive={tool === "text"}
          disabled={!canEdit}
          onClick={() => onToolChange("text")}
        />
        <ToolButton
          icon="⬚"
          label="Select (move/resize objects)"
          isActive={tool === "select"}
          disabled={!canEdit}
          onClick={() => onToolChange("select")}
        />
        <ToolButton
          icon="◯"
          label="Eraser"
          isActive={tool === "eraser"}
          disabled={!canEdit}
          onClick={() => onToolChange("eraser")}
        />

        <div style={{ width: 8 }} />

        <ToolButton
          icon="↩"
          label="Undo"
          isActive={false}
          disabled={!canEdit}
          onClick={onUndo}
        />
        <ToolButton
          icon="🗑"
          label="Delete selected"
          isActive={false}
          disabled={!canEdit}
          onClick={onDeleteSelected}
        />
      </div>

      {/* Color picker */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            color: "#9ca3af",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Color
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onColorChange(color)}
              disabled={!canEdit}
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                border:
                  color === brushColor
                    ? "2px solid #3b82f6"
                    : color === "#ffffff"
                      ? "1px solid #6b7280"
                      : "1px solid transparent",
                background: color,
                cursor: canEdit ? "pointer" : "not-allowed",
                opacity: canEdit ? 1 : 0.4,
              }}
              title={color}
            />
          ))}
          {/* Custom color input */}
          <input
            type="color"
            value={brushColor}
            onChange={(e) => onColorChange(e.target.value)}
            disabled={!canEdit}
            style={{
              width: 24,
              height: 24,
              padding: 0,
              border: "none",
              borderRadius: 4,
              cursor: canEdit ? "pointer" : "not-allowed",
              opacity: canEdit ? 1 : 0.4,
            }}
            title="Custom color"
          />
        </div>
      </div>

      {/* Brush size */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: "#9ca3af",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Size: {brushSize}px
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={brushSize}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          disabled={!canEdit}
          style={{
            width: "100%",
            cursor: canEdit ? "pointer" : "not-allowed",
            opacity: canEdit ? 1 : 0.4,
          }}
        />
      </div>
    </div>
  );
}
