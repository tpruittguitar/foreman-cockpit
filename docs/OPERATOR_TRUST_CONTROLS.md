# Operator trust controls

The home page opens Pipeline Explorer. The former public master/feed export endpoints return HTTP 410 without any upstream fetch. Explorer reads only through a configured writer; there is no public fallback. The document ID is removed from the client source. Clearing writer configuration also clears the device's cached master. A configured device can display an explicitly labeled offline cache.

## Writer setup

Tim stopped the additional credential-rotation and sharing work on 2026-10-02. Keep the existing writer setup. No new login layer, Script Property credential, or account activation is required for these usability changes. The master remains the sole job authority and the existing writer remains its write route.

## Decision controls

Local drafts, submitting, result unknown, failed writes, pending readback, unconfirmed readback, and verified writes are separate statuses. A receipt alone never makes a decision verified: a fresh master must match the requested bucket and supplied note/reason/date. Cached rows cannot verify a new write.

Salary estimates always display ESTIMATED, even if another field says VERIFIED. Tim's ruling, 2026-10-05: salary posted in a job description is verified and displays VERIFIED, whoever hosted the posting (employer ATS, the employer's LinkedIn or Indeed post, a recruiter's ad or an aggregator copy). It is recognised from the posted fields, or from an explicit EMPLOYER_POSTED basis / POSTED label even when the figure sits in an estimate field. It shows POSTED / UNVERIFIED when the row contradicts itself (a posted value on a row also labelled or based as an estimate, or a posted field whose own text says estimate / not posted / claimed, such as 'Ladders estimate' or 'ESTIMATED BY LENSA') or SALARY_CONF records doubt (UNVERIFIED, LOW, DISPUTED, CONFLICT), unless SALARY_CONF is explicitly VERIFIED. An estimate with no posted value stays ESTIMATED. Tim's ruling, 2026-10-05: FLEX known from the job description is verified. That is a FLEX class plus degree or FLEX evidence recorded from the posting (DEGREE_TEXT, DEGREE_REQ, a degree quote, or FLEX_BASIS). It stays unverified when FLEX_CONF records doubt, when there is no posting evidence, or when the evidence says the wording was not retrieved, not found, not confirmed, not read, inferred or estimated; an estimated basis displays ESTIMATED. FLEX hints remain HINT / UNVERIFIED. Salary and FLEX cells show the figures and the FLEX class, not a tag: anything not VERIFIED is prefixed with ~, and the full trust label is in the tooltip.

Today leads with ready roles, explicit Tim decisions, upcoming recorded interviews, research older than 72 hours, overlapping research gaps and Scout cohort maturity. These are views of canonical rows, not an alternative ranker or job state. Heading maintenance filters stale document section headings while row BUCKET stays authoritative.

Comparison holds up to three PRIMARY_ID references locally, with pay provenance, location, degree/FLEX, floor, clearance and blockers. J/K navigate; 1–4 prepare pursuit/hold/decline/research decisions without writing. Save submits through the writer. Compact/comfortable density persists per device. Tab selection persists in the bookmark hash.
