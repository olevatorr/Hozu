#!/usr/bin/env bash
# Replays a reference app (reference/<fw> + reference/<fw>-steps/NN.patch) and runs the acceptance after every step.
set -euo pipefail

fw=${1:?usage: verify-reference.sh <hozu|nuxt> <port>}
port=${2:?usage: verify-reference.sh <hozu|nuxt> <port>}
here=$(cd "$(dirname "$0")" && pwd)
ref=$here/reference
base=$ref/$fw
steps=$ref/$fw-steps
# Same depth as the base, so link: paths in package.json still resolve.
work=$ref/.verify-$fw

case $fw in
  hozu | nuxt) first=0 ;;
  *) echo "unknown framework: $fw" >&2 && exit 2 ;;
esac
[[ -d $base ]] || { echo "missing $base" >&2; exit 2; }

rm -rf "$work"
mkdir -p "$work"
(cd "$base" && tar --exclude node_modules --exclude .nuxt --exclude .output --exclude dist -cf - .) | (cd "$work" && tar -xf -)
(cd "$work" && corepack pnpm install --ignore-workspace >/dev/null)

failed=0
accept() {
  local k=$1 out
  [[ $fw == nuxt ]] && (cd "$work" && corepack pnpm build >/dev/null)
  out=$(node "$here/accept.mjs" "$fw" "$work" "$(node "$here/entry.mjs" "$fw" "$work")" "$port" "$k")
  node "$here/summary.mjs" <<<"$out"
  node -e 'const r = JSON.parse(process.argv[1]); process.exit(r.total > 0 && r.passed === r.total ? 0 : 1)' "$out" ||
    failed=1
}

apply() {
  # Keep git from finding the enclosing repository: patch paths are relative to the app.
  (cd "$work" && GIT_CEILING_DIRECTORIES=$ref git apply --whitespace=nowarn "$1")
}

last=$first
accept "$first"
[[ $fw == hozu ]] && accept 1 && last=1
for patch in "$steps"/[0-9][0-9].patch; do
  [[ -e $patch ]] || break
  k=$((10#$(basename "$patch" .patch)))
  ((k > last)) || continue
  apply "$patch"
  accept "$k"
  last=$k
done

for k in ${EXTRA_STEPS:-}; do accept "$k"; done

rm -rf "$work"
exit $failed
