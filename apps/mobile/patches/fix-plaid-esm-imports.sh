#!/usr/bin/env bash
# Patch: fix react-native-plaid-link-sdk extensionless ESM imports for Node v24+
# The SDK uses `import { ... } from './PlaidLink'` without .js extension,
# which Node v24 rejects in ESM resolution. This patch adds .js extensions.
set -euo pipefail

PLAID_DIST="$(dirname "$0")/../../node_modules/react-native-plaid-link-sdk/dist"

if [ -f "$PLAID_DIST/index.js" ]; then
  # Only patch if not already patched
  if grep -q "from './PlaidLink'" "$PLAID_DIST/index.js" 2>/dev/null; then
    sed -i '' \
      -e "s|from './PlaidLink'|from './PlaidLink.js'|g" \
      -e "s|from './Types'|from './Types.js'|g" \
      -e "s|from './EmbeddedLink/EmbeddedLinkView'|from './EmbeddedLink/EmbeddedLinkView.js'|g" \
      "$PLAID_DIST/index.js"
    echo "[patch] Fixed Plaid SDK ESM imports (added .js extensions)"
  fi

  # Also fix PlaidLink.js internal imports if needed
  if [ -f "$PLAID_DIST/PlaidLink.js" ] && grep -q "from './Types'" "$PLAID_DIST/PlaidLink.js" 2>/dev/null; then
    sed -i '' "s|from './Types'|from './Types.js'|g" "$PLAID_DIST/PlaidLink.js"
    echo "[patch] Fixed Plaid SDK PlaidLink.js imports"
  fi

  # Fix EmbeddedLinkView.js if it exists
  if [ -f "$PLAID_DIST/EmbeddedLink/EmbeddedLinkView.js" ] && grep -q "from '../" "$PLAID_DIST/EmbeddedLink/EmbeddedLinkView.js" 2>/dev/null; then
    sed -i '' \
      -e "s|from '../PlaidLink'|from '../PlaidLink.js'|g" \
      -e "s|from '../Types'|from '../Types.js'|g" \
      "$PLAID_DIST/EmbeddedLink/EmbeddedLinkView.js"
    echo "[patch] Fixed Plaid SDK EmbeddedLinkView.js imports"
  fi
fi
