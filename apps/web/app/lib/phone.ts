export function formatPhone(raw: string | null | undefined, country?: string) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // If it already looks like an E.164 number, keep as-is for href and just
  // normalize spacing for display.
  if (s.startsWith("+")) {
    const digits = s.replace(/[^+0-9]/g, "");
    const href = `tel:${digits}`;
    const display = digits.replace(/(.{3})(?=.)/g, "$1 ");
    return { display, href };
  }

  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return null;

  const cc = (country || "US").toUpperCase();

  // Basic heuristics for US/CA formatting.
  if ((cc === "US" || cc === "CA") && (digits.length === 10 || digits.length === 11)) {
    let national = digits;
    if (national.length === 11 && national.startsWith("1")) {
      national = national.slice(1);
    }
    if (national.length === 10) {
      const area = national.slice(0, 3);
      const prefix = national.slice(3, 6);
      const line = national.slice(6);
      const display = `+1 ${area}.${prefix}.${line}`;
      const href = `tel:+1${national}`;
      return { display, href };
    }
  }

  // Fallback: treat as local digits, prepend country code only if we know it.
  const countryCodeByIso: Record<string, string> = {
    US: "1",
    CA: "1",
    GB: "44",
    UK: "44",
    AU: "61",
  };
  const ccDigits = countryCodeByIso[cc] || "";

  const e164 = ccDigits ? `+${ccDigits}${digits}` : `+${digits}`;
  const href = `tel:${e164}`;
  const grouped = digits.replace(/(.{3})(?=.)/g, "$1 ");
  const display = `${e164.slice(0, e164.length - digits.length)} ${grouped}`.trim();

  return { display, href };
}
