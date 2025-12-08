#!/usr/bin/env bash
set -e

echo "[dev-clean] Killing processes on ports 3000 and 8000 if any..."
PIDS="$(lsof -ti:3000 -ti:8000 || true)"

if [ -n "$PIDS" ]; then
  echo "[dev-clean] Killing PIDs: $PIDS"
  kill $PIDS || true
else
  echo "[dev-clean] No existing dev processes on 3000/8000."
fi

echo "[dev-clean] Done. Now run 'npm run dev:all' in this terminal to start servers."
