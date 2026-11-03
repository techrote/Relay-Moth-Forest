# PERF-004 bounded static terrain and material refresh

Issue: [#37](https://github.com/techrote/Relay-Moth-Forest/issues/37).
Accepted starting source: `5e6ea67c0ca8ba4d00b35d0e68ac4bb4d573680d`.

## Problem and scope

PERF-003 removed the water-mask readback stall, but small editor terrain edits
still painted all 760 logical floor cells into three native-resolution canvases
and replaced all background textures. Its prior same-host editor-water sample
reported a 602.9 ms median in `static.build`. That historical number motivates
the work; it is not a matched PERF-004 before/after measurement.

Ground, path and water edits now use bounded static color patches when the final
authoritative room differs only in a small number of floor cells. Existing normal
and specular textures remain authoritative because those floor classifications
do not contribute to either material map.
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

## Material dependency proof

Issue #37 describes bounded color/normal/specular recomposition. The production
painter permits a more precise contract: an eligible terrain edit changes color
while preserving both material textures. All three complete textures must still
equal a clean full build byte for byte.

The proof follows the actual `StaticPainter.buildSurface` draw path:

| Drawing stage | Color dependency | Normal/specular dependency |
| --- | --- | --- |
| Sky and row-major `baseTile` calls | Floor classification, tile seed, microtile size and LUT values | None: `baseTile`, `px` and `dot` receive only the color context |
| `patternDecor` | Room pattern, exclusions, art and objective roles | Its `sprite` calls use those same unchanged static inputs |
| `drawBlockerSprites` | Border, walls, blocker styles, room seed and art | Its `sprite`/`spriteSubrect` calls use those same unchanged static inputs |
| `drawVegetationInterstitials` | Walls, blocker styles, exclusions, room seed and art | Its sprite calls use those same unchanged static inputs |
| `drawDecor` | Mounted lamps, objective-kind substitutions and art | Its sprite calls use those same unchanged static inputs |
| Footer | UI LUT and art | None: material contexts are detached before this stage |

Full builds start the normal and specular canvases transparent. Only `sprite` and
`spriteSubrect` write into them through `HDArtSheet.drawMap`/`drawMapSubrect`;
ground, path and water never do. Every input to those static sprite draws is
covered by the snapshot's dependency, resource, identity and dimension checks.
Thus changing only effective floor classifications leaves the material draw
commands and their inputs unchanged. The bounded painter keeps both material
contexts detached throughout the patch and allocates only a color canvas.

The renderer must already hold a complete, current three-texture baseline before
using this path. Missing or stale storage, changed material/art resources, LUTs,
walls or other static dependencies still require a full three-map rebuild.
Preservation adds no GPU layers or CPU backing and does not relax the whole-texture
oracle. It also avoids resampling unchanged material sprites into a different
Canvas2D destination, which native qualification found can alter individual bytes.

## Bounded composition

The full `StaticPainter.build` remains the clean reference and fallback.
`buildPatch` shares its composition primitives through `buildSurface`, including
the exact tile seeds, row-major floor order, sky, sorted blocker sprites,
vegetation interstitials, room patterns, mounted lamps and footer.

Each region creates one small color canvas.
The raster surface includes a 32-native-pixel guard around the output rectangle,
aligned outward and clipped to the native canvas. Only its interior is uploaded.
Its transform uses the full native scale and an integer native-pixel translation,
so a fractional display scale keeps the same raster phase. Nearby floor cells
are replayed in their original order. Static color overlays are replayed into the
clipped scratch surface to preserve sprite/glow blending with the changed floor.
No material sprite is drawn during a terrain patch. Footer sprites affect color
only, as they do in a full build.

Output bounds follow the changed floor's actual drawing envelope. No accepted
floor primitive extends left or above its owning tile. At microtile size 4, the
union of ground/path/water marks extends at most three logical pixels right and
two down; at sizes 8 and 16 it stays inside the tile. The native output minimum
is `floor(logical minimum * native scale)`, and its maximum is
`ceil(logical maximum * native scale)`, clipped to the surface. Floor rectangles
and circles are filled without strokes, shadows or filters. Outward floor/ceil
rounding covers pixel squares intersecting their drawing footprint, including
partially covered edge pixels; an additional native-pixel border would upload
unrelated pixels. The production primitive regression checks this envelope
across all 9,120 tile/type/microtile footprints, including the playable area's
edges.

The genuine logical overhang is retained. Later opaque neighboring microtiles
do not justify reducing damage to the owning tile: at fractional scales a pixel
can receive partial coverage from two separately drawn rectangles, leaving some
earlier stroke contribution between them. Actual path primitives cross the tile
bottom at these microtile seams. This implementation therefore removes only the
extra native output padding, without relying on an opaque-union occlusion claim.

Only these affected output rectangles are merged. Output coordinates need no
alignment: they crop pixels from an independently aligned raster. That raster
adds the 32-native-pixel guard and rounds outward to a sixteen-pixel grid before
clipping to the surface. Its floor-input range retains the symmetric
four-logical-pixel plus two-native-pixel halo, replaying every neighboring floor
mark that can reach the entire scratch. Other microtile sizes retain the full
renderer until independently qualified.

Raster alignment matters because Skia's gradient dither uses an
[8x8 table at device coordinates](https://skia.googlesource.com/skia/+/5fdfc51ef3e8/src/gpu/ganesh/SkGr.cpp),
and its [fragment coordinates use an upper-left origin](https://skia.googlesource.com/skia/+/89c0ddff982bf3383beeba6397d3236526fb4a76/src/sksl/README.md).
Preserving that phase matters for overlapping lamp glows: the unaligned native
rectangle `(170,90,28,28)` differed from the full color texture by one byte level
in 209 pixels, while normal/specular maps and exterior pixels matched exactly
([diagnostic run](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41563498272)).
An earlier candidate expanded that rectangle to `(160,80,48,48)`, preserving the
eight-pixel dither phase. The current implementation preserves the phase at the
guarded raster origin without expanding the upload to that grid. Material
sampling exposed a separate problem:
at `(312,264,32,32)`, two specular-alpha bytes differed by one level, while the
`(304,256,48,48)` diagnostic variant matched every color/normal/specular byte
([native comparison](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41564327204)).
The lower clip cut through a flipped sprite sampled from the large specular
atlas; extending only its horizontal bounds did not resolve the error.
Alignment alone was insufficient for a coalesced move: two pixels on the outermost
scratch column had three differing normal bytes
([boundary diagnostic](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41565413874)).
Moving scratch clipping away from the uploaded interior did not reliably fix
material sampling. In the
[guarded native run](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41566897343),
the border case with output `(304,256,48,48)` and raster `(272,224,112,112)`
differed by one level in seven specular-alpha bytes at native row 293, while color
and normals matched. A 16-pixel guard also differed in seven bytes, a 64-pixel
guard differed in five, and the unguarded 48x48 surface matched. These results
reject guard size as a general material correction. Retaining the already exact,
unchanged material textures removes that resampling from eligible terrain edits.

The [color-only candidate](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41568094642)
passed the 640x360 matrix. At 997x563, its first
water-to-ground edit at cell `(11,6)` exposed two one-level color differences at
native pixels `(289,187)` and `(266,178)`. Both are outside the changed floor's
drawing envelope; the earlier aligned upload `(256,128,64,64)` unnecessarily
replaced them. An initial tightening still retained two extra native pixels on
each output side. A subsequent path-to-ground edit at cell `(13,6)` differed in
one color byte at `(348,149)` across every aligned guard variant; the floor's
native top is approximately `150.133`, so row 149 cannot contain its drawing.
Removing that output padding preserves these original pixels while retaining
the complete logical overhang, raster alignment, guard and input replay:

| Native surface, cell `(11,6)` | Output `(x,y,width,height)` | Guarded raster `(x,y,width,height)` |
| --- | --- | --- |
| 640x360 | `(176,96,19,18)` | `(144,64,96,96)` |
| 997x563 | `(274,150,30,29)` | `(240,112,96,112)` |

At 997x563, cell `(13,6)` uses output `(324,150,30,29)` and raster
`(288,112,112,112)`. The two-native-pixel margin remains solely in the conservative
raster input range, not in the color upload.

All memory, pixel and work limits still account for the guarded bounds. The
complete all-three-texture native oracle and unchanged-exterior checks remain
exact; this change avoids writes outside the affected envelope and introduces
no comparison tolerance. Native qualification must still establish color
equality inside the tightened output; alignment and guard constants alone are
not proof.

Default planning limits are 16 changed cells, eight merged regions, at most 20%
of native output pixels and guarded raster pixels, 35% of logical floor raster
work, and 262,144 pixels in the largest scratch map. Overlapping guards are counted
separately, including duplicate raster work. Color scratch capacity is at most
1 MiB on the bounded path. Regions are processed sequentially and released
immediately; no native CPU backing or multiroom canvas cache is retained.

`GLRenderer.patchBackground` subuploads only color using the native output
rectangle and vertical orientation. WebGL2's explicit-size `TexImageSource`
overload crops directly from the guarded color canvas using unpack
skips; no application-side crop canvas or readback is introduced. This follows the
[WebGL2 DOM-source pixel-store contract](https://registry.khronos.org/webgl/specs/latest/2.0/#PIXEL_STORE_PARAM_UPLOAD_DOM).
With vertical flipping enabled, skipped rows count from the source bottom, as
implemented by Chromium's `TexImageParams::GetSourceRect`. All three unpack
settings are restored on success and failure. The renderer validates texture
storage, output/raster containment, dimensions and the existing complete material
baseline before the first write. A rendered
revision and snapshot advance only after the entire update succeeds. Any patch
failure triggers a synchronous full rebuild; a failed repair invalidates the
baseline and background key for retry. Scratch and failed full-build canvases are
released on both success and failure. Replacing an atlas/material source also
discards derived tint/normal tile caches.

Planner estimates count one upload and four bytes per output pixel for each
patch region, with four bytes per guarded scratch pixel. Full-build estimates
retain three uploads and twelve bytes per native pixel. Normal and specular GPU
storage remains allocated and unchanged during the color-only update.

## Diagnostics and timing

F10 runtime diagnostics include `renderer.staticRefresh`: mode/reason, changed
cells, floor cells rastered, output pixels, guarded raster pixels, upload calls/bytes, scratch capacity,
regions and retained scratch pixels. No-op refreshes report zero work. Upload
counters include attempted calls when a failure requires repair.

The opt-in probe separates `static.plan`, full/patch scratch allocation, floor
raster, static overlays, footer and uploads. Full builds also raster and upload
normal/specular maps; terrain patches perform only the color upload. The bounded
renderer performs no full-canvas readback and does not request transformed-normal
sources. Full material builds use the bounded source cache described below;
their pixel-transform and small-tile readback behavior is unchanged.

The performance harness now includes editor path painting as well as editor
water movement. Both must avoid `static.build`, raster fewer than 760 cells,
upload bounded color data, preserve both material textures and retain no scratch.
The existing PERF-003 rivet/editor-water assertions remain mandatory.

After each candidate water/path timing record and its first post-event frame are
complete, the harness disables the timing probe and separately compares all
three GPU textures against a full reference at the actual responsive native
resolution. It records that size and the exact pixel results in `staticParity`.
This check does not contribute to the measured event or frame interval; the next
sample follows the existing reset and settling sequence. A mismatch fails the
run and preserves pixel/region diagnostics beside the performance output.

PR CI checks out the accepted base and measures both source trees sequentially
on one host with identical scenarios, three samples and 1x/4x CPU throttling.
Absolute software-rendered milliseconds remain diagnostic rather than a flaky
universal latency gate. Raw results and source identities are retained in the
validation artifact; the final qualification record is linked from the PR.

## Executable acceptance

- `static_terrain_regression_415.js`: exact classification/diff behavior,
  same-count movement/history, immutable authority, all dependency/identity and
  work-budget fallbacks, malformed/stale snapshots and all-grid native halo
  coverage against actual production floor primitive footprints. Patch estimates
  count color only; full estimates retain all three maps.
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
authored room requests, verifies repeated-full source identity and bounded eviction,
and demonstrates the old FIFO failure with the same data.

Each newly created transformed source advances a generation counter, allowing
the source-cache regression to distinguish hits from recreated canvases. Terrain
patches keep material contexts detached, so they neither request transformed
normals nor advance this counter. Their material authority is the complete
existing GPU baseline, validated against static dependencies and resources.
No patch-time normal-cache generation repair is required. Full builds still
benefit from stable source identities, and cache eviction remains bounded for
authored rooms with larger working sets.

## Practical limits

Large strokes and edits to static overlay dependencies intentionally rebuild the
room. Replaying overlay draw commands still has CPU cost, although native raster
and texture-transfer work is bounded. Linux software-rendered evidence does not
certify Windows/Firefox drivers or physical low-end frame times. No gameplay,
campaign data, art, schema or material appearance change is intended.
