#!/usr/bin/env bash
set -euo pipefail

# Deploy the Nexus web app (apps/web) to production via Vercel.
#
# Usage:
#   ./scripts/deploy-web.sh
#
# Prereqs:
#   - Vercel CLI installed: npm i -g vercel
#   - You are logged in:   vercel login
#   - The apps/web directory is already linked to the correct Vercel project
#     (run `vercel link` once from apps/web if needed).
#   - The Vercel project is configured to deploy to GCP as you do today.
#
# Notes:
#   - This script runs a local production build first as a sanity check.
#   - The actual hosting and final URL are controlled by your Vercel+GCP setup.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"

cd "$WEB_DIR"

echo "[deploy-web] Running local production build (Next.js) for sanity check..."
npm run build

echo "[deploy-web] Deploying web app to production via Vercel CLI..."
# This uses the existing Vercel project configuration for apps/web.
vercel --prod

echo "[deploy-web] Done. Check the Vercel output above for the production URL and status."