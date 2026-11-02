#!/usr/bin/env bash
# Runs every tests/*.browser.js on two checkouts (PR branch and its base) in the same runner, with tests/helpers/ci-net-guard.cjs
# loaded so nothing can reach the production Writer, then writes a side-by-side table to the job summary.
# Usage: compare-browser-tests.sh <branch-dir> <base-dir> <out-dir>
# Exit 1 only for a regression (passes on base, fails on the branch, or a new test that fails). Tests that fail on both are
# reported as existing failures. Blocked Writer-host attempts are listed (they never left the runner). ONLY="a b" limits the tests.
set -u
BR=$(cd "$1" && pwd); BASE=$(cd "$2" && pwd); OUT=$(mkdir -p "$3" && cd "$3" && pwd)
GUARD="$BR/tests/helpers/ci-net-guard.cjs"; export NET_GUARD_LOG="$OUT/net-guard.log"; : > "$NET_GUARD_LOG"
run_side() {   # <dir> <label>
  local dir=$1 label=$2; mkdir -p "$OUT/$label/logs" "$OUT/$label/shots"
  local pw=""; [ -d "$dir/node_modules/playwright" ] && pw="$dir/node_modules/playwright"   # each side's own Playwright when installed
  for f in "$dir"/tests/*.browser.js; do
    local t; t=$(basename "$f" .browser.js); local start=$SECONDS
    if [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $t "* ]]; then continue; fi
    ( cd "$dir" || exit 2; if [ -n "$pw" ]; then export PIPELINE_PLAYWRIGHT_MODULE="$pw"; fi
      MOBILE_SHOTS="$OUT/$label/shots" ACT_NOW_SHOTS="$OUT/$label/shots" NODE_OPTIONS="--require $GUARD" timeout 300 node "tests/$t.browser.js" ) > "$OUT/$label/logs/$t.log" 2>&1
    local rc=$?; echo "$t $rc $((SECONDS-start))" >> "$OUT/$label/results.txt"
    echo "[$label] $t rc=$rc $((SECONDS-start))s"
  done
}
run_side "$BASE" base; run_side "$BR" branch
python3 - "$OUT" <<'PY'
import os, sys
out = sys.argv[1]
def load(side):
    p = os.path.join(out, side, 'results.txt'); r = {}
    if os.path.exists(p):
        for line in open(p):
            t, rc, s = line.split(); r[t] = (int(rc), int(s))
    return r
base, br = load('base'), load('branch')
def word(x): return '—' if x is None else ('pass' if x[0] == 0 else ('timeout' if x[0] == 124 else 'FAIL'))
def first_error(side, t):
    p = os.path.join(out, side, 'logs', t + '.log')
    if not os.path.exists(p): return ''
    for line in open(p, errors='replace'):
        if 'Error' in line or 'assert' in line.lower(): return line.strip()[:160].replace('|', '\\|')
    return ''
rows, regress, fixed, both, ok = [], [], [], [], []
for t in sorted(set(base) | set(br)):
    b, n = base.get(t), br.get(t)
    if n is None: v = 'not on branch'
    elif b is None: v = 'new test' + ('' if n[0] == 0 else ' — FAILS'); (ok if n[0] == 0 else regress).append(t)
    elif b[0] == 0 and n[0] == 0: v = 'ok'; ok.append(t)
    elif b[0] != 0 and n[0] != 0: v = 'existing failure (fails on base too)'; both.append(t)
    elif b[0] == 0: v = '**REGRESSION**'; regress.append(t)
    else: v = 'fixed on branch'; fixed.append(t)
    rows.append(f"| `{t}` | {word(b)} | {word(n)} | {v} | {first_error('branch', t) if n and n[0] else ''} |")
guard = open(os.path.join(out, 'net-guard.log')).read().strip() if os.path.exists(os.path.join(out, 'net-guard.log')) else ''
md = ["## Browser tests: base vs branch (same runner)", "",
      f"Branch: {len(br)} tests · base: {len(base)} tests · **regressions: {len(regress)}** · existing failures (both): {len(both)} · fixed on branch: {len(fixed)}", "",
      "Writer guard: " + ("no request to an Apps Script host was attempted." if not guard else "requests to Apps Script hosts were attempted and **blocked** (nothing left the runner):\n```\n" + guard[:3000] + "\n```"), "",
      "| Test | Base | Branch | Verdict | First error on branch |", "|---|---|---|---|---|", *rows]
open(os.path.join(out, 'summary.md'), 'w').write('\n'.join(md) + '\n')
s = os.environ.get('GITHUB_STEP_SUMMARY')
if s: open(s, 'a').write('\n'.join(md) + '\n')
print('\n'.join(md))
sys.exit(1 if regress else 0)
PY
