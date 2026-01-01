import {cookies, headers} from "next/headers";
import {getRequestConfig} from "next-intl/server";

// next-intl request config: tells the library where to load messages per locale.
export default getRequestConfig(async () => {
  let locale: "en" | "es" = "en";

  // Primary path: try cookies() helper, but be defensive about its shape.
  try {
    const cookieStore: any = cookies();
    if (cookieStore && typeof cookieStore.get === "function") {
      const raw = cookieStore.get("locale")?.value as string | undefined;
      if (raw === "en" || raw === "es") {
        locale = raw;
      }
    }
  } catch {
    // fall through to header-based parsing
  }

  // Fallback: parse the Cookie header manually if we didn't get a locale yet.
  if (locale === "en") {
    try {
      const hdrs: any = headers();
      const cookieHeader = hdrs && typeof hdrs.get === "function" ? hdrs.get("cookie") : undefined;
      if (cookieHeader) {
        const parts = cookieHeader.split(";").map((part: string) => part.trim());
        const localePart = parts.find((part: string) => part.startsWith("locale="));
        if (localePart) {
          const raw = localePart.split("=")[1];
          if (raw === "en" || raw === "es") {
            locale = raw as "en" | "es";
          }
        }
      }
    } catch {
      // ignore and keep default
    }
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
