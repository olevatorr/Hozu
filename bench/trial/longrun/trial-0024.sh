#!/usr/bin/env bash
# Usage: trial-0024.sh <from-step> <to-step>
# ADR 0055: arms A (hozu cold), B (hozu warm) and C (nuxt) step by step; every arm finishes step k before k + 1.
set -uo pipefail
LR="$(cd "$(dirname "$0")" && pwd)"
R="${TRIAL_ROOT:-/Users/otischen/Developer/hozu-trial-0024}"
export TRIAL_ROOT="$R" RESULTS=results-0024 SETTINGS="$R/isolation.json"
FROM="${1:?from-step}" TO="${2:?to-step}"
mkdir -p "$R/logs"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$R/logs/trial-0024.log"; }
last() { grep -E "^step [0-9]+:" "$LR/results-0024/$1/run.log" 2>/dev/null | tail -n 1; }

for k in $(seq "$FROM" "$TO"); do
  if [ "$k" -ge 21 ]; then
    export CHANGES="$R/changes" HOZU_HELDOUT="$R/heldout/accept-heldout.mjs"
    [ -f "$HOZU_HELDOUT" ] && [ -f "$CHANGES/$(printf '%02d' "$k").md" ] || { log "step $k: no sealed held-out set"; exit 1; }
  fi
  log "step $k start"
  ARM=cold "$LR/run.sh" hozu cold 4801 "$k" "$k" > "$R/logs/cold-$k.txt" 2>&1 &
  ARM=warm "$LR/run.sh" hozu warm 4802 "$k" "$k" > "$R/logs/warm-$k.txt" 2>&1 &
  ARM=cold "$LR/run.sh" nuxt run1 4803 "$k" "$k" > "$R/logs/nuxt-$k.txt" 2>&1 &
  wait
  log "step $k done | cold: $(last hozu/cold) | warm: $(last hozu/warm) | nuxt: $(last nuxt/run1)"
done
log "steps $FROM-$TO finished"
