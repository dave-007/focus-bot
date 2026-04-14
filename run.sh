#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a
exec /Users/dave/.bun/bin/bun run start
