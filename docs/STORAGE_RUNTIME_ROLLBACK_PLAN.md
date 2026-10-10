# Storage Runtime Rollback Plan

Status date: 2026-10-10
Status: POST-CUTOVER ROLLBACK PLAN

## Purpose

This plan defines how to return Pipeline Explorer production reads to the Drive/App Script runtime path if the structured-storage production default fails.

Cutover was explicitly approved by Tim on 2026-10-10. This document remains the rollback authority.

## Current production default

Production now defaults to the structured runtime endpoint. The previous Writer/App Script runtime remains available as an explicit rollback path.

Current production default:

```text
Production UI -> bounded structured JSON endpoint -> structured Netlify Blob snapshot
```

Rollback path:

```text
Production UI ?src=writer -> Writer/App Script -> Drive text files
```

## Hard rollback rule

If a structured-storage production cutover causes any of the following, immediately restore the Drive/App Script runtime default:

- production page fails to load;
- active master rows do not render;
- job detail drawer cannot open;
- row count materially differs from the last parity-validated source without a known expected cause;
- archive/evidence failures block active master rendering;
- Writer/app health becomes ambiguous;
- Tim explicitly says to roll back.

## Rollback target

Rollback means restoring production default to the explicit Writer/App Script code path currently available at:

```text
https://foreman-cockpit.netlify.app/pipeline.html?src=writer
```

The structured source may remain available behind explicit opt-in query parameters, but it must not be the production default after rollback.

## Required rollback evidence

Before marking rollback complete, verify:

1. Production URL opens.
2. Pipeline renders active jobs.
3. Top nav renders Pipeline, Map, AI Ops, Control, Analytics.
4. A non-mutating job-row click opens the detail drawer.
5. Runtime read health is visible in AI Operations.
6. No production mutating action buttons are clicked during smoke verification.
7. Build/version/commit is recorded.

## Manual rollback method

This cutover is implemented by changing default source selection in `pipeline.html`. Rollback by reverting the cutover commit or restoring default `load()` behavior to Writer/App Script (`?src=writer`).

If the future cutover is implemented by environment or deploy config, rollback by restoring the previous production environment/config and redeploying the prior known-good commit.

If the future cutover is implemented by a routing/proxy endpoint, rollback by restoring the previous route target or disabling the structured endpoint flag.

## Required commands/checks before future cutover

Before cutover:

```cmd
python tools\local-store\preflight_cutover_gate.py
python tools\local-store\validate_mirror_parity.py
```

Both must pass all applicable gates except the explicit Tim approval gate, which must then be satisfied by Tim's direct instruction in chat.

## Required commands/checks after rollback

After rollback:

```cmd
python tools\local-store\preflight_cutover_gate.py
```

The production structured endpoint may return to blocked/unimplemented status after rollback. That is acceptable if production is again using the Drive/App Script runtime path and smoke verification passes.

## Not allowed

Do not treat any of the following as rollback completion:

- only reverting local SQLite scripts;
- only updating docs;
- only passing local `?src=local`;
- only seeing a Netlify deploy succeed;
- relying on stale browser cache;
- skipping row-click smoke verification.

## Current gate status

As of 2026-10-10, production cutover has been approved and executed. Rollback remains available through `?src=writer` and by reverting the cutover commit.
