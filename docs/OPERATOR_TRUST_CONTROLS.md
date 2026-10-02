# Operator trust controls

The home page opens Pipeline Explorer. The former public master/feed export endpoints return HTTP 410 without any upstream fetch. Explorer reads only through a configured writer; there is no public fallback. The document ID is removed from the client source. Clearing writer configuration also clears the device's cached master. A configured device can display an explicitly labeled offline cache.

## Writer setup

Tim stopped the additional credential-rotation and sharing work on 2026-10-02. Keep the existing writer setup. No new login layer, Script Property credential, or account activation is required for these usability changes. The master remains the sole job authority and the existing writer remains its write route.

## Decision controls

Local drafts, submitting, result unknown, failed writes, pending readback, unconfirmed readback, and verified writes are separate statuses. A receipt alone never makes a decision verified: a fresh master must match the requested bucket and supplied note/reason/date. Cached rows cannot verify a new write.

Salary estimates always display ESTIMATED, even if another field says VERIFIED. Posted salary without explicit verification displays POSTED / UNVERIFIED. FLEX hints remain HINT / UNVERIFIED; confirmed FLEX requires explicit confidence and a basis.

Today leads with ready roles, explicit Tim decisions, upcoming recorded interviews, research older than 72 hours, overlapping research gaps and Scout cohort maturity. These are views of canonical rows, not an alternative ranker or job state. Heading maintenance filters stale document section headings while row BUCKET stays authoritative.

Comparison holds up to three PRIMARY_ID references locally, with pay provenance, location, degree/FLEX, floor, clearance and blockers. J/K navigate; 1–4 prepare pursuit/hold/decline/research decisions without writing. Save submits through the writer. Compact/comfortable density persists per device. Tab selection persists in the bookmark hash.
