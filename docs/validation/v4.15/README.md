# v4.15 release-consolidation validation

## Candidate provenance

Programme: E415 / #4; final child E415-11 / #15. Starting main: `d54898cdda5df0fc325a7ea8f9f97883e6b73281` (PR #25). No editor feature, map, sprite/material or compatibility migration is part of this consolidation.

Fresh candidate `06be238009f453dbd04b1039c2680f9527e60c5d`, tree `ef697b52350e6e468cc19068662adfd59a10f54b`, was tested on 2026-10-03 by Actions run [37082461295](https://github.com/techrote/Relay-Moth-Forest/actions/runs/37082461295), job `111085733234`: **PASS**, with the direct EGL checks skipped as detailed below. The original PR #25 run `37079104325` and transport baseline run `37081181900` are not substitutes for this fresh candidate evidence.

Final source review then clarified the documented persistent-robot copy exception (decorative copy without a persistent ID; runtime unchanged), added this record and refreshed the manifest. The acceptance PR/issue identifies the subsequent tested head/run covering those final edits and records the exact tree comparison after removing temporary validation tooling. This avoids a self-referential tested-commit declaration inside its own commit.

## Results

| Gate | Fresh candidate result |
| --- | --- |
| `python self_test.py` | PASS in candidate checkout and clean source-package extraction; optional EGL tests skipped in this CI environment |
| Dedicated editor behavior | PASS, all 14 programme safety cases, also explicitly invoked outside self-test |
| Shared procedural decor | PASS, reserved bridge/island/objective/gate surfaces, stable samples and suppression |
| Inherited render contracts / strict assets | PASS; 544 regions across four atlases, 10 exact tree reconstructions |
| Native Playwright/Chromium | PASS, all nine rooms and real editor interactions; no console/page runtime errors |
| Documentation/version/compatibility | PASS, 82 local links/anchors plus release and compatibility assertions |
| Clean versioned source package | PASS; 307 manifest entries verified before and after self-test and explicit editor/reservation/docs tests |
| Direct GLES shader/pixel validation | Fresh local candidate PASS, 21 shader programs and rendered-pixel assertions; first candidate CI explicitly SKIP (`libEGL missing`) |

CI environment: Ubuntu 24.04, Python 3.12.14, Node 22.23.3, Playwright 1.63.0 with Chromium 153.0.8010.12, native WebGL2 through ANGLE/SwiftShader. Local direct GLES and browser checks used Mesa software rendering; the GLES context reported OpenGL ES 3.2 Mesa 25.0.7-2. Browser and direct EGL are separate gates: Chromium working does not establish that Python's EGL library is installed. The repeat-run CI setup explicitly installs EGL/GLES and requires a pixel-results report, so an optional skip cannot masquerade as that gate's pass.

## Reproduction

From the candidate root:

```text
python self_test.py
node tests/current/editor_behavior_regression_415.js
node tests/current/procedural_decor_regression_415.js
node tests/current/render_contracts_414.js
python tests/current/sprite_assets_regression_414.py
python tests/current/sprite_pixels_regression_414.py --out /tmp/relay-v415-pixels
python tests/current/browser_render_regression_414.py --out /tmp/relay-v415-browser
python tests/current/release_docs_regression_415.py
sha256sum -c SHA256SUMS.txt
```

Install authoring requirements, Node and Playwright/Chromium as described in [Testing](../../TESTING.md). Direct GLES tests additionally need surfaceless EGL/GLES libraries (Ubuntu: `libegl1`, `libegl-mesa0`, `libgles2`, `libgl1-mesa-dri`). Native-browser execution is recorded separately from deterministic validation. Make a versioned `git archive` outside the checkout, extract into a clean directory, verify checksums, run self-test and the explicit editor behavior/procedural/docs suites, then verify checksums again. Transient logs/screenshots are not retained in this repository; concise JSON diagnostics are attached to the Actions run.

## Version classification and scope

Updated product identity: VERSION, HTML title/help, launcher/self-test banner, game header/diagnostics and F10 download filename, editor header, current documentation and Wiki baseline. Preserved: all JSON data, schemas (including HD atlas v4.14), browser keys, internal FoliageFX/SurfaceFX identifiers and descriptor signatures, material tooling, inherited test filenames, historical changelog sections, milestone packages and archived evidence. RAG stays in place with an index directing readers to the shipped contract.

## Limits

The local execution container cannot resolve GitHub for a direct clone; its exact pinned source snapshot was obtained through a bounded GitHub Actions artifact. This affects transport, not the production tests. Linux software-rendered Chromium/GLES is not certification of Windows/Firefox drivers or hardware performance. Documentation checks validate repository/Wiki references, not availability of external sites. CLEAN after export is the editor's issued-download baseline, not proof of browser download completion.
