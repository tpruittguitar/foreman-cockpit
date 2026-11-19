# Third-party code in the 3D office viewer (`office.html`, `office/`)

Everything is vendored here and pinned. Nothing loads from a CDN at runtime, and there is no build step.

| Item | Source | Pinned version | License | Author / attribution | Files |
|---|---|---|---|---|---|
| three.js (ES module build, minified) | https://github.com/mrdoob/three.js (npm package `three`) | 0.170.0 (r170) | MIT (verified in the package's `LICENSE` and `package.json` `"license": "MIT"`) | three.js authors | `office/vendor/three/three.module.min.js`, `office/vendor/three/LICENSE` |
| PointerLockControls addon | `examples/jsm/controls/PointerLockControls.js` in the same three.js 0.170.0 package | 0.170.0 | MIT (same license file) | three.js authors | `office/vendor/three/addons/PointerLockControls.js` |
| CSS3DRenderer addon (pipeline wall display, iframe on a 3D plane) | `examples/jsm/renderers/CSS3DRenderer.js` from the npm package `three` 0.187.0 (only core `Matrix4`/`Object3D`/`Quaternion`/`Vector3` are used, so it runs on the vendored r170 core; copied unmodified) | 0.187.0 | MIT (three.js `LICENSE`) | three.js authors | `office/vendor/three/addons/CSS3DRenderer.js` |
| GLTFLoader addon + BufferGeometryUtils (loads the President model) | `examples/jsm/loaders/GLTFLoader.js` and `examples/jsm/utils/BufferGeometryUtils.js` in the npm package `three` 0.170.0 (copied unmodified) | 0.170.0 | MIT (three.js `LICENSE`) | three.js authors | `office/vendor/three/addons/GLTFLoader.js`, `office/vendor/three/utils/BufferGeometryUtils.js` |

The President model `office/assets/president.glb` is Tim's own textured 3D model (his files, baked by `tools/president-glb/bake.py`). The "Tim" print and the round VW-style badge stand-in on its shirt are drawn in code (`office/chars.js`); no logo artwork file is used.

Fonts come from the repo's existing `fonts/` folder (Inter, IBM Plex Mono), which is already covered by `licenses/`.

Not used:
- Third-party 3D models (Kenney, Quaternius and similar): no character or furniture model matched the approved v4 look, which needs each bot's own avatar silhouette, so the bots and props are built from Three.js primitives in `office/chars.js` and `office/office.js`.
- Virtual-joystick libraries: the joystick is about 20 lines in `office/office.js`.
