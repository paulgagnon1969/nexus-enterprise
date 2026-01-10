"use client";

import React, { useState } from "react";
import { MessageComposer } from "./message-composer";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type NttComposeModalProps = {
  pagePath: string;
  pageLabel?: string;
  contextJson?: Record<string, any>;
  onClose: () => void;
};

export function NttComposeModal({ pagePath, pageLabel, contextJson, onClose }: NttComposeModalProps) {
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmitNtt(payload: {
    subjectType: string;
    summary: string;
    description: string;
    tags: string[];
    links: { url: string; label?: string }[];
  }) {
    setError(null);
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    const tagCodes = payload.tags;

    const body = {
      subjectType: payload.subjectType,
      summary: payload.summary || pageLabel || pagePath,
      description: payload.description,
      pagePath,
      pageLabel,
      contextJson,
      tagCodes,
    };

    const res = await fetch(`${API_BASE}/ntt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError(`Failed to submit NTT ticket (${res.status})`);
      return;
    }

    const json: any = await res.json();
    setTicketId(json?.id ?? null);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Nexus Trouble Ticket</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Page: {pageLabel ?? pagePath}
        </p>

        {ticketId ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13 }}>
              Your Nexus Trouble Ticket has been created.
            </p>
            <p style={{ fontSize: 12, color: "#4b5563" }}>Reference ID: {ticketId}</p>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 8,
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "#0f766e",
                color: "#f9fafb",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {error && (
              <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>Error: {error}</p>
            )}

            <div style={{ marginTop: 8 }}>
              <MessageComposer mode="ntt" onSubmitNtt={handleSubmitNtt} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
