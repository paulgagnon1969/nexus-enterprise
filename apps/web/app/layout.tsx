import "./globals.css";
import type { ReactNode } from "react";
import Providers from "./providers";
import { AppShell } from "./ui-shell";
import { cookies, headers } from "next/headers";
import { LanguageProvider, Locale } from "./language-context";

export const metadata = {
  title: "Nexus Enterprise",
  description: "Nexus project management portal",
  applicationName: "Nexus Enterprise",
  themeColor: "#0f172a",
};

const supportedLocales: Locale[] = ["en", "es"];

async function getLocaleFromRequest(): Promise<Locale> {
  // Try cookies() helper first.
  try {
    const store = await cookies();
    if (store && typeof store.get === "function") {
      const raw = store.get("locale")?.value as string | undefined;
      if (supportedLocales.includes(raw as Locale)) {
        return raw as Locale;
      }
    }
  } catch {
    // ignore and fall back to header parsing
  }

  // Fallback: parse Cookie header manually.
  try {
    const hdrs = await headers();
    const cookieHeader = hdrs && typeof hdrs.get === "function" ? hdrs.get("cookie") : undefined;
    if (cookieHeader) {
      const parts = cookieHeader.split(";").map((part: string) => part.trim());
      const match = parts.find((part: string) => part.startsWith("locale="));
      if (match) {
        const raw = match.split("=")[1];
        if (supportedLocales.includes(raw as Locale)) {
          return raw as Locale;
        }
      }
    }
  } catch {
    // ignore and fall back to default
  }

  return "en";
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocaleFromRequest();

  return (
    <html lang={locale}>
      <body>
        <LanguageProvider initialLocale={locale}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </LanguageProvider>
      </body>
    </html>
  );
}
