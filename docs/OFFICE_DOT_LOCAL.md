# Dot local Office pilot

This is a working **local Codex CLI app-server adapter**, not a browser API for ChatGPT Dot's private hosted task/GitHub connectors. Those connectors cannot be called directly from hosted Pages. The public `/api/agent-coding` stays disconnected. No Cloudflare binding, credential, deployment or watcher change is included.

The existing Office UI can now be served by a temporary loopback bridge. Select **ChatGPT Dot**, type `/code <request>` and receive status in the same panel. After reviewing the edits, `/code /pr` explicitly publishes the dedicated branch and creates or reuses a **draft** PR through the already-signed-in local git/gh CLI. It verifies the returned repository, head, base, URL and draft state. The bridge injects no GitHub credentials into Codex, and the publisher has no merge/deploy command. Ordinary chat is deliberately not relayed by the local pilot; the production ordinary-chat path and all existing watchers are unchanged.

## Run

Requires Node 24, Codex **0.169.0**, an existing ChatGPT login, git and an existing gh login. No new credential/account is created. Use a clean dedicated worktree on a branch matching `office-coding/<16–80 letters/digits/underscores/hyphens>`. Serve the implementation from a different checkout, and put private state outside both checkouts.

```
node tools/office-dot/cli.mjs <dedicated-worktree> <private-state-directory> tpruittguitar/foreman-cockpit office-coding/tim-dot-20261122-01
```

On Windows, `OFFICE_CODEX_COMMAND` may name the existing `codex.cmd` path. The runner verifies the exact installed version before starting its own stdio child. Open the single-use loopback launch link printed by the terminal. This requires no additional login: it establishes a one-hour HttpOnly, SameSite=Strict local session bound to the OS owner's existing native account. The UI display marker in localStorage has no authorization power. Never share the launch link. The bridge binds only `127.0.0.1`, checks Host/Origin/Fetch Metadata, sends no CORS permission, and does not expose the native process on a network socket. Stop with Ctrl+C. No scheduled task, service or persistent access grant is installed.

Native approval requests appear in the originating terminal; the wall reports that an approval is needed. The owner can respond `accept`, `decline` or `cancel` for that one request. There is no accept-for-session or policy amendment. Unknown approval types, another thread/turn, other roots and network/persistent-permission requests are rejected. Without a human approval handler, the adapter cancels rather than bypassing native approval. Do not run the interactive CLI as an unattended service.

## Boundaries and recovery

- Before each turn, account/read must return ChatGPT authentication, account/rateLimits/read must permit ordinary included usage, and credits must be absent (`hasCredits=false`, `unlimited=false`). Account/user identities must match the saved binding. The native process receives only an OS-environment allowlist; the provider is pinned to the existing OpenAI ChatGPT route. API-key/provider fallback, paid credits and reset-credit redemption are not supported. Native account IDs remain private.
- One tenant/owner, Dot provider, conversation, native session, repository, worktree and draft branch are bound by server-owned state. The browser cannot override them. `All`, other providers and mailbox/log dispatch cannot execute work.
- Codex runs workspace-write, network disabled, with user/on-request approvals; thread/resume and each turn reapply that scope. The adapter rejects an unexpected writable root or sandbox. This preserves native sandboxing; it is not a new OS container or an assertion that the native sandbox blocks every read outside the workspace. Use only the owner's trusted dedicated checkout. It does not grant new native access.
- Private SQLite stores the request admission and native thread/turn/approval correlation with synchronous durable writes. One CLI process owns the private-state lock, and turns are serialized. Duplicate HTTP IDs never dispatch twice. Interrupted/uncertain native work is marked unknown after restart, not replayed. Inspect native status and the exact worktree before any new request. A stale owner.lock after a crash requires checking that the prior process exited before removing only that lock.
- Session/thread IDs, requests and raw native output never enter the public mailbox or forge records. Only status and a verified draft URL return to the private page. The native CLI may retain its ordinary private session history. The local server serves an explicit static-file allowlist; state, .git, tools and configuration are not served.
- The model does not publish. `/code /pr` runs outside the model sandbox with the owner's existing git/gh account, verifies the fixed remote and branch, disables hooks for its git commands, rejects symlink/path escapes and creates only a draft. Review the worktree before this explicit publication command; it publishes the branch's actual changes. No live publication test is performed by automated tests.

## Evidence

Installed 0.169.0 schemas were generated on TIMMAY and inspected for initialize, account/usage reads, thread/start, thread/resume, turn/start, turn/completed and approval callbacks. `tools/office-dot/protocol-0169.json` records their SHA-256 fingerprints. The adapter refuses another CLI version rather than silently guessing its protocol.

Two real scratch proofs ran on existing included ChatGPT access (ordinaryUsageAllowed=true; no paid credits available), with no network tools or approval bypass:

1. Native app-server created `proof.txt` containing `first-turn`, then explicitly resumed the same thread for a second completed turn appending `second-turn`. File bytes were independently checked.
2. The implemented loopback HTTP service + SQLite store + native adapter admitted two owner-bound requests, reused one native thread, returned `awaiting_review`, and independently verified exactly `first-turn\nsecond-turn\n`. Repeated request IDs returned existing results without a second turn. Native IDs and local paths are retained privately, not published here.

The full Office browser integration test uses the actual 3D page, recipient chip, input, session cookie, HTTP route, SQLite store, adapter and a 0.169.0 stdio fixture. It proves two turns, status polling and the draft-link hit target. The fixture performs deterministic scratch edits; its draft URL is explicitly mocked. This is separate from the real native edit/resume proofs. No real PR was created by a test.

Validation commands:

```
node --test tests/office-dot-local.test.js tests/office-coding.test.js tests/agent-chat.test.js
PIPELINE_PLAYWRIGHT_MODULE=<playwright> node tests/office-dot-local.browser.cjs
npm test
npm run check:cloudflare
```

To make the **hosted** Office address execute work would still require a separately reviewed authenticated transport/deployment. This change does not create that exposure. The useful executable path now is the same Office page served locally by the dedicated CLI bridge.
