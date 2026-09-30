#!/usr/bin/env bash
# Usage: run.sh prepare | [FROM_TAG=s12m] [FROM_APP=dir] [RESULTS=results-0021] run.sh <hozu|nuxt> <run-id> <port> [from-step] [to-step]
set -uo pipefail

LR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$LR/../../.." && pwd)"
R="${TRIAL_ROOT:-$HOME/hozu-trial-0020}"
TGZ="$R/tgz"
NODE_BIN="${NODE_BIN:-$HOME/.nvm/versions/node/v22.22.1/bin}"
export PATH="$NODE_BIN:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CHROMIUM_PATH="${CHROMIUM_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
for v in $(env | grep -o '^ORCA_[A-Z_]*'); do unset "$v"; done
WAIT_VOID="${WAIT_VOID:-1800}"
mkdir -p "$R/bin"
printf '#!/bin/sh\nexec corepack pnpm@10.33.0 "$@"\n' > "$R/bin/pnpm" && chmod +x "$R/bin/pnpm"
export PATH="$R/bin:$PATH"

if [ "${1:-}" = prepare ]; then
  mkdir -p "$TGZ"
  (cd "$ROOT" && pnpm build && pnpm -r --filter './packages/*' pack --pack-destination "$TGZ")
  exit $?
fi

FW="$1" RUN="$2" PORT="$3" FROM="${4:-0}" TO="${5:-20}"
W="$R/$FW-$RUN"
APP="$W/app"
OUT="$LR/${RESULTS:-results}/$FW/$RUN"
CHANGES="${CHANGES:-$LR/changes}"
mkdir -p "$OUT"
log() { echo "[$(date '+%F %T')] $FW/$RUN $*" | tee -a "$OUT/run.log"; }

scaffold() {
  mkdir -p "$W"
  if [ "$FW" = hozu ]; then
    rm -rf "$W/ct" && mkdir -p "$W/ct" && tar -xzf "$TGZ"/create-hozu-*.tgz -C "$W/ct"
    (cd "$W" && npm_config_user_agent="npm/10.9.0 node/v22.22.2" node ct/package/bin/create-hozu.js app --agent claude) || return 1
    node -e '
      const fs = require("fs"), path = require("path")
      const [pkgFile, dir] = process.argv.slice(1)
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"))
      const tgz = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.startsWith("hozu-")).map((f) => [`@hozu/${f.replace(/^hozu-/, "").replace(/-\d+\.\d+\.\d+\.tgz$/, "")}`, `file:${path.join(dir, f)}`]))
      for (const k of ["dependencies", "devDependencies"]) for (const d of Object.keys(pkg[k] ?? {})) if (tgz[d]) pkg[k][d] = tgz[d]
      pkg.overrides = tgz
      fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n")
    ' "$APP/package.json" "$TGZ"
    (cd "$APP" && npm install --no-audit --no-fund) > "$OUT/install.txt" 2>&1 || return 1
  else
    mkdir -p "$APP"
    (cd "$ROOT" && git archive HEAD bench/trial/nuxt-0006) | tar -x --strip-components=3 -C "$APP"
    (cd "$APP" && pnpm install --ignore-workspace) > "$OUT/install.txt" 2>&1 || return 1
  fi
  cd "$APP" || return 1
  git init -q
  printf 'node_modules\n.nuxt\n.output\n.data\ndist\n' >> .gitignore
  printf 'spec.md\nchange.md\n' >> .git/info/exclude
  git add -A && git commit -qm scaffold && git tag scaffold
}

void_result() {
  { tail -n 1 "$1"; cat "$2"; } 2>/dev/null |
    grep -qiE "hit your (session|usage|weekly) limit|usage limit reached|rate_limit_error|overloaded_error"
}

agent() {
  local k="$1" nn prompt pre attempt=0 code
  nn=$(printf '%02d' "$k")
  cd "$APP" || return 1
  pre=$(git rev-parse HEAD)
  while :; do
    attempt=$((attempt + 1))
    rm -f spec.md change.md
    if [ "$k" = 0 ]; then
      cp "$ROOT/bench/trial/notes/spec.md" spec.md
      prompt="$LR/prompts/build.md"
    else
      cp "$CHANGES/$nn.md" change.md
      prompt="$LR/prompts/change.md"
    fi
    log "step $nn attempt $attempt"
    [ -n "${DRY:-}" ] && { : > "$OUT/$nn.jsonl"; : > "$OUT/$nn.err"; } ||
    perl -e 'alarm shift; exec @ARGV' 1800 claude -p "$(sed "s/{{PORT}}/$PORT/g" "$prompt")" \
      --setting-sources project,local --strict-mcp-config --model claude-opus-5-5 \
      --dangerously-skip-permissions --output-format stream-json --verbose \
      > "$OUT/$nn.jsonl" 2> "$OUT/$nn.err"
    code=$?
    echo "$code" > "$OUT/$nn.exit"
    echo "$attempt" > "$OUT/$nn.attempts"
    for p in $(lsof -ti tcp:"$PORT" 2>/dev/null); do kill "$p" 2>/dev/null; done
    if void_result "$OUT/$nn.jsonl" "$OUT/$nn.err" && [ $attempt -lt 16 ]; then
      mv "$OUT/$nn.jsonl" "$OUT/$nn.void$attempt.jsonl"
      log "step $nn VOID (session limit); reset to $pre, waiting ${WAIT_VOID}s"
      git reset -q --hard "$pre" && git clean -qfd
      sleep "$WAIT_VOID"
      continue
    fi
    break
  done
  rm -f spec.md change.md
  git add -A && git commit -qm "step $nn" --allow-empty && git tag -f "s$nn" > /dev/null
}

