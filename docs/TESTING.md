# Testing and validation

## Environment and normal command

From the repository root:

```text
python -m pip install -r tools/requirements-authoring.txt
python tools/source_manifest.py --check
python self_test.py
```

The launcher itself uses Python's standard library. Authoring/tests use Pillow, NumPy and Node; direct pixel tests also need a usable GLES3/EGL environment. Preserve the repository's established suite rather than substituting source-string checks for executable behavior.

The self-test covers map/story/LUT/effect contracts, atlas roles/bounds, 27 staged objective/exit routes, Tin Stream bridge progression, movement/collision/input, follower recovery, ambient actors, resource bounds, editor/save isolation, foliage depth/order and sprite/material/shader/pixel contracts. The exact command list is in `self_test.py`.

In a Git checkout, the separate manifest check verifies both the tracked file inventory and its bytes. Expected failures while editing are resolved by staging intended additions/removals and regenerating the manifest after the source is final; see [Development](DEVELOPMENT.md#v415-consolidation-and-reproducible-checksums). A source archive without `.git` uses `sha256sum -c SHA256SUMS.txt` instead.

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

Repeat `--cpu-throttle` to compare controlled Chromium CPU-throttling rates, for example `--cpu-throttle 1 --cpu-throttle 4 --cpu-throttle 6`. The JSON retains raw samples plus median/p95/max phase and frame-gap summaries. See [PERF-001A measurement record](validation/performance/PERF-001A.md) for the baseline methodology, [PERF-002 validation](validation/performance/PERF-002.md) for the mutable-presentation result, and [PERF-003 validation](validation/performance/PERF-003.md) for bounded water updates and the measured canvas-readback fix.

Do not use one absolute CI millisecond value as a universal pass/fail target. The harness is intended to establish which synchronous phase dominates and how that work scales; physical low-end hardware evidence remains valuable.

PERF-003 adds complete-field bounded-vs-full comparisons to the ordinary self-test. The native browser suite checks the uploaded water textures against full-rebuild references. The timing harness requires bounded SurfaceFX and legacy-mask paths for the representative rivet/editor-water scenarios and a field upload smaller than the full texture. Its diagnostic timings must still be inspected for remaining synchronous stalls; passing the bounded-work assertions alone does not certify smooth hardware frame times.

PERF-004 adds authoritative static-terrain planning and runtime failure tests to the self-test. The browser fixture compares every color, normal and specular texture byte with a clean full build at integer and fractional native scales. It also compares the refactored full builder against the accepted pre-change composition, checks untouched exterior pixels, exercises editor history/final flushes and verifies all dependency/failure fallbacks. The representative water/path scenarios must use bounded color scratch and subuploads without invoking the full painter, and must preserve both unchanged material textures exactly. Changes to material dependencies still require all three full uploads. See [PERF-004 implementation and validation](validation/performance/PERF-004.md).

Fractional scales retain the full native canvas dimensions and origin, with an explicit guarded clip and bounded floor inputs. Integer scales retain local guarded surfaces. Output and summed guarded redraw area remain limited to 20%, and floor work to 35%. The original universal 1 MiB capacity limit is explicitly revised: local surfaces keep 1 MiB; one transient fractional color surface is capped at 4 MiB; cumulative color allocation is capped at 8 MiB per partial refresh. Allocation/initialization may touch the full backing, so actual canvas capacity and allocation counts are reported separately from clipped redraw area. Native instrumentation checks canvas dimensions, clip, transform, floor calls, source crop, release and all three complete textures independently. Earlier mounted/prefix fallbacks are removed; original fractional lamp, foliage, far-edit, history and footer cases must patch when ordinary local budgets fit. The added foliage case must cover nontransparent material pixels at both sizes. Failure-only target/clip diagnostics isolate the observed rounding issue; no pixel tolerance or benchmark coordinates change.

Use `--baseline-root /path/to/accepted/checkout` with the timing harness to measure the accepted source and candidate sequentially on the same host with identical scenarios, viewport, graphics and throttling. The candidate's bounded-work assertions stay mandatory; the older source is measured without imposing an optimization it does not yet implement. Raw records include both source commit/tree identities and per-scenario median comparisons.

Each candidate water/path timing record also includes `staticParity`: an exact comparison of all three GPU textures at the benchmark's actual native resolution. This validation runs after the event and its first post-event frame, with timing disabled, so it does not enter the reported event or frame interval. A mismatch fails validation and writes a separate static-raster diagnostic JSON beside the requested performance report.

## Continuous integration

[Validate source and runtime](../.github/workflows/validate.yml) uses one GitHub-hosted Ubuntu 24.04 job with Python 3.12 and Node 22. It runs for PRs targeting `main`, main pushes and manual dispatch. It checks the exact PR head, records the actual tested commit/tree separately from the event SHA and cancels stale runs for the same PR/ref. There is no parallel test matrix or duplicate feature-branch push run.

The job runs these gates once in order:

1. Complete tracked-source manifest check.
2. Required surfaceless GLES3 context, followed by `python self_test.py`, including genuine production shader/pixel tests. Missing GLES support fails CI instead of being accepted as rendered coverage.
3. `browser_render_regression_414.py` against real Chromium/WebGL2, including editor interactions and bounded texture parity.
4. `state_change_performance_415.py --samples 3 --cpu-throttle 1 --cpu-throttle 4`, preserving measurements and enforcing the bounded-work assertions. PR runs also check out their accepted base and run the same scenarios on that source for a same-host comparison; main pushes measure the merged candidate.
5. A second manifest check to detect any shipped-source changes made by tests.

The artifact `relay-moth-validation-<run-id>-<attempt>` is uploaded even after a test failure and retained for 30 days. It contains source identity, installed Python package versions, stage logs, browser JSON/screenshots and raw performance JSON for stages that ran. A missing result indicates that its stage did not complete; it is not a passing result. Preserve release/acceptance evidence beyond the artifact retention window when required.

## Documentation and packaging

```text
python tests/current/release_docs_regression_415.py
```

This checks current developer/Wiki local links and anchors (including extensionless Wiki links), release identity, preservation of compatibility identifiers, practical recovery/selection guidance and unescaped code markup in the consolidated pages. It deliberately excludes historical archives and the audited RAG from current-behavior linting. It does not claim that every external site is reachable.

For checksum/package reproduction use [Development](DEVELOPMENT.md). Run the self-test from a clean extraction, verifying internal checksums both before and after; bytecode/output outside the manifest is not a content change. Keep large transient logs/screenshots outside the repository.

## Evidence and limits

The concise [v4.15 final validation record](validation/v4.15/README.md) identifies tested candidates, commands, CI and environment limits. The [programme RAG](rag/editor-v415/README.md) remains provenance for the audited v4.14 starting point. Original detailed evidence is preserved in [4.14 milestone archive](4.14%20milestone%20archive/README.md), with historical packages/screenshots under `milestones/v4.14/`.

Linux software-rendered GLES/Chromium evidence does not certify Windows/Firefox drivers, hardware FPS/frame-time targets, arbitrary edited maps or every settings combination. Report browser-tooling limitations precisely; an earlier pass cannot be presented as a fresh candidate pass. Prefer direct state, pixel, shader and browser checks over name searches or averaged image errors that can hide sparse defects.
