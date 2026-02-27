/**
 * Lowe's IMS API Discovery Script
 *
 * Authenticates with the Lowe's IMS OAuth endpoint and probes known API
 * endpoint patterns to discover what your credentials give access to.
 *
 * Usage:
 *   npx ts-node scripts/lowes-api-discover.ts
 *
 * Requires LOWES_CLIENT_ID and LOWES_CLIENT_SECRET in .env (root).
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const AUTH_URL = "https://apim.lowes.com/auth/token";
const BASE = "https://apim.lowes.com";

const CLIENT_ID = process.env.LOWES_CLIENT_ID;
const CLIENT_SECRET = process.env.LOWES_CLIENT_SECRET;

// ---------------------------------------------------------------------------
// Known / likely IMS endpoint patterns (based on Azure APIM + IMS docs)
// ---------------------------------------------------------------------------
const PROBE_PATHS = [
  // Auth / meta
  "/auth/token",

  // Common IMS REST patterns
  "/v1/orders",
  "/v1/details",
  "/v1/activities",
  "/v1/notes",
  "/v1/documents",
  "/v1/schedules",
  "/v1/payments",
  "/v1/line-items",
  "/v1/customers",
  "/v1/products",
  "/v1/stores",
  "/v1/inventory",
  "/v1/catalog",
  "/v1/pricing",
  "/v1/purchase-requests",
  "/v1/work-orders",
  "/v1/support-requests",
  "/v1/job-exceptions",

  // IMS-specific paths
  "/ims/v1/orders",
  "/ims/v1/details",
  "/ims/v1/activities",
  "/ims/v1/notes",
  "/ims/v1/documents",
  "/ims/v1/payments",
  "/ims/v1/schedules",

  // API Management discovery
  "/apis",
  "/api",
  "/api/v1",
  "/openapi",
  "/swagger",
  "/swagger.json",
  "/openapi.json",
  "/v1",
  "/v2",

  // Purchase order events (seen in their APIM portal)
  "/v1/purchase-order-events",

  // Product / catalog (if available to your subscription)
  "/v1/product/search",
  "/v1/product/inventory",
  "/v1/product/pricing",
  "/v1/product/details",

  // Store locator
  "/v1/store/search",
  "/v1/stores/near",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  [key: string]: any;
}

async function getToken(): Promise<TokenResponse> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "LOWES_CLIENT_ID and LOWES_CLIENT_SECRET must be set in .env",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`\n❌ AUTH FAILED (${res.status}):`);
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  const data = JSON.parse(text) as TokenResponse;
  return data;
}

interface ProbeResult {
  path: string;
  url: string;
  status: number;
  statusText: string;
  contentType: string | null;
  bodyPreview: string;
  headers: Record<string, string>;
}

async function probe(
  token: string,
  urlPath: string,
): Promise<ProbeResult> {
  const url = `${BASE}${urlPath}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const ct = res.headers.get("content-type");
    const body = await res.text();

    // Collect interesting response headers
    const interesting = [
      "x-ms-request-id",
      "x-aspnet-version",
      "ocp-apim-trace-location",
      "x-powered-by",
      "www-authenticate",
      "retry-after",
    ];
    const hdrs: Record<string, string> = {};
    for (const h of interesting) {
      const val = res.headers.get(h);
      if (val) hdrs[h] = val;
    }

    return {
      path: urlPath,
      url,
      status: res.status,
      statusText: res.statusText,
      contentType: ct,
      bodyPreview: body.slice(0, 500),
      headers: hdrs,
    };
  } catch (err: any) {
    return {
      path: urlPath,
      url,
      status: 0,
      statusText: `ERROR: ${err?.message ?? err}`,
      contentType: null,
      bodyPreview: "",
      headers: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(70));
  console.log("  Lowe's IMS API Discovery");
  console.log("=".repeat(70));

  // Step 1: Authenticate
  console.log("\n🔑 Authenticating with Lowe's IMS OAuth...\n");
  const tokenData = await getToken();

  console.log("✅ Authentication successful!");
  console.log(`   token_type:  ${tokenData.token_type}`);
  console.log(`   expires_in:  ${tokenData.expires_in}s`);
  if (tokenData.scope) console.log(`   scope:       ${tokenData.scope}`);

  // Log any extra fields in the token response (may reveal available APIs)
  const knownKeys = new Set([
    "access_token",
    "token_type",
    "expires_in",
    "scope",
  ]);
  const extras = Object.keys(tokenData).filter((k) => !knownKeys.has(k));
  if (extras.length > 0) {
    console.log("\n   Extra token response fields:");
    for (const k of extras) {
      const val = String(tokenData[k]);
      // Don't print the actual token value
      if (k === "access_token") continue;
      console.log(`   ${k}: ${val.slice(0, 200)}`);
    }
  }

  const token = tokenData.access_token;

  // Step 2: Probe endpoints
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  Probing ${PROBE_PATHS.length} endpoint patterns...`);
  console.log(`${"─".repeat(70)}\n`);

  const results: ProbeResult[] = [];
  const accessible: ProbeResult[] = [];
  const denied: ProbeResult[] = [];
  const notFound: ProbeResult[] = [];
  const errors: ProbeResult[] = [];

  for (const p of PROBE_PATHS) {
    const r = await probe(token, p);
    results.push(r);

    const emoji =
      r.status >= 200 && r.status < 300
        ? "✅"
        : r.status === 401 || r.status === 403
          ? "🔒"
          : r.status === 404
            ? "  "
            : r.status === 0
              ? "💥"
              : "⚠️ ";

    // Only log non-404s to reduce noise
    if (r.status !== 404) {
      console.log(`${emoji} ${r.status || "ERR"} ${r.path}`);
      if (r.status >= 200 && r.status < 300) {
        console.log(`   Content-Type: ${r.contentType}`);
        console.log(`   Body preview: ${r.bodyPreview.slice(0, 200)}`);
      } else if (r.status === 401 || r.status === 403) {
        console.log(`   ${r.bodyPreview.slice(0, 150)}`);
      }
    }

    if (r.status >= 200 && r.status < 300) accessible.push(r);
    else if (r.status === 401 || r.status === 403) denied.push(r);
    else if (r.status === 404) notFound.push(r);
    else errors.push(r);

    // Small delay to not hammer the API
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Step 3: Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("  DISCOVERY SUMMARY");
  console.log(`${"=".repeat(70)}`);
  console.log(`\n  ✅ Accessible (2xx):    ${accessible.length}`);
  console.log(`  🔒 Auth denied (401/3): ${denied.length}`);
  console.log(`     Not found (404):     ${notFound.length}`);
  console.log(`  ⚠️  Other errors:        ${errors.length}`);

  if (accessible.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("  ACCESSIBLE ENDPOINTS");
    console.log(`${"─".repeat(70)}`);
    for (const r of accessible) {
      console.log(`\n  📍 ${r.path}`);
      console.log(`     Status: ${r.status} ${r.statusText}`);
      console.log(`     Content-Type: ${r.contentType}`);
      console.log(`     Body:\n${indent(r.bodyPreview, 5)}`);
    }
  }

  if (denied.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("  ENDPOINTS THAT EXIST BUT REQUIRE DIFFERENT ACCESS");
    console.log(`${"─".repeat(70)}`);
    for (const r of denied) {
      console.log(`  🔒 ${r.path} → ${r.status} ${r.statusText}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("  OTHER RESPONSES (may indicate valid endpoints)");
    console.log(`${"─".repeat(70)}`);
    for (const r of errors) {
      console.log(`  ⚠️  ${r.path} → ${r.status} ${r.statusText}`);
      if (r.bodyPreview) {
        console.log(`     ${r.bodyPreview.slice(0, 150)}`);
      }
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("  Done. Review the results above to see what Lowe's IMS");
  console.log("  gives your credentials access to.");
  console.log(`${"=".repeat(70)}\n`);
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
