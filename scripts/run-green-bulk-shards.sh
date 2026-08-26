#!/usr/bin/env bash
# Launch sharded green-mesh bulk workers for a timed run.
# Env: SHARDS (default 5), DEADLINE_MS (default 2280000), LIMIT (default 3000),
#      OUT_DIR (optional — passed as --out-dir= to the builder).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="${TMPDIR:-/tmp}/teeready-green-shards"
mkdir -p "$LOG_DIR"
SHARDS="${SHARDS:-5}"
DEADLINE_MS="${DEADLINE_MS:-2280000}"
LIMIT="${LIMIT:-3000}"
OUT_DIR="${OUT_DIR:-}"
OUT_ARGS=()
if [[ -n "$OUT_DIR" ]]; then
  OUT_ARGS+=(--out-dir="$OUT_DIR")
fi

progress_json() {
  local attempted=0 succeeded=0 skipped=0 rate429=0
  local f
  shopt -s nullglob
  for f in "$LOG_DIR"/shard-*.log; do
    # Succeeded: lines that wrote a mesh file
    succeeded=$((succeeded + $(grep -cE '^Wrote ' "$f" 2>/dev/null || true)))
    # Skipped: existing / sparse / mesh-too-few
    skipped=$((skipped + $(grep -cE '^skip |skip —|only [0-9]+ meshes — not writing' "$f" 2>/dev/null || true)))
    # 429 rate-limits from Overpass (and similar)
    rate429=$((rate429 + $(grep -cE '\b429\b' "$f" 2>/dev/null || true)))
  done
  shopt -u nullglob
  # Attempted ≈ terminal outcomes we can see in logs
  attempted=$((succeeded + skipped))
  printf '{"ts":"%s","attempted":%s,"succeeded":%s,"skipped":%s,"429s":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$attempted" "$succeeded" "$skipped" "$rate429"
}

for ((i = 0; i < SHARDS; i++)); do
  log="$LOG_DIR/shard-${i}.log"
  echo "Starting shard $i/$SHARDS → $log"
  node scripts/build-green-meshes.mjs \
    --bulk --all-catalog --skip-existing \
    --limit="$LIMIT" \
    --shard="${i}/${SHARDS}" \
    --deadline-ms="$DEADLINE_MS" \
    "${OUT_ARGS[@]}" \
    >"$log" 2>&1 &
  sleep 2
done
echo "All $SHARDS shards started. Logs: $LOG_DIR/shard-*.log"
if [[ -n "$OUT_DIR" ]]; then
  echo "Output dir: $OUT_DIR"
fi

# 60s JSON progress while workers run
(
  while true; do
    sleep 60
    # Stop when no shard PIDs remain under this job's children
    if ! pgrep -P $$ -f 'build-green-meshes.mjs' >/dev/null 2>&1; then
      break
    fi
    progress_json
  done
) &
PROGRESS_PID=$!

wait
# Final progress snapshot after all shards exit
progress_json || true
kill "$PROGRESS_PID" 2>/dev/null || true
wait "$PROGRESS_PID" 2>/dev/null || true
echo "All shards finished."
