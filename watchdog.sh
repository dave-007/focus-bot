#!/bin/bash
# Focus Bot Watchdog
# Checks the heartbeat file and restarts the service if stale (>3 minutes).
# Install: launchctl load ~/Library/LaunchAgents/com.focus-bot-watchdog.plist

HEARTBEAT_FILE="$HOME/Documents/DaveVault2/.focus-bot-heartbeat"
LOG_FILE="$HOME/Library/Logs/focus-bot-watchdog.log"
SERVICE_PLIST="$HOME/Library/LaunchAgents/com.focus-bot.plist"
MAX_AGE_SECONDS=180  # 3 minutes

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

# Check if heartbeat file exists
if [ ! -f "$HEARTBEAT_FILE" ]; then
  log "WARN: No heartbeat file found. Bot may not be running."
  # Try to restart
  launchctl unload "$SERVICE_PLIST" 2>/dev/null
  sleep 2
  pkill -9 -f "bun.*src/index.ts" 2>/dev/null
  sleep 1
  launchctl load "$SERVICE_PLIST"
  log "ACTION: Restarted focus-bot service (no heartbeat file)."
  exit 0
fi

# Check age of heartbeat file
HEARTBEAT_TIME=$(date -r "$HEARTBEAT_FILE" +%s 2>/dev/null)
NOW=$(date +%s)
AGE=$((NOW - HEARTBEAT_TIME))

if [ "$AGE" -gt "$MAX_AGE_SECONDS" ]; then
  log "WARN: Heartbeat is ${AGE}s old (max ${MAX_AGE_SECONDS}s). Restarting."
  launchctl unload "$SERVICE_PLIST" 2>/dev/null
  sleep 2
  pkill -9 -f "bun.*src/index.ts" 2>/dev/null
  sleep 1
  launchctl load "$SERVICE_PLIST"
  log "ACTION: Restarted focus-bot service (stale heartbeat: ${AGE}s)."
else
  log "OK: Heartbeat is ${AGE}s old."
fi
