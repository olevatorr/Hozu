#!/usr/bin/env bash
# Usage: rescore.sh <raw results root, with the uncommitted NN.jsonl transcripts> [trial root]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
raw=${1:?usage: rescore.sh <raw results root> [trial root]}
trial=${2:-$HOME/hozu-trial-0020}
for dir in "$here"/results/*/*/; do
  fw=$(basename "$(dirname "$dir")") run=$(basename "$dir")
  out="$dir/metrics-v2.jsonl"
  : > "$out"
  for k in $(seq 0 20); do
    node "$here/metrics.mjs" "$fw" "$trial/$fw-$run/app" "$k" "$dir" "$raw/$fw/$run" >> "$out"
  done
  echo "$fw/$run $(wc -l < "$out") rows"
done
