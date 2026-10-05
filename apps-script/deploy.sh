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

# Stamp the deployed identity (commit, PR, subject) into WRITER_BUILD so ping/writer_status report which PR is live.
# The PR comes from DEPLOY_PR, else from a squash-merge subject ending "(#NN)"; a dirty tree is marked "+dirty".
python3 - "$HERE" "$WORK/out/Code.js" <<'PY'
import json, re, subprocess, sys, datetime, os
here, target = sys.argv[1], sys.argv[2]
git = lambda *a: subprocess.run(['git', '-C', here] + list(a), capture_output=True, text=True).stdout.strip()
commit = git('rev-parse', '--short', 'HEAD') or 'unknown'
if git('status', '--porcelain', '--', '.'): commit += '+dirty'
subject = git('log', '-1', '--format=%s')
m = re.search(r'\(#(\d+)\)\s*$', subject)
pr = int(os.environ['DEPLOY_PR']) if os.environ.get('DEPLOY_PR', '').isdigit() else (int(m.group(1)) if m else None)
b = {'commit': commit, 'pr': pr, 'subject': subject[:120], 'deployedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
line = 'var WRITER_BUILD = ' + json.dumps(b) + ';'
src = open(target).read().split('\n')
hits = [i for i, l in enumerate(src) if re.match(r'^var WRITER_BUILD *= *', l)]
if len(hits) != 1: sys.exit('expected exactly one WRITER_BUILD line in Code.gs, found %d; aborting' % len(hits))
src[hits[0]] = line
open(target, 'w').write('\n'.join(src))
print('stamped ' + line)
PY
node --check "$WORK/out/Code.js"

$API set-content "$SCRIPT_ID" "$WORK/out"
if [ "${1:-}" = "--head" ]; then echo "set HEAD only; live web app unchanged"; exit 0; fi
VER="$($API version "$SCRIPT_ID" "$DESC")"
$API deploy "$SCRIPT_ID" "$DEPLOYMENT_ID" "$VER" "v$VER: $DESC"
echo "live web app now serves version $VER"
