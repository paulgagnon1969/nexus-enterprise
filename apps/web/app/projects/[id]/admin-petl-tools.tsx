"use client";

import { startTransition, useState } from "react";
import { useBusyOverlay } from "../../busy-overlay-context";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function AdminPetlTools(props: {
  projectId: string;
  isAdminOrAbove: boolean;
  onDeleted: () => void;
}) {
  const { projectId, isAdminOrAbove, onDeleted } = props;

  const busyOverlay = useBusyOverlay();

  const [open, setOpen] = useState(false);
  const [petlDeleteBusy, setPetlDeleteBusy] = useState(false);
  const [petlDeleteMessage, setPetlDeleteMessage] = useState<string | null>(null);

  if (!isAdminOrAbove) return null;

  const deletePetlAndComponents = async () => {
    setPetlDeleteMessage(null);

    const ok = window.confirm(
      "Delete PETL + Components for this project?\n\nThis wipes all imported estimate versions, PETL line items, components, and related reconciliation/edit data. This cannot be undone.",
    );
    if (!ok) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPetlDeleteMessage("Missing access token.");
      return;
    }

    try {
      setPetlDeleteBusy(true);

      await busyOverlay.run("Deleting PETL + components…", async () => {
        const res = await fetch(`${API_BASE}/projects/${projectId}/petl`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setPetlDeleteMessage(`Delete failed (${res.status}). ${text || ""}`.trim());
          return;
        }

        // Close immediately so the interaction feels snappy.
        setOpen(false);

        // Push the heavy page state resets into a transition.
        startTransition(() => {
          onDeleted();
        });

        setPetlDeleteMessage("Deleted PETL + components for this project.");
      });
    } catch (err: any) {
      setPetlDeleteMessage(err?.message ?? "Delete failed.");
    } finally {
      setPetlDeleteBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "3px 10px",
          borderRadius: 999,
          border: "1px solid #b91c1c",
          background: "#fff1f2",
          color: "#b91c1c",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        Admin PETL Tools
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: 720,
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
              }}
            >
              <span>Admin PETL Tools</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close Admin PETL tools"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12 }}>
              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #fecaca",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#ffe4e6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Admin PETL tools</span>
                  <button
                    type="button"
                    disabled={petlDeleteBusy}
                    onClick={deletePetlAndComponents}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #b91c1c",
                      background: petlDeleteBusy ? "#e5e7eb" : "#b91c1c",
                      cursor: petlDeleteBusy ? "default" : "pointer",
                      fontSize: 12,
                      color: petlDeleteBusy ? "#4b5563" : "#ffffff",
                    }}
                  >
                    {petlDeleteBusy ? "Working…" : "Delete PETL + Components"}
                  </button>
                </div>
                <div style={{ padding: 10, fontSize: 12, color: "#7f1d1d" }}>
                  <div style={{ marginBottom: 6 }}>
                    Use this to wipe imported estimate data so you can re-import. This is destructive and
                    cannot be undone.
                  </div>
                  {petlDeleteMessage && (
                    <div
                      style={{
                        color: petlDeleteMessage.toLowerCase().includes("fail")
                          ? "#b91c1c"
                          : "#7f1d1d",
                      }}
                    >
                      {petlDeleteMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
