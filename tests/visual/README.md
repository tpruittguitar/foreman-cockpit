# Visual contract harness

Run `npm ci`, `npx playwright install --with-deps chromium`, then `npm run test:visual`.
For an installed Chromium: `PIPELINE_CHROMIUM=/usr/bin/chromium npm run test:visual`.
`PIPELINE_PLAYWRIGHT_MODULE` accepts the same module override as needs-tim.browser.js.
Use one pinned Playwright Chromium/Linux environment for baseline generation and comparison;
system Chromium versions and platform font rasterization can produce different pixels.

The default is a **placeholder**, not an approved Pipeline Explorer frame. Its static HTML,
separate sample tokens and committed baseline PNGs live under `sample/`. It loads the existing
`tests/fixtures/master.sample.txt` through the mocked Writer. No production files are changed.
Sample baselines were captured with Linux Chromium 151.0.7922.173 (see receipt for exact version).
`npm run test:visual -- --bootstrap-sample` can regenerate only these sample PNGs; ordinary
runs fail on missing PNGs. The harness never generates or updates `golden/` or `design/`.

## Connecting Claude's frames

Copy `elements.json` and `geometry.json` to a frame-specific pair, then set:

```
VISUAL_ELEMENTS=tests/visual/F01-elements.json VISUAL_GEOMETRY=tests/visual/F01-geometry.json npm run test:visual
```

All paths in JSON resolve from the repository root (absolute paths also work).
Set `page` to the served HTML path, including query/hash for the desired fixture state;
`ready` to a selector proving data and initial transitions are ready; `tokens` to `tokens.css`;
and `goldenDir` to `tests/visual/golden` (also the default if omitted).
PNG filenames are `<viewport.name>.png`; use frame-specific viewport names, e.g.
`F01-desktop` and `F01-phone`, to share one golden directory. Viewport names allow letters,
numbers, underscores and hyphens. Viewports explicitly set width, height, DPR and mobile/touch flags.

`elements` lists `{name, selector, styles: {"css-property": "--token"}}`. Each selector must match
exactly one node. Expected values are parsed with PostCSS from unconditional top-level `:root`
declarations in the token file, then normalized in an isolated browser document (including `var()`
references, hex-to-rgb, shorthand borders and font families). They do not read token values back
from the tested page. Conflicting duplicate tokens fail. Theme/media-specific token contracts
require a separate token input; imported token sheets must be consolidated by their owner.

`geometry.viewports[].boxes` maps names to `{selector, x, y, width, height}`. All four dimensions
are required, measured in CSS pixels, with ±1 px tolerance, independent of DPR. The harness also
rejects horizontal overflow. Define actual safe-area/tap-target geometry in the frame contracts;
the placeholder makes no accessibility or safe-area certification.

`motion` lists `{name, selector, duration: "--duration-token", easing: "--easing-token"}` with optional
`animationName` for CSS animations. Every `document.getAnimations()` result must match exactly one
entry; every entry must have an animation. Durations use browser-normalized milliseconds; WAAPI
and transition effect easing is checked, while CSS animation segment easing comes from keyframes.
Run with the desired animation active (including a paused animation); completed/removed effects
cannot be checked retrospectively. Infinite animations fail capture: expose a finite fixture state.
The harness waits for fonts and image decoding, checks motion, pauses animations at their end,
pauses the clock and captures the viewport at native DPR with carets hidden. External requests
are blocked or mocked. Fonts must be local/self-hosted. `document.fonts.ready` waits for used fonts;
the token contract should also name the intended font family.

Writer GET `master` always returns the fixture and fixed timestamps. `writerResponses` may supply
other action responses; `githubResponse` supplies the GitHub mock. POSTs fail. Browser time, locale,
timezone and color scheme are fixed. Page errors fail the run. Each viewport runs in a fresh context;
a failure still closes contexts/browser/server and the other viewport is attempted.

## Pixel threshold and diagnostics

`VISUAL_DIFF_PERCENT=0.2` sets the maximum differing pixels as a **percentage**, not a ratio
(0.2 = 0.002 of all pixels). Default 0.2%; range 0..100. JSON `diffPercent` is a fallback.
Pixelmatch's per-pixel color sensitivity is fixed at 0.1; antialias changes count.
Size mismatches fail. Actual and diff PNGs go to ignored `tests/visual/artifacts/`, overridable
with `VISUAL_ARTIFACTS`. Baselines remain read-only on normal runs; threshold never creates them.

Run `node --test tests/visual/harness.test.cjs` to verify deliberate token, geometry, motion and
pixel regressions fail, plus the 0.2% boundary. Use the same Chromium override as the main command.
Selection latency, frame budgets, flash frequency, raw-value lint and PR CI wiring remain separate
measurement work; these checks do not claim those broader section 4.3 gates are satisfied.
