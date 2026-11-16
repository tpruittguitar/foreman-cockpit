# Third-party code in the 3D office viewer (`office.html`, `office/`)

Everything is vendored here and pinned. Nothing loads from a CDN at runtime, and there is no build step.

| Item | Source | Pinned version | License | Author / attribution | Files |
|---|---|---|---|---|---|
| three.js (ES module build, minified) | https://github.com/mrdoob/three.js (npm package `three`) | 0.170.0 (r170) | MIT (verified in the package's `LICENSE` and `package.json` `"license": "MIT"`) | three.js authors | `office/vendor/three/three.module.min.js`, `office/vendor/three/LICENSE` |
| PointerLockControls addon | `examples/jsm/controls/PointerLockControls.js` in the same three.js 0.170.0 package | 0.170.0 | MIT (same license file) | three.js authors | `office/vendor/three/addons/PointerLockControls.js` |

Fonts come from the repo's existing `fonts/` folder (Inter, IBM Plex Mono), which is already covered by `licenses/`.

Not used:
- 3D models (Kenney, Quaternius and similar): no character or furniture model matched the approved v4 look, which needs each bot's own avatar silhouette, so all characters and props are built from Three.js primitives in `office/chars.js` and `office/office.js`.
- Virtual-joystick libraries: the joystick is about 20 lines in `office/office.js`.
