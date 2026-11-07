#!/usr/bin/env bash
# This entrypoint is intentionally disabled during private runtime configuration separation.
# --head also changes installed-trigger execution and is not a safe migration shortcut.
# See docs/WRITER_PRIVATE_CONFIGURATION.md. No bypass flag, credential recovery, or network call.
set -euo pipefail
printf '%s\n' 'WRITER_DEPLOYMENT_BLOCKED: separately approved private configuration migration and verified readback are required before code upload or deployment.' >&2
exit 1
