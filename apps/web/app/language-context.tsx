"use client";

import React, {createContext, useContext, useMemo, useState} from "react";
import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";

const supportedLocales = ["en", "es"] as const;
export type Locale = (typeof supportedLocales)[number];

export type Messages = typeof enMessages;

interface LanguageContextValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    supportedLocales.includes(initialLocale) ? initialLocale : "en",
  );

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      document.cookie = `locale=${next}; path=/; max-age=31536000`;
    } catch {
      // ignore cookie write failures
    }
  };

  const messages = useMemo(() => {
    return locale === "es" ? esMessages : enMessages;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      messages,
      setLocale,
    }),
    [locale, messages],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