measure() {
  local k="$1" nn entry
  nn=$(printf '%02d' "$k")
  cd "$APP" || return 1
  entry=$(node "$LR/entry.mjs" "$FW" "$APP")
  if [ "$FW" = hozu ]; then
    npx hozu check --json > "$OUT/$nn.check.json" 2> /dev/null
    node -e '
      const { execFileSync } = require("child_process")
      const lock = JSON.parse(require("fs").readFileSync("hozu.lock.json", "utf8"))
      const out = Object.keys(lock.features ?? {}).map((f) => { try { return JSON.parse(execFileSync("npx", ["hozu", "inspect", f, "--json"], { encoding: "utf8", maxBuffer: 1 << 26 })) } catch { return { feature: f, error: true } } })
      console.log(JSON.stringify(out.map((o) => ({ feature: o.feature, summary: o.summary }))))
    ' > "$OUT/$nn.inspect.json" 2> /dev/null || echo '[]' > "$OUT/$nn.inspect.json"
    local tmp; tmp=$(mktemp -d)
    npx hozu build --out "$tmp" > "$OUT/$nn.build.txt" 2>&1; echo $? > "$OUT/$nn.build.exit"
    rm -rf "$tmp"
  else
    pnpm typecheck > "$OUT/$nn.typecheck.txt" 2>&1; echo $? > "$OUT/$nn.typecheck.exit"
    pnpm build > "$OUT/$nn.build.txt" 2>&1; echo $? > "$OUT/$nn.build.exit"
  fi
  node "$LR/accept.mjs" "$FW" "$APP" "$entry" "$PORT" "$k" > "$OUT/$nn.accept.json" 2> "$OUT/$nn.accept.err"
  for p in $(lsof -ti tcp:"$PORT" 2>/dev/null); do kill "$p" 2>/dev/null; done
  local prev=""
  [ -n "${FROM_TAG:-}" ] && [ "$k" = "$FROM" ] && prev="$FROM_TAG"
  PREV_TAG="$prev" node "$LR/metrics.mjs" "$FW" "$APP" "$k" "$OUT" >> "$OUT/metrics.jsonl"
  node "$LR/summary.mjs" < "$OUT/$nn.accept.json" | tee -a "$OUT/run.log"
}

from_tag() {
  if [ ! -d "$APP/.git" ]; then
    [ -n "${FROM_APP:-}" ] || { log "no app at $APP and no FROM_APP"; return 1; }
    mkdir -p "$W" && git clone -q "$FROM_APP" "$APP" || return 1
    (cd "$APP" && git fetch -q --tags "$FROM_APP") || return 1
    printf 'spec.md\nchange.md\n' >> "$APP/.git/info/exclude"
  fi
  cd "$APP" || return 1
  git rev-parse -q --verify "refs/tags/$FROM_TAG" > /dev/null || { log "no tag $FROM_TAG in $APP"; return 1; }
  git reset -q --hard "$FROM_TAG" && git clean -qfd
  if [ ! -d node_modules ]; then
    if [ "$FW" = hozu ]; then npm install --no-audit --no-fund; else pnpm install --ignore-workspace; fi
  fi > "$OUT/install.txt" 2>&1
}

if [ -n "${FROM_TAG:-}" ]; then
  log "start from $FROM_TAG"
  from_tag || { log "cannot start from $FROM_TAG"; exit 1; }
elif [ ! -d "$APP/.git" ]; then
  [ "$FROM" = 0 ] || { log "no app at $APP"; exit 1; }
  log scaffold
  scaffold || { log "scaffold failed"; exit 1; }
fi
for k in $(seq "$FROM" "$TO"); do
  agent "$k" || { log "agent step $k failed to run"; exit 1; }
  measure "$k"
done
log done
