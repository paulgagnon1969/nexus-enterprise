"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { NttComposeModal } from "./ntt-compose-modal";

export function NttBadge() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";

  const pagePath = pathname;
  const pageLabel = undefined; // optional; can be enhanced with breadcrumbs

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 900,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid #e5e7eb",
          backgroundColor: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(15,23,42,0.2)",
          cursor: "pointer",
        }}
        aria-label="Nexus Trouble Ticket"
      >
        <img
          src="/ntt-helpdesk.png"
          alt="NTT Helpdesk"
          style={{ width: 28, height: 28, objectFit: "contain" }}
        />
      </button>

      {open && (
        <NttComposeModal
          pagePath={pagePath}
          pageLabel={pageLabel}
          contextJson={undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
