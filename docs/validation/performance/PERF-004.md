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
The raster surface includes a 32-native-pixel guard around the output rectangle,
aligned outward and clipped to the native canvas. Only its interior is uploaded.
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

Output bounds also expand to a sixteen-native-pixel grid before clipping to the
canvas, merging regions and applying work budgets. Skia's gradient dither uses an
[8x8 table at device coordinates](https://skia.googlesource.com/skia/+/5fdfc51ef3e8/src/gpu/ganesh/SkGr.cpp),
and its [fragment coordinates use an upper-left origin](https://skia.googlesource.com/skia/+/89c0ddff982bf3383beeba6397d3236526fb4a76/src/sksl/README.md).
Preserving that phase matters for overlapping lamp glows: the unaligned native
rectangle `(170,90,28,28)` differed from the full color texture by one byte level
in 209 pixels, while normal/specular maps and exterior pixels matched exactly
([diagnostic run](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41563498272)).
The expanded rectangle is `(160,80,48,48)`, preserving the eight-pixel dither
phase. The larger grid also avoids the measured border-sprite sampling mismatch:
at `(312,264,32,32)`, two specular-alpha bytes differed by one level, while the
`(304,256,48,48)` diagnostic variant matched every color/normal/specular byte
([native comparison](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41564327204)).
The original lower clip cut through a flipped sprite sampled from the large
specular atlas; extending only its horizontal bounds did not resolve the error.
Alignment alone was insufficient for a coalesced move: two pixels on the outermost
scratch column had three differing normal bytes
([boundary diagnostic](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41565413874)).
The separate guard moves scratch clipping away from the uploaded interior.
The raster input range and all memory, pixel and work limits account for the
guarded bounds. The complete native acceptance matrix, not the alignment or
guard constants alone, qualifies the resulting image sampling.

Default planning limits are 16 changed cells, eight merged regions, at most 20%
of native output pixels and guarded raster pixels, 35% of logical floor raster
work, and 262,144 pixels in the largest scratch map. Overlapping guards are counted
separately, including duplicate raster work. Thus three-map scratch capacity is at most 3 MiB on
the bounded path. Regions are processed sequentially and released immediately;
no three-map native CPU backing or multiroom canvas cache is retained.

`GLRenderer.patchBackground` subuploads color, normal and specular maps with the
same native output rectangle and vertical orientation. WebGL2's explicit-size
`TexImageSource` overload crops directly from each guarded canvas using unpack
skips; no application-side crop canvas or readback is introduced. This follows the
[WebGL2 DOM-source pixel-store contract](https://registry.khronos.org/webgl/specs/latest/2.0/#PIXEL_STORE_PARAM_UPLOAD_DOM).
With vertical flipping enabled, skipped rows count from the source bottom, as
implemented by Chromium's `TexImageParams::GetSourceRect`. All three unpack
settings are restored on success and failure. The renderer validates texture
storage, output/raster containment, dimensions and material completeness before
the first write. A rendered
revision and snapshot advance only after the entire update succeeds. Any patch
failure triggers a synchronous full rebuild; a failed repair invalidates the
baseline and background key for retry. Scratch and failed full-build canvases are
released on both success and failure. Replacing an atlas/material source also
discards derived tint/normal tile caches.

## Diagnostics and timing

F10 runtime diagnostics include `renderer.staticRefresh`: mode/reason, changed
cells, floor cells rastered, output pixels, guarded raster pixels, upload calls/bytes, scratch capacity,
regions and retained scratch pixels. No-op refreshes report zero work. Upload
counters include attempted calls when a failure requires repair.

The opt-in probe separates `static.plan`, full/patch scratch allocation, floor
raster, static overlays/materials, footer and each color/normal/specular upload.
The bounded renderer performs no full-canvas readback. Normal atlas transform
tiles use the bounded source cache described below; their pixel-transform and
small-tile readback behavior is unchanged.

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

### Native oracle inputs

The clean full reference uses the actual loaded `HDArtSheet` and its derived
sprite surfaces, as a normal full refresh does. Independent cold-cache
current-versus-legacy builds separately qualify the composition refactor across
all nine rooms and both native sizes. Resource-change cases also require removal
and release of the old derived surfaces.

This distinction was established by a
[hosted diagnostic run](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41560857705).
At 640x360 in Quiet Nest, current and legacy full builders agreed in every
color/normal/specular byte using shared loaded surfaces. Independent cold
current/legacy builds also agreed, and all 49 shared transformed-normal cache
entries had identical source RGBA bytes. Nevertheless, rendering the warm and
recreated canvas objects into default Chromium destinations produced 3,897
different normal-map bytes; isolated source sampling reproduced the discrepancy.
CPU-backed destination comparisons agreed, while changing the entire renderer
to CPU backing changed many other pixels. The production raster path therefore
remains unchanged. Patch-versus-full acceptance still requires exact equality
for every byte of all three textures, using the same loaded source surfaces.

### Stable normal-sprite sources

The same-source qualification exposed a production cache issue during room
transitions: the 64-entry FIFO transformed-normal cache could evict a source
already drawn for the current room. Dawn needs 66 distinct normal transforms,
so a repeated full draw recreated its entire working set. That source-identity
churn also occurred during transitions into rooms with smaller working sets.

The transformed-normal cache now promotes hits and retains at most 96 entries,
enough for every shipped room's static working set. Eviction still releases the
old backing immediately. This is a bounded sprite-atlas cache; full-room CPU
surfaces remain unretained. Normal-vector math, source pixels, tint-cache limits
and drawing order are unchanged. A production-method regression replays the
authored room requests, verifies full/patch source identity and bounded eviction,
and demonstrates the old FIFO failure with the same data.

Each newly created transformed source advances a generation counter. If cache
pressure changes those sources after a rendered baseline, the next terrain edit
uses a full render. If a bounded draw itself needs a new source, it releases its
scratch and synchronously repairs all three textures with a full render before
committing the baseline. This deliberately covers authored rooms exceeding 96
distinct transforms without growing the cache. A no-op cannot authorize changed
sources, and a failed repair invalidates both texture and source authority.

## Practical limits

Large strokes and edits to static overlay dependencies intentionally rebuild the
room. Replaying overlay draw commands still has CPU cost, although native raster
and texture-transfer work is bounded. Linux software-rendered evidence does not
certify Windows/Firefox drivers or physical low-end frame times. No gameplay,
campaign data, art, schema or material appearance change is intended.
