"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";
import { Canvas, PencilBrush, IText, FabricObject } from "fabric";

// ---------- Types ----------

export interface DrawLayer {
  id: string;
  name: string;
  description: string;
  visible: boolean;
  locked: boolean;
  fabricJson: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export type DrawingTool = "select" | "pen" | "text" | "eraser";

export interface DrawingLayerCanvasRef {
  exportLayerJson: () => string;
  loadLayerJson: (json: string) => void;
  clearCanvas: () => void;
  deleteSelected: () => void;
  undo: () => void;
}

interface Props {
  width: number;
  height: number;
  scale: number;
  panX: number;
  panY: number;
  imageWidth: number;
  imageHeight: number;
  tool: DrawingTool;
  brushColor: string;
  brushSize: number;
  isDrawingMode: boolean;
  onCanvasChange?: () => void;
}

// ---------- Component ----------

export const DrawingLayerCanvas = forwardRef<DrawingLayerCanvasRef, Props>(
  function DrawingLayerCanvas(
    {
      width,
      height,
      scale,
      panX,
      panY,
      imageWidth,
      imageHeight,
      tool,
      brushColor,
      brushSize,
      isDrawingMode,
      onCanvasChange,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);

    // Initialize Fabric canvas
    useEffect(() => {
      if (!canvasRef.current) return;

      const canvas = new Canvas(canvasRef.current, {
        width,
        height,
        selection: tool === "select",
        isDrawingMode: tool === "pen" || tool === "eraser",
      });

      fabricRef.current = canvas;

      // Set up drawing brush
      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = brushColor;
      canvas.freeDrawingBrush.width = brushSize;

      // Track changes for auto-save
      const handleChange = () => {
        onCanvasChange?.();
        // Save to history
        const json = JSON.stringify(canvas.toJSON());
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(json);
        historyIndexRef.current = historyRef.current.length - 1;
      };

      canvas.on("object:added", handleChange);
      canvas.on("object:modified", handleChange);
      canvas.on("object:removed", handleChange);

      // Handle text tool clicks
      canvas.on("mouse:down", (e) => {
        if (tool === "text" && !e.target) {
          const pointer = canvas.getScenePoint(e.e);
          const text = new IText("Type here", {
            left: pointer.x,
            top: pointer.y,
            fontSize: 16 / scale, // Scale-adjusted font size
            fill: brushColor,
            fontFamily: "Inter, system-ui, sans-serif",
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
        }
      });

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only initialize once

    // Update canvas dimensions
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.setDimensions({ width, height });
    }, [width, height]);

    // Update drawing mode and tool
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (!isDrawingMode) {
        canvas.isDrawingMode = false;
        canvas.selection = false;
        // Disable object selection when in view mode
        canvas.forEachObject((obj) => {
          obj.selectable = false;
          obj.evented = false;
        });
      } else {
        canvas.selection = tool === "select";
        canvas.isDrawingMode = tool === "pen" || tool === "eraser";
        
        // Enable object selection in draw mode
        canvas.forEachObject((obj) => {
          obj.selectable = tool === "select";
          obj.evented = tool === "select" || tool === "text";
        });
      }
    }, [isDrawingMode, tool]);

    // Update brush settings
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || !canvas.freeDrawingBrush) return;

      canvas.freeDrawingBrush.color = tool === "eraser" ? "#ffffff" : brushColor;
      canvas.freeDrawingBrush.width = tool === "eraser" ? brushSize * 3 : brushSize;
    }, [brushColor, brushSize, tool]);

    // Apply zoom/pan transform to the canvas
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Calculate the transform to align canvas content with the image
      // The image is centered in the viewport and transformed
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Reset and apply new transform
      canvas.setViewportTransform([
        scale,
        0,
        0,
        scale,
        centerX + panX - (imageWidth * scale) / 2,
        centerY + panY - (imageHeight * scale) / 2,
      ]);
    }, [scale, panX, panY, width, height, imageWidth, imageHeight]);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      exportLayerJson: () => {
        const canvas = fabricRef.current;
        if (!canvas) return "{}";
        return JSON.stringify(canvas.toJSON());
      },
      loadLayerJson: (json: string) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        try {
          const parsed = JSON.parse(json);
          canvas.loadFromJSON(parsed).then(() => {
            canvas.renderAll();
          });
        } catch (e) {
          console.error("Failed to load layer JSON:", e);
        }
      },
      clearCanvas: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.clear();
        onCanvasChange?.();
      },
      deleteSelected: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObjects();
        if (active.length > 0) {
          active.forEach((obj) => canvas.remove(obj));
          canvas.discardActiveObject();
          canvas.renderAll();
          onCanvasChange?.();
        }
      },
      undo: () => {
        const canvas = fabricRef.current;
        if (!canvas || historyIndexRef.current <= 0) return;
        historyIndexRef.current--;
        const json = historyRef.current[historyIndexRef.current];
        if (json) {
          canvas.loadFromJSON(JSON.parse(json)).then(() => {
            canvas.renderAll();
          });
        }
      },
    }), [onCanvasChange]);

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: isDrawingMode ? "auto" : "none",
        }}
      />
    );
  },
);
