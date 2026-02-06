"use client";

import { useCallback, useRef, useState } from "react";

export type DraggableState = {
  /** Current X offset from original position */
  x: number;
  /** Current Y offset from original position */
  y: number;
  /** Whether the element is currently being dragged */
  isDragging: boolean;
};

export type UseDraggableReturn = {
  /** Current drag state */
  state: DraggableState;
  /** Style to apply to the draggable container (transform) */
  style: React.CSSProperties;
  /** Props to spread on the drag handle (typically the modal header) */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
  /** Reset position to origin */
  reset: () => void;
};

/**
 * Hook for making modal windows draggable.
 * 
 * Usage:
 * ```tsx
 * const draggable = useDraggable();
 * 
 * return (
 *   <div style={{ ...modalStyles, ...draggable.style }}>
 *     <div {...draggable.handleProps}>
 *       Modal Header (drag handle)
 *     </div>
 *     Modal content...
 *   </div>
 * );
 * ```
 */
export function useDraggable(): UseDraggableReturn {
  const [state, setState] = useState<DraggableState>({
    x: 0,
    y: 0,
    isDragging: false,
  });

  const dragStartRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle left mouse button or primary touch
    if (e.button !== 0) return;
    
    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest("textarea")
    ) {
      return;
    }

    e.preventDefault();
    
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: state.x,
      originY: state.y,
    };

    setState((prev) => ({ ...prev, isDragging: true }));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      // Capture ref value to avoid race condition with pointerup
      const dragStart = dragStartRef.current;
      if (!dragStart) return;

      const deltaX = moveEvent.clientX - dragStart.startX;
      const deltaY = moveEvent.clientY - dragStart.startY;
      const newX = dragStart.originX + deltaX;
      const newY = dragStart.originY + deltaY;

      setState((prev) => ({
        ...prev,
        x: newX,
        y: newY,
      }));
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      setState((prev) => ({ ...prev, isDragging: false }));
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }, [state.x, state.y]);

  const reset = useCallback(() => {
    setState({ x: 0, y: 0, isDragging: false });
  }, []);

  const style: React.CSSProperties = {
    transform: `translate(${state.x}px, ${state.y}px)`,
    transition: state.isDragging ? "none" : "transform 0.1s ease-out",
  };

  const handleProps = {
    onPointerDown: handlePointerDown,
    style: {
      cursor: state.isDragging ? "grabbing" : "grab",
      userSelect: "none" as const,
      touchAction: "none" as const,
    },
  };

  return {
    state,
    style,
    handleProps,
    reset,
  };
}
