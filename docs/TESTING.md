# Testing and validation

## Environment and normal command

From the repository root:

```text
python -m pip install -r tools/requirements-authoring.txt
python self_test.py
```

The launcher itself uses Python's standard library. Authoring/tests use Pillow, NumPy and Node; direct pixel tests also need a usable GLES3/EGL environment. Preserve the repository's established suite rather than substituting source-string checks for executable behavior.

The self-test covers map/story/LUT/effect contracts, atlas roles/bounds, 27 staged objective/exit routes, Tin Stream bridge progression, movement/collision/input, follower recovery, ambient actors, resource bounds, editor/save isolation, foliage depth/order and sprite/material/shader/pixel contracts. The exact command list is in `self_test.py`.

## v4.15 editor release gates

Run the dedicated programme suite explicitly, even when it has already run within self-test:

```text
node tests/current/editor_behavior_regression_415.js
node tests/current/procedural_decor_regression_415.js
```

`EDITOR BEHAVIOR REGRESSION 4.15 PASS` represents 14 executable policy/mutation/history/identity/validator/invalidation cases: Tin Stream bush/rivet overlap; layer hit policy; cross-room undo; persistent robot move; globally unique moth copies; one logical wildlife group; hidden objective recovery; pattern/generated suppression recovery; all-room reserved bridge/objective surfaces; snapped move agreement; pointercancel/Escape rollback; semantic diagnostics; dirty/save/undo/redo; and isolated invalidation.

Focused `editor_*_regression_415.js` suites add adversarial inspector, copy/cycle, transaction, suppression, server-independent dirty/save and semantic-validation coverage. `procedural_decor_regression_415.js` directly exercises shared enumeration/reservations. These tests execute production code; they are not just a search for method names.

## Inherited renderer/material gates

Keep the historical filenames: they identify the material contract being preserved, not the current product release.

```text
node tests/current/render_contracts_414.js
python tests/current/sprite_assets_regression_414.py
python tests/current/sprite_pixels_regression_414.py --out /tmp/relay-v415-pixels
```

The pixel suite evaluates production shader constructors, compiles GLSL in a real GLES3 context where supported, draws and reads pixels. Coverage includes unlit invariance, flipped/rotated normals, static/live agreement, split seams, source alpha, whole-plant opacity and rooted motion. A missing GPU/context must be reported, not relabelled as a rendered pass.

## Native Chromium editor and renderer

```text
python -m pip install playwright
python -m playwright install chromium
python tests/current/browser_render_regression_414.py --out /tmp/relay-v415-browser
```

On Linux CI, `python -m playwright install --with-deps chromium` also installs browser system dependencies. The harness uses system `chromium` when available, otherwise Playwright's browser; `--chromium /path/to/chromium` explicitly selects one.

This is actual Chromium/WebGL2/Canvas2D/DOM execution, with local JSON/images injected to avoid network-policy dependence and a controlled animation scheduler. It renders all nine rooms and settings/material/quality/resize cases. Editor coverage includes a physical right-click against the recreated Tin Stream overlap, canvas selection and inspector input/Enter/Ctrl+Z, CLEAN/DIRTY transitions, Alt-click cycling, objective hide/show, suppressed-pattern restore, palette interactivity, Tab chrome restore, ghost geometry and same-count invalidation. Console/page errors fail the test.

The historical overlap fixture adjusts hit geometry only in its ephemeral test page; it does not change campaign data. Browser assertions and exact state, not screenshots alone, are acceptance authority.

## State-change performance diagnostics

PERF-001A adds an opt-in browser timing probe and localhost Chromium harness for objective, persistent-robot and editor rebuild stalls. It is intentionally separate from the ordinary correctness self-test because absolute CI latency is not a stable release threshold.

Run:

```text
python tests/current/state_change_performance_415.py --out /tmp/perf-001a.json --samples 3
```

Repeat `--cpu-throttle` to compare controlled Chromium CPU-throttling rates, for example `--cpu-throttle 1 --cpu-throttle 4 --cpu-throttle 6`. The JSON retains raw samples plus median/p95/max phase and frame-gap summaries. See [PERF-001A measurement record](validation/performance/PERF-001A.md) for the baseline methodology and [PERF-002 validation](validation/performance/PERF-002.md) for the mutable-presentation before/after result.

Do not use one absolute CI millisecond value as a universal pass/fail target. The harness is intended to establish which synchronous phase dominates and how that work scales; physical low-end hardware evidence remains valuable.

## Documentation and packaging

```text
python tests/current/release_docs_regression_415.py
```

This checks current developer/Wiki local links and anchors (including extensionless Wiki links), release identity, preservation of compatibility identifiers, practical recovery/selection guidance and unescaped code markup in the consolidated pages. It deliberately excludes historical archives and the audited RAG from current-behavior linting. It does not claim that every external site is reachable.

For checksum/package reproduction use [Development](DEVELOPMENT.md). Run the self-test from a clean extraction, verifying internal checksums both before and after; bytecode/output outside the manifest is not a content change. Keep large transient logs/screenshots outside the repository.

## Evidence and limits

The concise [v4.15 final validation record](validation/v4.15/README.md) identifies tested candidates, commands, CI and environment limits. The [programme RAG](rag/editor-v415/README.md) remains provenance for the audited v4.14 starting point. Original detailed evidence is preserved in [4.14 milestone archive](4.14%20milestone%20archive/README.md), with historical packages/screenshots under `milestones/v4.14/`.

Linux software-rendered GLES/Chromium evidence does not certify Windows/Firefox drivers, hardware FPS/frame-time targets, arbitrary edited maps or every settings combination. Report browser-tooling limitations precisely; an earlier pass cannot be presented as a fresh candidate pass. Prefer direct state, pixel, shader and browser checks over name searches or averaged image errors that can hide sparse defects.
