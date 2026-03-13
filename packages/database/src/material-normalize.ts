/**
 * NexCART — Material Normalization
 *
 * Converts Xactimate PETL descriptions and cost book descriptions into
 * canonical "material keys" used to:
 *   1. Consolidate the same material across rooms/line items
 *   2. Link PETL items to supplier catalog search queries
 *   3. Track drawdown in the MaterialDrawdownLedger
 *
 * Examples:
 *   "R&R - Drywall 1/2\" 4'x8'"         → "drywall-1/2in-4ftx8ft"
 *   "Lumber - 2\" x 4\" x 8' #2 & better" → "lumber-2inx4inx8ft"
 *   "3\" Deck screws - 1lb box"           → "deck-screws-3in"
 *   "Plywood 3/4\" 4'x8' CDX"            → "plywood-3/4in-4ftx8ft-cdx"
 */

// ── Labor / action prefixes (not material names) ─────────────────────────────

const LABOR_PREFIX_RE =
  /^(r\s*&\s*r|remove\s*(&|and)?\s*(re)?install|replace|install|apply|clean|haul|dispose|demolish|demo|detach|reset|mask|seal|tape|sand|prep|prime|finish|paint|texture|float|skim|caulk|labor)\s*[-–—:]?\s*/i;

// ── Noise phrases ────────────────────────────────────────────────────────────

const PER_UNIT_RE =
  /[-–—]?\s*per\s+\d*\s*(sf|sq\.?\s*ft|lf|lin\.?\s*ft|sy|sq\.?\s*yd|ea|each|unit|hr|hour|day|1000\s*sf)\b/gi;

const LEVEL_RE = /[-–—]?\s*level\s*\d+\s*(finish)?/gi;

const NOISE_RE =
  /\b(contents|additional|charge|minimum|setup|mobilization|small\s*job|large\s*job|high\s*wall|tall\s*wall|detach|reset|mask|&\s*reset|material\s*only)\b/gi;

const GRADE_NOISE_RE = /\s*&\s*better\b/gi;

// ── Dimension normalization ──────────────────────────────────────────────────

/** Convert 12' → 12ft, 2" → 2in */
function normalizeDimensions(s: string): string {
  // Feet: 12' / 12' / 12′
  s = s.replace(/(\d+(?:\/\d+)?)\s*['\u2018\u2019\u2032]/g, '$1ft');
  // Inches: 2" / 2" / 2″
  s = s.replace(/(\d+(?:\/\d+)?)\s*["\u201C\u201D\u2033]/g, '$1in');
  // Spelled-out: "2 inch" / "12 foot" / "2-inch"
  s = s.replace(/(\d+(?:\/\d+)?)\s*[-]?\s*inch(?:es)?\b/gi, '$1in');
  s = s.replace(/(\d+(?:\/\d+)?)\s*[-]?\s*f(?:oo|ee)t\b/gi, '$1ft');
  return s;
}

/** Normalize "x" separators in dimensions: "2in x 4in" → "2inx4in" */
function collapseDimensionSeparators(s: string): string {
  return s.replace(/(\d+(?:in|ft))\s*[xX×]\s*(\d)/g, '$1x$2');
}

// ── Key production ───────────────────────────────────────────────────────────

/**
 * Convert a raw Xactimate or cost book description into a canonical material key.
 *
 * Returns `null` if the description is pure labor with no material content.
 */
export function normalizeMaterialKey(raw: string): string | null {
  let q = raw;

  // 1. Strip labor prefixes
  q = q.replace(LABOR_PREFIX_RE, '');

  // 2. Strip noise
  q = q.replace(PER_UNIT_RE, '');
  q = q.replace(LEVEL_RE, '');
  q = q.replace(NOISE_RE, '');
  q = q.replace(GRADE_NOISE_RE, '');
  q = q.replace(/\(material\s*only\)/gi, '');

  // 3. Normalize dimensions BEFORE stripping punctuation
  q = normalizeDimensions(q);
  q = collapseDimensionSeparators(q);

  // 4. Strip leading/trailing punctuation
  q = q.replace(/^[-\u2013\u2014:,;.\s]+/, '').replace(/[-\u2013\u2014:,;.\s]+$/, '');

  // 5. Lowercase, replace spaces and non-alphanumeric with hyphens
  q = q.toLowerCase();
  q = q.replace(/[^a-z0-9/.-]+/g, '-');

  // 6. Collapse multiple hyphens
  q = q.replace(/-{2,}/g, '-');

  // 7. Strip leading/trailing hyphens
  q = q.replace(/^-+|-+$/g, '');

  // 8. If too short, it's not a material
  if (q.length < 3) return null;

  return q;
}

/**
 * Extract a clean search query from a normalized key (for supplier catalog search).
 * Converts hyphens back to spaces, expands abbreviations.
 */
export function materialKeyToSearchQuery(key: string): string {
  let q = key.replace(/-/g, ' ');
  // Expand common abbreviations for better search results
  q = q.replace(/\b(\d+(?:\/\d+)?)in\b/g, '$1 inch');
  q = q.replace(/\b(\d+(?:\/\d+)?)ft\b/g, '$1 foot');
  return q;
}
