"use client";

import { useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function HomePage() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then((me: any) => {
        if (me?.userType === "APPLICANT") {
          window.location.href = "/candidate";
        } else if (me?.globalRole === "SUPER_ADMIN") {
          window.location.href = "/system";
        } else {
          window.location.href = "/projects";
        }
      })
      .catch(() => {
        window.location.href = "/projects";
      });
  }, []);

  return null;
}
