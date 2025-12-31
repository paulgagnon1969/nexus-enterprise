"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface NavDropdownItem {
  label: string;
  href: string;
}

export default function NavDropdown({
  label,
  items,
  active,
  closeDelayMs = 1000,
}: {
  label: string;
  items: NavDropdownItem[];
  active: boolean;
  closeDelayMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, closeDelayMs);
  };

  // Close on route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Cleanup pending timers.
  useEffect(() => {
    return () => {
      if (closeTimer.current != null) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  return (
    <div
      className="nexus-nav-dropdown"
      onMouseEnter={() => {
        cancelCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        scheduleClose();
      }}
    >
      <button
        type="button"
        className={"app-nav-link" + (active ? " app-nav-link-active" : "")}
        onClick={() => setOpen(v => !v)}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>

      {open && (
        <div
          className="nexus-nav-dropdown-menu"
          role="menu"
          aria-label={`${label} menu`}
          onMouseEnter={cancelCloseTimer}
          onMouseLeave={scheduleClose}
        >
          {items.map(item => (
            <button
              key={item.href}
              type="button"
              className="nexus-nav-dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push(item.href);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
