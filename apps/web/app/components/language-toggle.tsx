"use client";

import {useRouter} from "next/navigation";
import {useLanguage} from "../language-context";

export function LanguageToggle() {
  const router = useRouter();
  const {locale, setLocale} = useLanguage();

  const handleClick = (nextLocale: "en" | "es") => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    router.refresh();
  };

  const baseSegmentStyle: React.CSSProperties = {
    padding: "2px 6px",
    fontSize: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#4b5563",
    transition: "background-color 120ms ease, color 120ms ease",
  };

  return (
    <div
      aria-label="Language switcher"
      style={{
        marginLeft: 12,
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: "1px solid #111827",
        overflow: "hidden",
        backgroundColor: "#f9fafb",
      }}
    >
      <button
        type="button"
        onClick={() => handleClick("en")}
        aria-pressed={locale === "en"}
        style={{
          ...baseSegmentStyle,
          backgroundColor: locale === "en" ? "#111827" : "transparent",
          color: locale === "en" ? "#ffffff" : baseSegmentStyle.color,
          fontWeight: locale === "en" ? 600 : 400,
        }}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handleClick("es")}
        aria-pressed={locale === "es"}
        style={{
          ...baseSegmentStyle,
          backgroundColor: locale === "es" ? "#111827" : "transparent",
          color: locale === "es" ? "#ffffff" : baseSegmentStyle.color,
          fontWeight: locale === "es" ? 600 : 400,
          borderLeft: "1px solid #111827",
        }}
      >
        ES
      </button>
    </div>
  );
}
