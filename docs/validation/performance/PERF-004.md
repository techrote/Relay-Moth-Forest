# PERF-004 bounded static terrain and material refresh

Issue: [#37](https://github.com/techrote/Relay-Moth-Forest/issues/37).
Accepted starting source: `5e6ea67c0ca8ba4d00b35d0e68ac4bb4d573680d`.

## Problem and scope

PERF-003 removed the water-mask readback stall, but small editor terrain edits
still painted all 760 logical floor cells into three native-resolution canvases
and replaced all background textures. Its prior same-host editor-water sample
reported a 602.9 ms median in `static.build`. That historical number motivates
the work; it is not a matched PERF-004 before/after measurement.

Ground, path and water edits now use bounded static color/material patches when
the final authoritative room differs only in a small number of floor cells.
The game continues to synchronously rebind room/collision data, refresh static
presentation, update water and refresh foliage in the existing editor flush.
Painting, clearing, same-count moves, undo/redo, cancellation and persistence
flushes use the same comparison. No editor tool name is trusted as proof that
only terrain changed.

## Authority and fallback

`static_terrain.js` is a data-only UMD module. `capture(room, context)` copies
the effective floor classifications and canonical static dependencies into an
immutable snapshot. `plan(previous, next)` returns `full`, `patch` or `noop`,
the reason, changed cells, native output rectangles and conservative floor-input
ranges. Only snapshots created by this module are trusted.

Dependencies include walls, border, blocker styles, trees, mounted lamps,
decor/pattern exclusions, room pattern, bridge topology, microtile size and
objective kinds used by mounted-lamp substitution. Context includes native
dimensions, source/renderer/art/atlas/material identities and exact serialized
LUT and atlas metadata. In-place color or metadata changes are detected even
when a theme name, array length or object identity remains unchanged.

Room entry, resizing, renderer/source replacement, missing or stale rendered
baselines, static dependency changes and excessive work use the full renderer.
The wall dependency deliberately catches the vegetation overlap threshold:
changing a row pair from three shared blockers to four can change its whole
interstitial population. Replacing a blocker/tree with water also falls back.

Generated decor, authored editor decor, recruitable robots, completed objectives,
gates and bridge progression remain live presentation under PERF-002. Their
ordinary changes do not rebake the static backing. Bridge topology is a static
dependency; bridge completion stage is not.

## Bounded composition

The full `StaticPainter.build` remains the clean reference and fallback.
`buildPatch` shares its composition primitives through `buildSurface`, including
the exact tile seeds, row-major floor order, sky, sorted blocker sprites,
vegetation interstitials, room patterns, mounted lamps and footer.

Each region creates one small color canvas and two transparent material canvases.
Its transform uses the full native scale and an integer native-pixel translation,
so a fractional display scale keeps the same raster phase. Nearby floor cells
are replayed in their original order. Every unchanged static overlay is replayed
into the clipped scratch surface, preserving sprite/glow overlap and material
alpha. Footer sprites still affect color only, after material contexts detach.

For supported 4/8/16-pixel microtiles, floor marks extend at most three logical
pixels right and two down. A symmetric four-logical-pixel halo plus two native
pixels covers raster rounding/antialiasing. A separate conservative input range
includes neighboring floor marks that can reach the output edge. Other microtile
sizes retain the full renderer until independently qualified.

Default planning limits are 16 changed cells, eight merged regions, at most 20%
of native pixels, 35% of logical floor raster work, and 262,144 pixels in the
largest scratch map. Thus the three-map scratch capacity is at most 3 MiB on
the bounded path. Regions are processed sequentially and released immediately;
no three-map native CPU backing or multiroom canvas cache is retained.

`GLRenderer.patchBackground` subuploads color, normal and specular maps with the
same native output rectangle and vertical orientation. It validates texture
storage, dimensions and material completeness before the first write. A rendered
revision and snapshot advance only after the entire update succeeds. Any patch
failure triggers a synchronous full rebuild; a failed repair invalidates the
baseline and background key for retry. Scratch and failed full-build canvases are
released on both success and failure. Replacing an atlas/material source also
discards derived tint/normal tile caches.

## Diagnostics and timing

F10 runtime diagnostics include `renderer.staticRefresh`: mode/reason, changed
cells, floor cells rastered, native pixels, upload calls/bytes, scratch capacity,
regions and retained scratch pixels. No-op refreshes report zero work. Upload
counters include attempted calls when a failure requires repair.

The opt-in probe separates `static.plan`, full/patch scratch allocation, floor
raster, static overlays/materials, footer and each color/normal/specular upload.
The bounded renderer performs no full-canvas readback. Normal atlas transform
tiles retain their preexisting bounded cache and readback behavior.

The performance harness now includes editor path painting as well as editor
water movement. Both must avoid `static.build`, raster fewer than 760 cells,
upload less than the complete three-map native backing and retain no scratch.
The existing PERF-003 rivet/editor-water assertions remain mandatory.

PR CI checks out the accepted base and measures both source trees sequentially
on one host with identical scenarios, three samples and 1x/4x CPU throttling.
Absolute software-rendered milliseconds remain diagnostic rather than a flaky
universal latency gate. Raw results and source identities are retained in the
validation artifact; the final qualification record is linked from the PR.

## Executable acceptance

- `static_terrain_regression_415.js`: exact classification/diff behavior,
  same-count movement/history, immutable authority, all dependency/identity and
  work-budget fallbacks, malformed/stale snapshots and all-grid native halo
  coverage against actual production floor primitive footprints.
- `static_terrain_runtime_regression_415.js`: production orchestration/upload
  transactions, no-op behavior, bounded work, resource release and injected
  raster/subupload/full-repair failures.
- `static_terrain_browser_415.js`, loaded by the native browser suite: all three
  complete GPU textures compared with independent clean full builds at 640x360
  and 997x563, untouched exterior bytes, overlays/materials/footer, editor final
  flush/history/cancel paths, fallback matrix, failure recovery and preserved
  water/live-presentation behavior. A frozen accepted full-build body independently
  checks that the shared composition refactor preserved all nine rooms.
- The inherited self-test, real GLES shader/pixel suites, all-room native editor
  suite, 1x/4x performance assertions and before/after source manifests remain
  required on the final candidate and merged source.

Local Chromium launch is blocked by this execution environment's socket policy.
Local deterministic/GLES results are distinct from the required hosted native
browser qualification. A missing or failed native result is not a rendered pass.

## Practical limits

Large strokes and edits to static overlay dependencies intentionally rebuild the
room. Replaying overlay draw commands still has CPU cost, although native raster
and texture-transfer work is bounded. Linux software-rendered evidence does not
certify Windows/Firefox drivers or physical low-end frame times. No gameplay,
campaign data, art, schema or material appearance change is intended.
