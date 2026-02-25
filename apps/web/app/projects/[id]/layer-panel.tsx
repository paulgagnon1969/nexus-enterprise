"use client";

import React, { useMemo, useState } from "react";
import type { DrawLayer } from "./drawing-layer-canvas";

// ---------- Types ----------

interface Props {
  layers: DrawLayer[];
  activeLayerId: string | null;
  currentUserId: string;
  currentUserName: string;
  onAddLayer: (description: string) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
}

// ---------- Add Layer Modal ----------

function AddLayerModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (description: string) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 20,
          width: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>
          Add Drawing Layer
        </h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
          Describe the purpose of this layer (e.g., "Electrical routing",
          "Demo areas", "HVAC notes")
        </p>
        <input
          type="text"
          placeholder="Layer description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 13,
            marginBottom: 16,
            boxSizing: "border-box",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && description.trim()) {
              onConfirm(description.trim());
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => description.trim() && onConfirm(description.trim())}
            disabled={!description.trim()}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "none",
              background: description.trim() ? "#2563eb" : "#9ca3af",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: description.trim() ? "pointer" : "not-allowed",
            }}
          >
            Create Layer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Layer Panel ----------

export function LayerPanel({
  layers,
  activeLayerId,
  currentUserId,
  currentUserName,
  onAddLayer,
  onSelectLayer,
  onToggleVisibility,
  onDeleteLayer,
}: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Get unique authors for filter dropdown
  const authors = useMemo(() => {
    const authorMap = new Map<string, string>();
    layers.forEach((l) => {
      if (!authorMap.has(l.authorId)) {
        authorMap.set(l.authorId, l.authorName);
      }
    });
    return Array.from(authorMap.entries()).map(([id, name]) => ({ id, name }));
  }, [layers]);

  // Filter layers by author
  const filteredLayers = useMemo(() => {
    if (authorFilter === "all") return layers;
    if (authorFilter === "mine") return layers.filter((l) => l.authorId === currentUserId);
    return layers.filter((l) => l.authorId === authorFilter);
  }, [layers, authorFilter, currentUserId]);

  const handleAddLayer = (description: string) => {
    onAddLayer(description);
    setShowAddModal(false);
  };

  return (
    <div
      style={{
        width: 220,
        background: "#1f2937",
        borderLeft: "1px solid #374151",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #374151",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#9ca3af",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
          Layers
        </div>

        {/* Author filter */}
        <select
          value={authorFilter}
          onChange={(e) => setAuthorFilter(e.target.value)}
          style={{
            width: "100%",
            padding: "4px 6px",
            borderRadius: 4,
            border: "1px solid #374151",
            background: "#111827",
            color: "#f9fafb",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <option value="all">All Authors</option>
          <option value="mine">My Layers</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Layer list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
        }}
      >
        {filteredLayers.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "#6b7280",
              textAlign: "center",
            }}
          >
            No layers yet
          </div>
        )}

        {filteredLayers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          const isOwner = layer.authorId === currentUserId;

          return (
            <div
              key={layer.id}
              onClick={() => isOwner && onSelectLayer(layer.id)}
              style={{
                padding: "8px 12px",
                background: isActive ? "#374151" : "transparent",
                cursor: isOwner ? "pointer" : "default",
                borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
                opacity: layer.visible ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {/* Visibility toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  title={layer.visible ? "Hide layer" : "Show layer"}
                >
                  {layer.visible ? "👁" : "👁‍🗨"}
                </button>

                {/* Layer name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#f9fafb",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {layer.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#9ca3af",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {layer.authorName}
                  </div>
                </div>

                {/* Delete button (owner only) */}
                {isOwner && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(layer.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "2px 4px",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "#6b7280",
                      borderRadius: 2,
                    }}
                    title="Delete layer"
                  >
                    🗑
                  </button>
                )}
              </div>

              {/* Description */}
              {layer.description && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#6b7280",
                    marginTop: 4,
                    marginLeft: 22,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={layer.description}
                >
                  "{layer.description}"
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add layer button */}
      <div style={{ padding: 12, borderTop: "1px solid #374151" }}>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #374151",
            background: "#111827",
            color: "#f9fafb",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>+</span> Add Layer
        </button>
      </div>

      {/* Add layer modal */}
      {showAddModal && (
        <AddLayerModal
          onConfirm={handleAddLayer}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 20,
              width: 280,
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>
              Delete Layer?
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6b7280" }}>
              This will permanently delete all drawings on this layer.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteLayer(confirmDelete);
                  setConfirmDelete(null);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
