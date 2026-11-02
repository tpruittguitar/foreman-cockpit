# Manual automations and schedule advice

Open `automations.html` from **Run automations** in the job-list toolbar.

The page discovers manually dispatchable workflows in forge-coordination, foreman-cockpit and forge-policy from their current main branches. It reads current workflow cron, timeout, concurrency and input definitions; it does not dispatch anything itself. Workflow links open GitHub's Run workflow control. Local Codex tasks have no verified browser deep link: the page names the native task and provides a one-run instruction. Claude/Grok links open their provider controls rather than pretending to be one-click dispatch endpoints.

AI tasks come from the current task registry joined to native configuration readbacks. Paused tasks are omitted. Refresh is on opening, on demand and every five minutes while visible. GitHub active/queued/waiting/pending/requested runs are read separately. Readbacks more than 24 hours old, invalid recurrence rules, incomplete API reads and active native tasks absent from the registry suppress timing advice. No schedule or task is enabled, disabled or changed by this page.

Maintain `state/AUTOMATION_SCHEDULE_READBACK.json` via the existing native readback process. Maintain the new `state/CLOUD_AUTOMATION_READBACK.json` through a fresh connected ChatGPT Automations readback; do not derive its enabled state from old policy documents. It contains configuration evidence, not execution proof. Native schedule changes are not visible to this public page until their readback is published. The UI states that limitation and expires old evidence.

The planning window uses the sum of configured job timeouts (six hours for jobs without an explicit timeout), a user-entered AI duration assumption and two-minute buffers. This deliberately over-reserves parallel jobs. Event-triggered work and native in-progress tasks cannot be predicted from cron; native controls and Writer ownership must still be checked. If there is no clear interval, the page says so. It never guarantees an idle Writer.

At implementation time an active ChatGPT cloud Strategic Enrichment task was absent from the AI task registry. Its readback is recorded as a coordination discrepancy. Scheduling advice remains unavailable until native state and the registry are reconciled through the authorized coordination process.

# Salary decisions and selection

**Max salary** sorts numerically by posted maximum, otherwise estimated maximum, with unknown ceilings last in either direction. `COMP_MAX` is available as a column. Range filters test overlap: a minimum of $210K retains $150K–$220K. Midpoint-only evidence does not invent a ceiling. Existing explicit midpoint filters retain midpoint semantics.

The salary tooltip gives the upper 30% of the span (`low + .70*(high-low)` through `high`) as an experienced-candidate planning band. It is a decision preference, not a promise of an offer. Canonical scoring is not silently replaced with this personal target band.

Starting Ctrl/Cmd selection adds the focused visible row once. Later toggles can remove it; hidden rows are not added. Shift selection continues to include both range endpoints.
