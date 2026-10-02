# Operator trust controls

The home page opens Pipeline Explorer. The former public master/feed export endpoints return HTTP 410 without any upstream fetch. Explorer reads only through a configured writer; there is no public fallback. The document ID is removed from the client source. Clearing writer configuration also clears the device's cached master. A configured device can display an explicitly labeled offline cache.

## Account activation still required

Removing an app endpoint does not revoke a Google Doc's public sharing or invalidate a leaked credential. The connected Drive tools can read sharing metadata but cannot remove the anyone permission. No account activation is implied by merging this change.

1. Deploy current `Code.gs` plus `Security.gs` to the existing writer URL, preserving the existing passphrase until activation. New authentication first reads the private `PIPELINE_WRITER_SECRET` Script Property.
2. Run `securePipelineAccess` as the account owner. It restricts master sharing, verifies the restriction, then creates a random private writer secret. Save the result privately.
3. Update Explorer credentials on each device and HTTP worker credentials/directives. Drive queue authorization remains Drive access and needs no HTTP key.
4. Verify unauthenticated Google export is denied, old writer credential is denied, new writer master read succeeds, and the queue/worker can authenticate. Do not make test writes to real job rows.

New repo documentation redacts the old credential; Git history cannot make an exposed credential secret again. Rotation is required.

## Decision controls

Local drafts, submitting, result unknown, failed writes, pending readback, unconfirmed readback, and verified writes are separate statuses. A receipt alone never makes a decision verified: a fresh master must match the requested bucket and supplied note/reason/date. Cached rows cannot verify a new write.

Salary estimates always display ESTIMATED, even if another field says VERIFIED. Posted salary without explicit verification displays POSTED / UNVERIFIED. FLEX hints remain HINT / UNVERIFIED; confirmed FLEX requires explicit confidence and a basis.

Today leads with ready roles, explicit Tim decisions, upcoming recorded interviews, research older than 72 hours, overlapping research gaps and Scout cohort maturity. These are views of canonical rows, not an alternative ranker or job state. Heading maintenance filters stale document section headings while row BUCKET stays authoritative.

Comparison holds up to three PRIMARY_ID references locally, with pay provenance, location, degree/FLEX, floor, clearance and blockers. J/K navigate; 1–4 prepare pursuit/hold/decline/research decisions without writing. Save submits through the writer. Compact/comfortable density persists per device. Tab selection persists in the bookmark hash.
