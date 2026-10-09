# Automation alignment implementation

Status: implemented locally; native prompt adoption and live deployment remain unverified. No native task, schedule, Drive governance document or job row was changed by this implementation.

Active rollout is Writer + ChatGPT/Forge. Claude and Grok are deferred by owner instruction: preflight cannot enable them, schedule proposals cannot activate them, and their desired occurrences/dependencies are excluded from active checks. Native provider schedules have not been changed.

The shared contract assigns Forge bounded email intake, explicitly scoped temporary coverage and the existing morning freeze; Claude existing-row analysis; Grok public-source scouting and assigned resolution. It preserves the sole plain-text master, protected decisions, initiating provenance, current Rules and Writer receipt plus exact-row verification. It does not activate tasks or create a recovery relay.

`pipeline-alignment.js` implements deterministic prompt generation, fresh-authority preflight, precise conflict evidence, lane permissions and completion accounting. Every run needs fresh common standard, ACTIVE Rules, Writer and owner-specific AI_REASON fingerprints; approved source/window scope; native prompt/schedule readback; durable checkpoints; authorized transport and independent coverage-ledger readback. Unknown Claude/Grok native identities require explicit enrollment. The three previously documented ChatGPT task identities are retained.

`pipeline-automation-adapter.js` injects real provider and storage capabilities. It persists intent before prompt updates and Writer submissions, uses revision-conditional prompt updates, independently reads prompts back and preserves schedules/enabled state. An ambiguous update is never automatically resent. Stable Writer request IDs survive new run attempts; changed bodies conflict. Fresh authority/native preflight runs immediately before every write. Writer results require independently reconciled COMPLETE receipt and exact-row readback evidence; the coverage verifier must read the persisted source/page/body/link and candidate ledger, rather than accepting worker assertions. Freeze additionally requires same-day artifact readback.

The new Writer `automation_alignment` endpoint exposes fresh SHA-256 content fingerprints, active-authority status, role catalogue and explicit `UNSUPPORTED` native control. It does not expose full governance text. Requests carrying the adapter's automation envelope are rejected before dispatch when those fingerprints change or their action/actor violates the assigned lane. Legacy clients remain compatible: this is opt-in enforcement, not proof all native automations are governed. Native prompt evidence is an adapter responsibility; an envelope is not native attestation.

The app's AI research request now derives FLEX modifiers from loaded ACTIVE canonical Rules, removing obsolete +15/+6 instructions. Without readable ACTIVE Rules it refuses to queue research.

## Provider integration contract

Supply real implementations to `Adapter.create(io)`:

- `readAuthorities()` reads current common/Rules/Writer plus the relevant enrolled AI_REASON, returning IDs, owner for reason, active flags, fingerprints and fresh `fetchedAt` values. Combine the new Writer authority endpoint with the owner-specific reason read; reason IDs must come from the actual assigned native task.
- `provider.getTask(id)` returns provider, taskId, prompt, enabled, complete schedule, revision and a durable readback evidence reference. `provider.updatePrompt(id,{prompt,expectedRevision})` must enforce revision comparison atomically and update only the prompt.
- `persist(record)` and `readCheckpoint(record.attemptId)` implement durable storage with exact readback. Serialize runs per task and request IDs across processes; in-memory test fixtures are not production storage.
- `submitWriter(body)` uses the authorized transport. `reconcileWriter(intent)` checks the stable request's COMPLETE receipt and exact canonical row, returning `state: VERIFIED_COMPLETE`, `receiptId` and `masterReadbackRef` only after those independent checks; otherwise return pending/unknown evidence.
- `verifyCoverage(report,config)` independently reconciles the declared source denominator, pagination, message bodies, extracted links and every candidate disposition against the persisted ledger. Return `verified:true` and `evidenceRef` only when counts agree and no unfinished obligation remains. `artifactReadback` independently verifies today's freeze when required.
- `nativeTaskIds` binds actual Claude/Grok IDs to their approved roles. Missing bindings stay blocked.

Call `updatePrompt(taskKey,approvedScope,attemptId)` only with actual approved native scope; it cannot infer source queries/lookback windows. Call `execute(config,work)` with the captured original schedule and a unique durable attempt ID. The worker uses `context.submit(body)` for canonical writes and returns coverage counts with unfinished obligations. Store reports in supporting Operations records through the authorized Writer integration. Supplied observations are marked REPORTED_ONLY, never platform-certified native adoption.

## Review and rollout

`node scripts/automation-alignment.cjs catalogue` lists assigned roles. `prompt TASK_KEY APPROVED_SCOPE.json` generates a complete corrected prompt without inventing coverage. `check TASK_KEY PREFLIGHT.json` evaluates recorded observations and exits 2 when blocked. These commands do not contact or update native providers.

Deploy the shared Apps Script contract alongside Code.gs. Connect each real provider and durable ledger, capture scope/schedules/revisions, update prompts with revision checks, then independently read back and run acceptance. Document text updates alone do not prove native adoption. This session has no callable ChatGPT/Claude/Grok task-management capability and no clasp OAuth credential, so rollout cannot be completed here. The existing GUI preview approval gate also remains applicable to the accumulated visual changes.

Validation covers stale/unreadable/inactive authority, exact prompt conflicts, missing native enrollment, lane ownership, coverage omissions, paused tasks, ambiguous updates, checkpoint failure, request recovery across attempts, body conflicts, authority drift, ambiguous Writer effects, independent ledger failure and Apps Script mirror equality. Full npm suite: 302 tests passed.
