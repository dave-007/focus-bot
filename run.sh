#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a

/Users/dave/.bun/bin/bun run src/index.ts &
BUN_PID=$!

cleanup() {
  # Kill all bun processes running our index.ts (handles bun's internal worker spawning)
  pkill -TERM -f "bun.*src/index.ts" 2>/dev/null
  sleep 1
  pkill -9 -f "bun.*src/index.ts" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup SIGTERM SIGINT EXIT

wait $BUN_PID
