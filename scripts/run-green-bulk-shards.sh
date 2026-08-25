#!/usr/bin/env bash
# Launch 5 sharded green-mesh bulk workers for a timed run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="${TMPDIR:-/tmp}/teeready-green-shards"
mkdir -p "$LOG_DIR"
DEADLINE_MS="${DEADLINE_MS:-2280000}"
LIMIT="${LIMIT:-3000}"
for i in 0 1 2 3 4; do
  log="$LOG_DIR/shard-${i}.log"
  echo "Starting shard $i/5 → $log"
  node scripts/build-green-meshes.mjs \
    --bulk --all-catalog --skip-existing \
    --limit="$LIMIT" \
    --shard="${i}/5" \
    --deadline-ms="$DEADLINE_MS" \
    >"$log" 2>&1 &
  sleep 2
done
echo "All 5 shards started. Logs: $LOG_DIR/shard-*.log"
wait
echo "All shards finished."
