#!/usr/bin/env bash
# Installs a systemd --user timer on the box that republishes the redacted Tim-President chat feed every 2 minutes.
#   scripts/install-president-chat-feed.sh <transcript.jsonl> <forge-coordination checkout> [uninstall]
# Writes ~/.config/systemd/user/president-chat-feed.{service,timer}; pushes control/PRESIDENT_CHAT_FEED.jsonl (git push, existing credentials).
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
unit=~/.config/systemd/user
if [[ ${3:-} == uninstall || ${1:-} == uninstall ]]; then
  systemctl --user disable --now president-chat-feed.timer 2>/dev/null || true
  rm -f "$unit/president-chat-feed.service" "$unit/president-chat-feed.timer"; systemctl --user daemon-reload; echo uninstalled; exit 0
fi
src=${1:-}; repo=${2:-}
[[ -n "$src" && -d "$repo/.git" ]] || { echo "usage: $0 <transcript.jsonl> <forge-coordination checkout> [uninstall]" >&2; exit 2; }
src=$(readlink -f "$src" 2>/dev/null || echo "$src"); repo=$(readlink -f "$repo"); node=$(command -v node)
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
