#!/usr/bin/env ts-node
/**
 * Generate API Service Token
 * 
 * Generates a long-lived JWT service token for automation (SOP sync, CAM sync, CI/CD).
 * Requires SUPER_ADMIN credentials.
 * 
 * Usage:
 *   npx ts-node scripts/generate-api-token.ts
 *   npx ts-node scripts/generate-api-token.ts --days 30
 *   npx ts-node scripts/generate-api-token.ts --label "sop-sync"
 * 
 * Environment:
 *   NEXUS_API_URL         - Base URL for the API (default: production)
 *   SUPER_ADMIN_EMAIL     - Email for SUPER_ADMIN account
 *   SUPER_ADMIN_PASSWORD  - Password for SUPER_ADMIN account
 * 
 * The script will output a token that can be added to .env as NEXUS_API_TOKEN
 */

const API_URL = process.env.NEXUS_API_URL || "https://nexus-api-284653632567.us-central1.run.app";

function parseArgs() {
  const args = process.argv.slice(2);
  let days = 90;
  let label = "sop-sync";

  const daysIndex = args.indexOf("--days");
  if (daysIndex !== -1 && args[daysIndex + 1]) {
    days = parseInt(args[daysIndex + 1], 10);
  }

  const labelIndex = args.indexOf("--label");
  if (labelIndex !== -1 && args[labelIndex + 1]) {
    label = args[labelIndex + 1];
  }

  return { days, label };
}

async function main() {
  const { days, label } = parseArgs();
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Generate Nexus API Service Token\n");
    console.log("Set environment variables:");
    console.log("  SUPER_ADMIN_EMAIL=your@email.com");
    console.log("  SUPER_ADMIN_PASSWORD=yourpassword");
    console.log("");
    console.log("Then run:");
    console.log("  SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npx ts-node scripts/generate-api-token.ts");
    console.log("");
    console.log("Options:");
    console.log("  --days <n>    Token expiry in days (default: 90, max: 365)");
    console.log("  --label <s>   Label for the token (default: sop-sync)");
    process.exit(1);
  }

  console.log(`\n🔑 Generating Nexus API Service Token`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Label: ${label}`);
  console.log(`   Expiry: ${days} days\n`);

  try {
    // Step 1: Login to get a short-lived token
    console.log("Step 1: Logging in...");
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.text();
      console.error(`Login failed: ${error}`);
      process.exit(1);
    }

    const loginData = await loginResponse.json();
    console.log("✓ Login successful");

    // Step 2: Create a long-lived service token
    console.log("Step 2: Creating service token...");
    const tokenResponse = await fetch(`${API_URL}/auth/service-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginData.accessToken}`,
      },
      body: JSON.stringify({ label, expiresInDays: days }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error(`Failed to create service token: ${error}`);
      process.exit(1);
    }

    const tokenData = await tokenResponse.json();
    console.log("✓ Service token created\n");

    console.log("=" .repeat(60));
    console.log("Add this to your .env file:\n");
    console.log(`NEXUS_API_TOKEN=${tokenData.token}`);
    console.log("");
    console.log("=" .repeat(60));
    console.log(`\nLabel: ${tokenData.label}`);
    console.log(`Expires: ${tokenData.expiresAt} (${tokenData.expiresInDays} days)`);
    console.log("\n✓ Done! Token is ready for use with npm run sops:sync\n");

  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
