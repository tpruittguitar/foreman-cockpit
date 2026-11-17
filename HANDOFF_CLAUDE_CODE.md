# Handoff for Claude Code (Nov 17, 2026, 3:15 AM ET)

Tim Pruitt is moving office and dev work from the Grok Bot "Claude" agent to Claude Code directly, to save Grok Bot usage.

## 1. Repositories (GitHub owner: tpruittguitar, both public)

| Repo | What it is | Live |
|---|---|---|
| https://github.com/tpruittguitar/foreman-cockpit | Pipeline Explorer, Foreman cockpit and the 3D office (`office/*.js`) | https://foreman-cockpit.pages.dev (Cloudflare Pages deploys main; the version is in `/build-info.json`) |
| https://github.com/tpruittguitar/forge-coordination | Forge coordination: asks/, control/CHANGE_REGISTER.txt, tools/office-status (builds OFFICE_STATUS for the office) | - |
| https://github.com/tpruittguitar/office-screens | Desk-monitor screen captures for the office | - |

Setup:
```
gh auth login            # as tpruittguitar, scopes repo, workflow, read:org
gh repo clone tpruittguitar/foreman-cockpit
gh repo clone tpruittguitar/forge-coordination
cd foreman-cockpit && npm ci
npx playwright install chromium    # only for the avatar renders below
pip install numpy pillow scikit-image opencv-python-headless
```

## 2. How to work (Tim's standing rules)
- Make one branch per change from fresh `origin/main` (git worktrees are fine). Keep changes small.
- Never put a `//` comment in the middle of a line.
- Run these checks before every push:
  `npm test` (1145 pass on main now) and `npm run build`, then `git checkout build-info.json`.
- Start the PR title with its own number, e.g. `#365 Office: ...`. Create the PR, then edit the title once you know the number.
- Write every PR you mention as a full-URL Markdown link.
- Merge your own PR once every check except the browser check passes (squash). Don't wait on the browser check; QA watches those.
- Never push a new commit to a PR while it is being merged. #362 merged with only its first commit because of that.
- forge-coordination PRs need a change record, or the check fails:
  `node tools/change-register/write.js control/changes/claude-<yyyymmdd-hhmm>-<slug>.txt --what "..."`, then
  `node tools/change-register/preflight.js <file>`. Put `PROVIDER=CLAUDE` in the commit message.
- Never force-push.
- Make no deploys, workflow dispatches, policy edits or new secrets without Tim's yes.
- No real brand artwork.

## 3. Open work: President avatar v8 (Tim: "target a 95% match to the reference")
- Branch: `claude/president-ref-v8` on foreman-cockpit. It is a WIP commit with no PR yet: `git fetch origin && git switch claude/president-ref-v8`.
- Code: `makePresident` in `office/chars.js`, and the viewer `tools/president-avatar.html` (`?pose=stand|sit|type|bike&az=&el=&zoom=&ty=`).
- References: `docs/pr-assets/president-ref-v2/refs/ref1.png`..`ref6.png` (6 turnaround views). The last attempt is `compare_v7.png`.
- Scoring kit in `docs/pr-assets/president-ref-v2/work/`:
  - `render.cjs <outdir>` renders the 6 views (it uses `views.json`, or the VIEWS / ZM / TY env vars).
  - `score.py <outdir>` prints the per-view and overall score. A view's score is 0.5 × outline IoU + 0.3 × mean per-part IoU (hair, skin, shirt, trousers) + 0.2 × SSIM. `score.py self` prints 1.0.
  - `opt.py` runs a parameter search, `best.json` holds the best parameters so far, and `score_log.txt` is the history.
- Scores so far: v7 = 0.6608 (lowest view 0.610). Best v8 = 0.7101. Target: 0.95 overall, with every view at least 0.92.
- The weakest part is the hair region IoU, which is as low as 0.04 in some views. The ref has a big, rounded, swept hair mass, not spiky tufts. Then work on head-to-body ratio, torso width, arm thickness and leg length.
- Keep the slot eyes, the "Tim" shirt print and the badge. Keep the seated, typing and bike poses with feet on the floor or pedals. Update `PRESIDENT_HEAD_Y` / `EYE_HEIGHT` in `office/office-logic.js` if heights change.
- Output: `docs/pr-assets/president-ref-v2/compare_v8.png` (refs on top, v8 below, each view labelled with its score) and `seated_bike_v8.png`. Open the PR as "#<n> Office: President avatar v8, 95% match to the reference" and merge per the rules above.

## 4. Recently merged (Nov 17, all ET)
- [#358](https://github.com/tpruittguitar/foreman-cockpit/pull/358) Bots keep a body-radius apart, and chair bases are nav obstacles.
- [#357](https://github.com/tpruittguitar/foreman-cockpit/pull/357) President v7.
- [#359](https://github.com/tpruittguitar/foreman-cockpit/pull/359) Body shape back to the #349 ellipsoid (`BOT_FLAT = 2`).
- [#360](https://github.com/tpruittguitar/foreman-cockpit/pull/360) Video games are 1 in 5 idle activities.
- [#361](https://github.com/tpruittguitar/foreman-cockpit/pull/361) Claude's star is domed.
- [#362](https://github.com/tpruittguitar/foreman-cockpit/pull/362) and [#364](https://github.com/tpruittguitar/foreman-cockpit/pull/364) `SHAPE_THICK = { clover4: 0.55, pill: 0.5 }` in chars.js (GUI, Sniffer and Gauge are thinner).
- [#363](https://github.com/tpruittguitar/foreman-cockpit/pull/363) Closed eyes when sleeping.
- [forge-coordination #409](https://github.com/tpruittguitar/forge-coordination/pull/409) Office-status uses a 30-minute working/idle window.

## 5. Tim's office preferences (keep these)
- Bot bodies are soft tapered ellipsoids: not pointy, boxy or wide.
- Claude's star cushion is domed front and back, with no apex.
- The bots are short and stand in their chairs at their desks.
- Idle activities:
  - HR training (HR walks around inviting bots).
  - Napping at the desk or on the lounge couches, with eyes closed.
  - The waterfall, the exercise bike, an energy drink or coffee.
  - Chatting in groups of 2 or 3, with white speech bubbles.
  - A video game on their computer (Doom-, Helldivers 2- or D&D-MMO-style), once in every five activities.
- Claude's usage: Tim triggers the reset himself. Stop and report at the limit.
