RELAY MOTH FOREST — PRETTY GRAPHICS EDITION 4.14

START
Extract the whole versioned folder, then run 0Play.cmd. Keep assets and JSON files alongside the runtime scripts. The launcher serves the game on localhost.

V4.14 SPRITE RENDERING AUDIT
Corrects source/material alpha mismatches, tree split seams, lighting-off behavior, flipped/rotated material normals, static/live shading mismatches, whole-plant fade opacity, mixed-material depth ordering, fallback grass geometry, same-count editor rendering caches and optional shader state leaks. Adds real GLES rendered-pixel tests and native Chromium WebGL2 integration coverage.

The recent closer/faster casual followers, independent recovery and whole-sprite foliage approach remain. Maps, story, LUTs and effects are unchanged from v4.13.

EDITOR
F2 toggles the normal-view editor. Left paints/selects; right removes; O selects object-layer items. B/S/V/E choose brush/select/move/erase. Ctrl+C/V copies/pastes; Delete removes; Ctrl+Z/Y undoes/redoes. Tab hides/restores editor chrome. SAVE TO PROJECT writes map JSON with a timestamped backup; DOWNLOAD JSON remains available.

GRAPHICS
G opens graphics controls. Source-space normals now respond consistently across static and live decoration, rotation, mirroring and display resolution. Bump/lighting off removes local material shading. Normal/specular PNGs are coordinate-matched to the colour atlas. Foliage remains non-additive; no actor-shaped clipping has returned.

VALIDATION
The full suite needs Node plus Pillow/NumPy (tools/requirements-authoring.txt).
python self_test.py
The suite includes strict all-sprite material alpha checks, exact ten-family tree reconstruction, real rendered-pixel GLSL tests, renderer behavior checks and the inherited gameplay/editor tests. GLES tests explicitly skip when no suitable context exists; see shipped logs for what ran in the audit environment.

Optional native browser test (requires Playwright + Chromium):
python tests/current/browser_render_regression_414.py --out <evidence-directory>

DOCUMENTATION
- docs/current/SPRITE_RENDER_AUDIT_414.md: detailed findings, corrections, measurements and limits
- docs/current/MATERIAL_PIPELINE_414.md: current material architecture
- docs/current/EDITOR_GUIDE.txt and OBJECT_EDITOR_412.md: editor usage
- docs/validation/v4.14/: baseline/fixed metrics, native frames and execution evidence
- docs/history/: retained historical notes
- tests/current/: executable regression suite; tests/support/: real-GLES harness
- tools/: authoring utilities

EXISTING PROJECTS
This download cannot contain your edits made locally after v4.13. Keep a copy of your edited relay_moth_maps.json/editor_backups before replacing the folder; bring your edited map into the new folder rather than losing it to the bundled baseline map. Sprite atlas/material updates are part of this release, so do not replace them with v4.13 atlases.
