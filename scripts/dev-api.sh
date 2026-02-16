#!/bin/bash
# Safe API dev server starter - won't kill existing instances

PORT=${API_PORT:-8000}

# Check if something is already running on the port
if lsof -ti:$PORT > /dev/null 2>&1; then
    # Check if it's our API by hitting the health endpoint
    if curl -s "http://localhost:$PORT/health" 2>/dev/null | grep -q '"ok":true'; then
        echo "✓ API server already running on port $PORT"
        exit 0
    else
        echo "⚠ Port $PORT is in use by another process"
        echo "  Run: lsof -ti:$PORT | xargs kill -9"
        echo "  Or set API_PORT to use a different port"
        exit 1
    fi
fi

# Port is free, start the server
echo "Starting API server on port $PORT..."
cd "$(dirname "$0")/.." && npm run dev:api
