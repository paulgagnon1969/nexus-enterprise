#!/bin/bash
# Kill stale nexus-applet processes before starting fresh

echo "🧹 Cleaning up stale nexus-applet processes..."

# Kill any existing Tauri dev processes for this app
pkill -f "nexus-applet" 2>/dev/null && echo "  ✓ Killed nexus-applet processes" || true

# Kill Vite dev servers on common ports (1420 is Tauri's default)
for port in 1420 1421 1422; do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null && echo "  ✓ Killed process on port $port (PID $pid)" || true
  fi
done

# Kill any orphaned rust-analyzer or cargo processes from previous builds
pkill -f "cargo.*nexus-applet" 2>/dev/null && echo "  ✓ Killed stale cargo processes" || true

# Small delay to ensure ports are released
sleep 1

echo "✅ Cleanup complete"
