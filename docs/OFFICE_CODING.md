# Office coding requests — prerequisite, not activated

This branch does **not** make any live agent writable. Choose an agent on the existing Agent Chat wall and prefix an explicit request with `/code`. Production answers **Not connected**. Ordinary messages still use `/api/agent-chat`; `/code` is never copied into its private mailbox or the shared log. `All` cannot receive a coding request. The panel dimensions are unchanged.

## Verified interfaces (2026-11-22)

Cockpit inspected at `3795ae3`, coordination at `e1c72655fab9874e6f30db12cd546aeb5fbdbaed`. No AGENTS.md or .agents/skills was present in either repository; workspace .agents was empty. Read-only inspection of TIMMAY's `D:\Hermes\claude-chat` established:

| Selection | Actual chat transport | Coding connection |
| --- | --- | --- |
| Claude Duet | `claude-watcher.ps1` runs local Claude Code with tools disabled, strict MCP configuration and no session persistence. Attached files enable Read only. | Not connected; no authenticated, scoped writable session adapter. |
| Hermes (Local) | `hermes-watcher.ps1` calls Hermes chat with query file, `-Q --source tool`, using its existing model setup/fallback cascade. It accepts shared-log context; its prompt distinguishes bots from Tim. | Not connected; “Local” does not prove a pinned local model or isolated coding permissions. No fallback was changed. |
| ChatGPT Dot | `dot-watcher.ps1` runs Codex exec with `--ephemeral -s read-only`, in the chat directory, and explicitly instructs text replies. | Not connected; not a resumed writable thread. Installed Codex CLI is 0.169.0; `app-server --help` confirms an experimental stdio server exists. That is not proof of an authorized coding thread/turn. |
| Grokbot President | `grok-watcher.ps1` wakes its configured webhook for new Grok/All log lines, including non-owner senders. Secret webhook configuration was not read. | Not connected; no verified coding job/session/status/draft-PR API. Shared-log wakeups cannot authorize coding. |

`office-sync.ps1` transports private mailbox messages into `chat.log`, starts existing chat watchers and publishes recent lines back to the private mailbox. It does not authenticate a coding principal or constrain a repository/branch. `/api/agent-chat` uses the chat unlock HMAC; the older `/api/office-chat` uses X-Office-Key. Neither is elevated to coding authority. The coordination Dot pilot documents user-directed support and capability verification, not a native coding dispatch API. No current runtime/watchers, schedules, credentials, worker access or production configuration were changed. No provider test message was sent.

## Implemented pieces

- `/api/agent-coding` has no authentication implementation, adapter or store attached: GET/POST return 401 with `not_connected`, even with chat tokens, owner claims or forwarded identity headers. No environment switch enables execution. Nothing is queued or written to a repository.
- `lib/office-coding.mjs` defines the server contract with injected, trusted authentication, adapters and atomic private storage. Test dependencies are mocks only. Owner/tenant identity and authorized provider/conversation/repository/base/work branch/native session binding come from server state. Client repository, branch, author and execution-policy fields are rejected. GET capabilities selects a single existing authorized conversation per provider; multiple grants require a future explicit chooser.
- POST additionally requires same-origin Origin and Fetch Metadata and explicit `owner_coding_request`. A request ID atomically admits at most one submission. Repeated sends with changed text conflict. Indeterminate admission/submission never retries the external operation. Status binds every identity/scope field and projects only enum state and a validated draft PR URL. Raw logs, provider output and private transcripts are never returned or published. Adapter-reported completion must include independently verified draft=true and matching repository/head/base.
- `office/coding-client.mjs` keeps coding identifiers in memory, fetches the authorized conversation, reuses pending request IDs and discards replies after locking. It sends no shared chat token or privileged browser secret to the coding API. The panel renders status and a clickable draft link only for the selected agent. Locking clears coding state. Existing ordinary-chat token storage remains ordinary-chat-only.

## Required before activation

This is deliberately an unwired prerequisite, not a deploy-ready writable backend. Do not enable it by trusting mailbox content, author strings, X-Office-Key, X-Agent-Chat-Token, raw identity headers, agent messages or logs.

1. Implement/review owner authentication with validated server sessions, HttpOnly Secure SameSite cookies, expiry/revocation and a stable tenant/owner identity. Review the same-origin and CSRF boundary. A coding sign-out must clear panel state and revoke the session; the existing wall lock only clears local state.
2. Attach private durable storage with atomic claim and monotonic status transitions, tenant/owner/provider/conversation isolation, retention and authenticated recovery/listing. In-memory test storage is not suitable. Reload recovery is not implemented. A lost request identity or `unknown` outcome requires read-only reconciliation, never a new job ID as an automatic retry. Serialize turns of a native session; reject concurrent workspace mutations. Add timeout/cancel semantics and handle native approval requests explicitly.
3. Register only already-authorized repository/base/working-branch grants and verified existing coding runtimes. Every adapter must actually enforce filesystem, network and Git permissions outside the prompt; exclude chat logs, unrelated credentials, canonical state, deployment, merge and access expansion. Keep per-provider sessions separate. Native approval requests must return to the owner; never bypass them. Verify draft PR metadata from the forge before emitting `completed`. This contract's policy flags do not themselves sandbox a runtime.
4. Implement each verified provider's native adapter and protocol translation separately. No provider substitution or Hermes model fallback may masquerade as another selected provider. Missing adapters stay Not connected. The mock adapter tests validate the contract, not any external provider protocol.
5. Review and authorize activation separately. This branch provisions no secrets, persistent access, listeners or service bindings and does not deploy.

## Subsequent image and relay work

See [Office coding images](OFFICE_CODING_IMAGES.md) for the later actual native image-understanding proof, image-aware adapter, disabled hosted relay, signed Access/job/result contracts and outbound worker. The original prerequisite tests below remain relevant, but the native-proof limitation recorded during the initial implementation has been superseded by that explicitly scoped local proof. The live hosted end-to-end connection remains unverified and disabled until operator configuration and deployment are separately approved.

## Validation

- `node --test tests/office-coding.test.js tests/agent-chat.test.js`: mocked auth, unavailable providers, repeated/concurrent sends, explicit intent, public/signed-out rejection, CSRF, tenant/owner/provider isolation, scope injection, uncertain dispatch, progress and draft verification, lock/race handling, and the real panel control functions.
- `PIPELINE_PLAYWRIGHT_MODULE=<installed playwright> node tests/office-coding.browser.cjs`: a scoped browser harness using the actual panel input/controller/client/canvas renderer with loopback mocked responses. It tests repeated disconnected sends, Enter submission, progress, draft-link hit targets, provider isolation, All and lock. It does not load the full 3D scene or contact providers.
- Full `npm test` and `npm run check:cloudflare`, plus syntax checks of changed modules and `git diff --check`. The existing Cloudflare check only covers the structured function; it does not verify deployment or a live coding session.
