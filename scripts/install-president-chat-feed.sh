#!/usr/bin/env bash
# Installs a systemd --user timer on the box that republishes the redacted Tim-President chat feed every 2 minutes.
#   scripts/install-president-chat-feed.sh <transcript.jsonl> <forge-coordination checkout> [uninstall]
# Writes ~/.config/systemd/user/president-chat-feed.{service,timer}; pushes control/PRESIDENT_CHAT_FEED.jsonl (git push, existing credentials).
# No systemd --user session (the box today): falls back to a background loop, pid in ~/.local/state/president-chat-feed.pid,
# log in ~/.local/state/president-chat-feed.log. The loop does not survive a box restart; rerun this installer then.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
unit=~/.config/systemd/user
state=~/.local/state; pidf=$state/president-chat-feed.pid
has_systemd() { systemctl --user show-environment >/dev/null 2>&1; }
if [[ ${3:-} == uninstall || ${1:-} == uninstall ]]; then
  if [[ -f $pidf ]]; then kill "$(cat "$pidf")" 2>/dev/null || true; rm -f "$pidf"; fi
  has_systemd || { echo uninstalled; exit 0; }
  systemctl --user disable --now president-chat-feed.timer 2>/dev/null || true
  rm -f "$unit/president-chat-feed.service" "$unit/president-chat-feed.timer"; systemctl --user daemon-reload; echo uninstalled; exit 0
fi
src=${1:-}; repo=${2:-}
[[ -n "$src" && -d "$repo/.git" ]] || { echo "usage: $0 <transcript.jsonl> <forge-coordination checkout> [uninstall]" >&2; exit 2; }
src=$(readlink -f "$src" 2>/dev/null || echo "$src"); repo=$(readlink -f "$repo"); node=$(command -v node)
if ! has_systemd; then
  mkdir -p "$state"
  if [[ -f $pidf ]] && kill -0 "$(cat "$pidf")" 2>/dev/null; then kill "$(cat "$pidf")" 2>/dev/null || true; fi
  nohup bash -c 'while :; do "$1" "$2" --source "$3" --repo "$4" --push; sleep 120; done' president-chat-feed \
    "$node" "$here/president-chat-feed.cjs" "$src" "$repo" >>"$state/president-chat-feed.log" 2>&1 &
  echo $! >"$pidf"; echo "installed: president-chat-feed loop pid $(cat "$pidf") (no systemd --user; source $src, repo $repo)"; exit 0
fi
mkdir -p "$unit"
cat >"$unit/president-chat-feed.service" <<EOF
[Unit]
Description=Publish redacted Tim-President chat feed to forge-coordination
[Service]
Type=oneshot
ExecStart=$node $here/president-chat-feed.cjs --source $src --repo $repo --push
EOF
cat >"$unit/president-chat-feed.timer" <<EOF
[Unit]
Description=Republish the President chat feed every 2 minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now president-chat-feed.timer
echo "installed: president-chat-feed.timer (source $src, repo $repo)"
