export function formatPhone(raw: string | null | undefined, country?: string) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // If it already looks like an E.164 number, prefer country-aware formatting
  // when possible (e.g., +1XXXXXXXXXX for US/CA), otherwise fall back to
  // grouped spacing.
  if (s.startsWith("+")) {
    const e164Digits = s.replace(/[^0-9]/g, "");
    if (!e164Digits) return null;

    const cc = (country || "US").toUpperCase();

    // Special handling for US/CA E.164 numbers like +16014411104 so they
    // display consistently with 10/11-digit US inputs (e.g., "+1 601.441.1104").
    if ((cc === "US" || cc === "CA") && e164Digits.length === 11 && e164Digits.startsWith("1")) {
      const national = e164Digits.slice(1); // strip country code
      const area = national.slice(0, 3);
      const prefix = national.slice(3, 6);
      const line = national.slice(6);
      const display = `+1 ${area}.${prefix}.${line}`;
      const href = `tel:+1${national}`;
      return { display, href };
    }

    // Generic fallback: keep E.164 for href and group remaining digits for
    // display without inserting dots.
    const href = `tel:+${e164Digits}`;
    const grouped = e164Digits.replace(/(.{3})(?=.)/g, "$1 ");
    const display = `+${grouped}`;
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
