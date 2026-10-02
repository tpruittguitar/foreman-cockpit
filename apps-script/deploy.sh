#!/usr/bin/env bash
# Deploy apps-script/*.gs from this repo to the live "Pipeline Explorer Writer" Apps Script project.
#
#   apps-script/deploy.sh            set project code, create a version, point the live web app at it (URL unchanged)
#   apps-script/deploy.sh --head     set project code only (no new version; the live web app keeps its current version)
#
# Needs: a clasp login as tpruitt.guitar@gmail.com (npm i -g @google/clasp; clasp login --no-localhost) and the
# Apps Script API enabled at https://script.google.com/home/usersettings. gas_api.py reuses that login.
# The live PASSPHRASE is read from the live project at deploy time and re-inserted, so the repo copy never has to carry it.
# The project is set to EXACTLY the repo's files (plus the live manifest); anything else in the project is removed.
set -euo pipefail
SCRIPT_ID=1vsVq0tFs_EvKSxahpCR8TNCaXkkZ-iObA9b_wd7GJGkcmNcgNc_1gLGr
DEPLOYMENT_ID=AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i
HERE="$(cd "$(dirname "$0")" && pwd)"
API="python3 $HERE/gas_api.py"
DESC="${DEPLOY_DESC:-$(git -C "$HERE" log -1 --format='%h %s' 2>/dev/null | cut -c1-90)}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

$API get-content "$SCRIPT_ID" "$WORK/live"
LIVE_PASS_LINE="$(grep -hE "^var PASSPHRASE *= *'" "$WORK/live/Code.js" | head -1)"
[ -n "$LIVE_PASS_LINE" ] || { echo "could not find live PASSPHRASE line; aborting" >&2; exit 1; }
echo "$LIVE_PASS_LINE" | grep -q "'CHANGE-ME'" && { echo "live PASSPHRASE is the placeholder; aborting" >&2; exit 1; }

mkdir -p "$WORK/out"
cp "$WORK/live/appsscript.json" "$WORK/out/appsscript.json"
for f in "$HERE"/*.gs; do
  n="$(basename "$f" .gs)"
  case "$n" in Amd59RecoveryWorker) continue;; esac   # one-time recovery (completed 2026-10-02); kept in repo for audit only
  awk -v line="$LIVE_PASS_LINE" '/^var PASSPHRASE *= *\x27/ && !done { print line; done=1; next } { print }' "$f" > "$WORK/out/$n.js"
  cp "$WORK/out/$n.js" "$WORK/check.js"; node --check "$WORK/check.js"
done
grep -qE "^var PASSPHRASE *= *'CHANGE-ME'" "$WORK/out/Code.js" && { echo "placeholder survived; aborting" >&2; exit 1; }

$API set-content "$SCRIPT_ID" "$WORK/out"
if [ "${1:-}" = "--head" ]; then echo "set HEAD only; live web app unchanged"; exit 0; fi
VER="$($API version "$SCRIPT_ID" "$DESC")"
$API deploy "$SCRIPT_ID" "$DEPLOYMENT_ID" "$VER" "v$VER: $DESC"
echo "live web app now serves version $VER"
