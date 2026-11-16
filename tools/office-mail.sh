#!/usr/bin/env bash
# Office chat relay, bot side. Uses the gh CLI (already signed in with access to tpruittguitar/office-mailbox).
#   tools/office-mail.sh check <bot_id>                 list unanswered inbox messages (id, time, text)
#   tools/office-mail.sh reply <bot_id> <msg_id> <text> write outbox/<bot_id>/<msg_id>.json {id, at, from, text}
# Run `check` at the start of each turn; answer each message with `reply`. The reply shows in Tim's office popup.
set -euo pipefail
REPO=tpruittguitar/office-mailbox
cmd=${1:-}; bot=${2:-}
[[ "$bot" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || { echo "usage: $0 check|reply <bot_id> [msg_id text]" >&2; exit 2; }
list() { gh api "repos/$REPO/contents/$1" --jq '.[] | select(.type=="file") | .name' 2>/dev/null || true; }
case "$cmd" in
  check)
    answered=$(list "outbox/$bot")
    for f in $(list "inbox/$bot" | sort); do
      id=${f%.json}
      grep -qx "$id.json" <<<"$answered" && continue
      gh api "repos/$REPO/contents/inbox/$bot/$f" -H 'Accept: application/vnd.github.raw' | jq -r '"\(.id)\t\(.at)\t\(.text)"'
    done ;;
  reply)
    id=${3:-}; text=${4:-}
    [[ "$id" =~ ^[0-9A-Za-z-]{6,64}$ && -n "$text" ]] || { echo "usage: $0 reply <bot_id> <msg_id> <text>" >&2; exit 2; }
    name=$(gh api "repos/tpruittguitar/forge-coordination/contents/control/OFFICE_STATUS.json" -H 'Accept: application/vnd.github.raw' | jq -r --arg b "$bot" '.bots[] | select(.bot_id==$b) | .bot' | head -1)
    body=$(jq -nc --arg id "$id" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg from "${name:-bot}" --arg text "$text" '{id:$id,at:$at,from:$from,text:$text}')
    gh api -X PUT "repos/$REPO/contents/outbox/$bot/$id.json" -f message="office chat: reply from ${name:-$bot}" -f content="$(printf '%s' "$body" | base64 | tr -d '\n')" >/dev/null
    echo "replied to $id" ;;
  *) echo "usage: $0 check|reply <bot_id> [msg_id text]" >&2; exit 2 ;;
esac
