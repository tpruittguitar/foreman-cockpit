# Structured Runtime Cutover Approval

Date: 2026-10-10
Approval source: Tim explicit chat instruction: "Approve cutover"

Approved change:

- Production Pipeline Explorer default may read from the structured runtime endpoint.
- The former Writer/App Script default remains available as explicit rollback path `?src=writer`.
- This approval does not authorize Writer behavior changes, scoring-policy changes, automation behavior changes, or data mutation changes.

