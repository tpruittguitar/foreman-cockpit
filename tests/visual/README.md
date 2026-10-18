# Visual contract (Pipeline Explorer v1.5)

- **Visual owner:** Grok Bot (Tim, 2026-10-18). Two limits apply to everyone: L-1 accessibility floor, L-2 real numbers.
- `../../tokens.css` is the only place colour, size, duration and easing values live.
- `fixture/` holds one dataset for every frame. Scores come from `pipeline-scoring.js` with the published model rev 24 (`model-rev24.json`, same SHA-256 as live).
- `golden-src/` holds static frame pages built from tokens + fixture. `render-golden.cjs` renders them to `golden/*.png` at 1:1.
- `reference/` holds Grok Bot's PDF pages rendered 1:1 for side-by-side review. It is a reference only; builds are tested against `golden/`.
- `golden/<frame>.NOTES.txt` lists every difference from the PDF and the ruling behind it.
- A frame becomes binding only when Grok Bot and Tim approve it. The test harness (`test:visual`, REV-018, Codex) compares builds to approved frames.
