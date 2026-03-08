#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NexBRIDGE Connect — Build, Sign, and Publish Auto-Update
#
# Usage:
#   bash scripts/build-and-publish.sh [--skip-build]
#
# What it does:
#   1. Reads version from tauri.conf.json
#   2. Builds universal macOS app (aarch64 + x86_64) via `tauri build`
#   3. Tauri automatically signs the .app.tar.gz updater bundles using
#      TAURI_SIGNING_PRIVATE_KEY
#   4. Uploads the signed bundles to MinIO (nexbridge-updates bucket)
#   5. Publishes the update manifest via the API
#   6. Copies the DMG to WARP TMP
#
# Prerequisites:
#   - TAURI_SIGNING_PRIVATE_KEY env var (or .tauri-updater-key file)
#   - .env.shadow sourced (for MINIO_ACCESS_KEY, MINIO_SECRET_KEY)
#   - mc (MinIO client) installed: brew install minio/stable/mc
#   - Rust toolchain for both targets: aarch64-apple-darwin, x86_64-apple-darwin
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
TAURI_DIR="$APP_DIR/src-tauri"

# ── Load secrets ──────────────────────────────────────────────────────────
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  KEY_FILE="$REPO_ROOT/.tauri-updater-key"
  if [[ -f "$KEY_FILE" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY
    TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
  else
    echo "ERROR: No signing key found. Set TAURI_SIGNING_PRIVATE_KEY or create $KEY_FILE"
    exit 1
  fi
fi

# Load MinIO creds from .env.shadow
if [[ -f "$REPO_ROOT/.env.shadow" ]]; then
  set -a; source "$REPO_ROOT/.env.shadow"; set +a
fi

# ── Parse version from tauri.conf.json ────────────────────────────────────
VERSION=$(python3 -c "import json; print(json.load(open('$TAURI_DIR/tauri.conf.json'))['version'])")
echo "📦 Building NexBRIDGE Connect v${VERSION}"

# ── Timestamp for filenames ───────────────────────────────────────────────
TS=$(date +%Y%m%d-%H%M%S)

# ── Build (both architectures) ────────────────────────────────────────────
if [[ "${1:-}" != "--skip-build" ]]; then
  echo ""
  echo "🔨 Building aarch64 (Apple Silicon)..."
  (cd "$APP_DIR" && npm run tauri build -- --target aarch64-apple-darwin 2>&1)

  echo ""
  echo "🔨 Building x86_64 (Intel)..."
  (cd "$APP_DIR" && npm run tauri build -- --target x86_64-apple-darwin 2>&1)

  # Also build universal binary
  echo ""
  echo "🔨 Building universal binary..."
  (cd "$APP_DIR" && npm run tauri build -- --target universal-apple-darwin 2>&1)
fi

# ── Locate build artifacts ────────────────────────────────────────────────
# Tauri may use an external CARGO_TARGET_DIR (build cache on fast storage).
# Check both the default target dir and the external cache.
EXTERNAL_CACHE="/Volumes/4T Data/nexus-build-cache/nexbridge-connect-apps-target"

if [[ -d "$EXTERNAL_CACHE/aarch64-apple-darwin/release/bundle" ]]; then
  AARCH64_BUNDLE="$EXTERNAL_CACHE/aarch64-apple-darwin/release/bundle"
else
  AARCH64_BUNDLE="$TAURI_DIR/target/aarch64-apple-darwin/release/bundle"
fi

if [[ -d "$EXTERNAL_CACHE/x86_64-apple-darwin/release/bundle" ]]; then
  X86_64_BUNDLE="$EXTERNAL_CACHE/x86_64-apple-darwin/release/bundle"
else
  X86_64_BUNDLE="$TAURI_DIR/target/x86_64-apple-darwin/release/bundle"
fi

if [[ -d "$EXTERNAL_CACHE/universal-apple-darwin/release/bundle" ]]; then
  UNIVERSAL_BUNDLE="$EXTERNAL_CACHE/universal-apple-darwin/release/bundle"
else
  UNIVERSAL_BUNDLE="$TAURI_DIR/target/universal-apple-darwin/release/bundle"
fi

# Tauri v2 produces .app.tar.gz and .app.tar.gz.sig in the macos folder
AARCH64_TARGZ=$(ls "$AARCH64_BUNDLE/macos/"*.app.tar.gz 2>/dev/null | head -1)
AARCH64_SIG=$(ls "$AARCH64_BUNDLE/macos/"*.app.tar.gz.sig 2>/dev/null | head -1)
X86_64_TARGZ=$(ls "$X86_64_BUNDLE/macos/"*.app.tar.gz 2>/dev/null | head -1)
X86_64_SIG=$(ls "$X86_64_BUNDLE/macos/"*.app.tar.gz.sig 2>/dev/null | head -1)
UNIVERSAL_DMG=$(ls "$UNIVERSAL_BUNDLE/dmg/"*.dmg 2>/dev/null | head -1)

if [[ -z "$AARCH64_TARGZ" || -z "$X86_64_TARGZ" ]]; then
  echo "ERROR: Could not find .app.tar.gz updater bundles."
  echo "  Expected in: $AARCH64_BUNDLE/macos/ and $X86_64_BUNDLE/macos/"
  exit 1
fi

echo ""
echo "✅ Build artifacts:"
echo "  aarch64: $(basename "$AARCH64_TARGZ")"
echo "  x86_64:  $(basename "$X86_64_TARGZ")"
[[ -n "$UNIVERSAL_DMG" ]] && echo "  DMG:     $(basename "$UNIVERSAL_DMG")"

# ── Read signatures ───────────────────────────────────────────────────────
AARCH64_SIGNATURE=$(cat "$AARCH64_SIG")
X86_64_SIGNATURE=$(cat "$X86_64_SIG")

# ── Configure MinIO client ────────────────────────────────────────────────
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ALIAS="nexus-minio"

mc alias set "$MINIO_ALIAS" "http://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_ACCESS_KEY:-minioadmin}" "${MINIO_SECRET_KEY:-minioadmin}" --api S3v4 2>/dev/null || true

# Ensure bucket exists
mc mb --ignore-existing "${MINIO_ALIAS}/nexbridge-updates" 2>/dev/null || true

# Make the bucket publicly readable (so Tauri can download without auth)
mc anonymous set download "${MINIO_ALIAS}/nexbridge-updates" 2>/dev/null || true

# ── Upload update bundles ─────────────────────────────────────────────────
echo ""
echo "📤 Uploading update bundles to MinIO..."

AARCH64_KEY="v${VERSION}/NexBRIDGE-Connect_${VERSION}_aarch64.app.tar.gz"
X86_64_KEY="v${VERSION}/NexBRIDGE-Connect_${VERSION}_x86_64.app.tar.gz"

mc cp "$AARCH64_TARGZ" "${MINIO_ALIAS}/nexbridge-updates/${AARCH64_KEY}"
mc cp "$X86_64_TARGZ" "${MINIO_ALIAS}/nexbridge-updates/${X86_64_KEY}"

echo "  ✅ Uploaded aarch64 bundle"
echo "  ✅ Uploaded x86_64 bundle"

# ── Build download URLs ───────────────────────────────────────────────────
# Use the public MinIO URL (tunneled or direct)
MINIO_PUBLIC_URL="${MINIO_PUBLIC_URL:-http://localhost:9000}"
AARCH64_URL="${MINIO_PUBLIC_URL}/nexbridge-updates/${AARCH64_KEY}"
X86_64_URL="${MINIO_PUBLIC_URL}/nexbridge-updates/${X86_64_KEY}"

# ── Publish manifest ─────────────────────────────────────────────────────
echo ""
echo "📋 Publishing update manifest v${VERSION}..."

MANIFEST=$(cat <<EOF
{
  "version": "${VERSION}",
  "notes": "NexBRIDGE Connect v${VERSION}",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "url": "${AARCH64_URL}",
      "signature": "${AARCH64_SIGNATURE}"
    },
    "darwin-x86_64": {
      "url": "${X86_64_URL}",
      "signature": "${X86_64_SIGNATURE}"
    }
  }
}
EOF
)

