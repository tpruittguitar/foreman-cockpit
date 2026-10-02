#!/usr/bin/env bash
# One-command Pipeline Explorer v5 backend activation + smoke test.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_ID=1vsVq0tFs_EvKSxahpCR8TNCaXkkZ-iObA9b_wd7GJGkcmNcgNc_1gLGr
ENDPOINT="https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec"
API="python3 $HERE/gas_api.py"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# Capture current live passphrase before deployment.
$API get-content "$SCRIPT_ID" "$WORK/live"
PASS_LINE="$(grep -hE "^var PASSPHRASE *= *\x27" "$WORK/live/Code.js" | head -1)"
[ -n "$PASS_LINE" ] || { echo "could not read live passphrase; aborting" >&2; exit 1; }
PASS="$(printf "%s" "$PASS_LINE" | sed -E "s/^[^\x27]*\x27([^\x27]+)\x27.*/\1/")"
[ -n "$PASS" ] || { echo "empty passphrase; aborting" >&2; exit 1; }
[ "$PASS" != "CHANGE-ME" ] || { echo "placeholder passphrase; aborting" >&2; exit 1; }

# Publish backend to the existing deployment URL.
"$HERE/deploy.sh"

quote() { python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1"; }
get_json() { curl -fsSL --retry 2 --connect-timeout 10 "$ENDPOINT?action=$1&key=$(quote "$PASS")${2:-}"; }
post_json() { curl -fsSL --retry 2 --connect-timeout 10 -H "Content-Type: text/plain;charset=utf-8" --data "$1" "$ENDPOINT"; }

PING="$(get_json ping)"
python3 - "$PING" <<'PY'
import json,sys
j=json.loads(sys.argv[1])
assert j.get('ok') is True, j
actions=j.get('actions',[])
need={'canonical_rules','events','interview_notes','documents','interview_note','approve_resume','save_rules','undo_ruling','install_automation'}
missing=sorted(need-set(actions))
assert not missing, f'missing v5 actions: {missing}'
print('PING_OK actions=',len(actions))
PY

# Reinstall queue timer from deployed v5 Automation.gs (1 minute).
INSTALL_BODY="$(python3 - "$PASS" <<'PY'
import json,sys
print(json.dumps({'key':sys.argv[1],'action':'install_automation'}))
PY
)"
INSTALL="$(post_json "$INSTALL_BODY")"
python3 - "$INSTALL" <<'PY'
import json,sys
j=json.loads(sys.argv[1])
assert j.get('ok') is True, j
r=j.get('result') or {}
assert r.get('triggerInstalled') is True, j
print('TRIGGER_OK',r)
PY

# Read-only v5 route smoke tests.
RULES="$(get_json canonical_rules)"
DOCS="$(get_json documents)"
EVENTS="$(get_json events "&primaryId=__V5_SMOKE_NONEXISTENT__&limit=1")"
python3 - "$RULES" "$DOCS" "$EVENTS" <<'PY'
import json,sys
rules,docs,events=map(json.loads,sys.argv[1:4])
assert rules.get('ok') is True, rules
assert docs.get('ok') is True, docs
assert events.get('ok') is True, events
for k in ('resumes','coverLetters','supporting','timVoice'): assert isinstance(docs.get(k),list), (k,docs)
print('READ_ROUTES_OK')
print('RULES_ID=',rules.get('id'))
print('RESUMES=',len(docs.get('resumes',[])),'COVER_LETTERS=',len(docs.get('coverLetters',[])),'SUPPORTING=',len(docs.get('supporting',[])),'TIM_VOICE=',len(docs.get('timVoice',[])))
PY

# Wrong key must remain rejected.
BAD="$(curl -sSL --connect-timeout 10 "$ENDPOINT?action=ping&key=WRONG-V5-SMOKE" || true)"
python3 - "$BAD" <<'PY'
import json,sys
j=json.loads(sys.argv[1])
assert not j.get('ok'), j
print('BAD_KEY_REJECTED')
PY

echo "V5_BACKEND_ACTIVATED_AND_VERIFIED=YES"