# Upload manifest directly to MinIO (so the API can read it)
echo "$MANIFEST" | mc pipe "${MINIO_ALIAS}/nexbridge-updates/latest.json"
echo "  ✅ Manifest published"

# ── Copy DMG to WARP TMP ─────────────────────────────────────────────────
WARP_TMP="/Volumes/4T Data/WARP TMP"
if [[ -d "$WARP_TMP" ]]; then
  BUILDS_DIR="$WARP_TMP/builds"
  mkdir -p "$BUILDS_DIR"

  if [[ -n "$UNIVERSAL_DMG" ]]; then
    DMG_NAME="nexbridge-connect-v${VERSION}-universal-${TS}.dmg"
    cp "$UNIVERSAL_DMG" "$BUILDS_DIR/$DMG_NAME"
    # Update latest symlink
    ln -sf "$DMG_NAME" "$BUILDS_DIR/nexbridge-connect-latest.dmg"
    echo ""
    echo "💾 DMG saved: $BUILDS_DIR/$DMG_NAME"
  fi
else
  echo ""
  echo "⚠️  WARP TMP volume not mounted — DMG not copied"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  NexBRIDGE Connect v${VERSION} — Published!"
echo ""
echo "  Update endpoint: staging-api.nfsgrp.com/updates/check"
echo "  MinIO bucket:    nexbridge-updates"
echo "  Platforms:       darwin-aarch64, darwin-x86_64"
echo ""
echo "  Existing installations will auto-update within 30 min"
echo "  (or immediately on next app launch)."
echo "═══════════════════════════════════════════════════════"
