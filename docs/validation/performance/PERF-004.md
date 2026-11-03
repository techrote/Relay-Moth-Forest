# PERF-004 bounded terrain refresh

Issue: [#37](https://github.com/techrote/Relay-Moth-Forest/issues/37).
Accepted starting source: `5e6ea67c0ca8ba4d00b35d0e68ac4bb4d573680d`.

## Problem and contract

After PERF-003 removed the water-mask readback stall, small editor terrain
changes still repainted all 760 floor cells and replaced three native background
textures. The historical PERF-003 editor-water sample spent a median 602.9 ms
in `static.build`. That number motivates this work; it is not a matched
PERF-004 before/after measurement.

Small ground, path and water changes now recompose bounded color regions while
preserving the existing normal and specular textures. Every material-writing
dependency must be unchanged. The complete resulting color, normal and specular
GPU textures must still equal a clean full build byte for byte, including pixels
outside the uploaded regions.

The editor synchronously rebinds room/collision authority and refreshes terrain,
water and foliage before returning to gameplay. Same-count movement, painting,
clearing, undo/redo, cancellation and final pointerup/save flushes use the same
authoritative comparison. Brush names do not establish eligibility.

## Preserve fractional target dimensions, not just the transform

Native qualification rejected both translated small surfaces and untranslated
prefix surfaces. Keeping the Canvas2D transform identical was insufficient:
the GPU projection also depends on the actual target dimensions.

| Surface mode | Canvas | Transform | Explicit redraw |
| --- | --- | --- | --- |
| Both native scales are integers | Local guarded color surface | Native scale plus integer translation | Local guarded surface |
| Either scale is fractional | One transient color surface at full native dimensions | Full renderer's origin and scale, without translation | Integer native clip around the guarded dirty region |

Both modes draw only the floor inputs needed by the guarded region, then replay
unchanged static overlays and footer in their established order. Fractional
mode applies its clip before scaling. It does not repaint all floor cells or
replace a complete GPU texture. Each surface is released immediately after its
region is uploaded; no room-sized CPU backing or multiroom canvas cache remains.

The original full renderer, floor rectangles/circles, gradients, sprite helpers,
material math and drawing order remain intact. There is no replacement floor
rasterizer, native-resolution change, coordinate quantization or pixel tolerance.

### Resource policy and the revised capacity ceiling

The initial design imposed a universal 1 MiB color-scratch ceiling. Native tests
showed that smaller fractional targets can change legacy pixels. This design
**revises that ceiling for fractional rendering**. Issue #37 requires bounded
scratch and forbids retaining three full native CPU backings; it does not
prescribe that initial numeric ceiling.

| Limit | Partial-path policy |
| --- | --- |
| Changed authoritative cells | At most 16 |
| Output regions | At most 8 |
| Summed output area | At most 20% of native pixels |
| Summed guarded redraw area | At most 20%, counting overlaps separately |
| Floor inputs | At most 35% of 760 cells, counting repeated inputs separately |
| Peak local color capacity | 262,144 pixels / 1 MiB |
| Peak fractional native color capacity | 1,048,576 pixels / 4 MiB |
| Cumulative allocated color capacity per planned partial refresh | 2,097,152 pixels / 8 MiB |
| Retained room scratch after completion | Zero |

At 997×563, fractional color capacity is 2,245,244 bytes (about 2.141 MiB).
At the unchanged 1278×718 benchmark resolution it is 3,670,416 bytes (about
3.500 MiB), versus 11,011,248 bytes for the former simultaneous three-map full
build. These are nominal RGBA canvas capacities, not total process or driver
memory. Larger fractional targets select the existing full renderer before any
partial allocation. Integer scales retain the local 1 MiB ceiling.

**A small clip does not make allocation free.** Creating a native-sized canvas
may initialize or clear its entire backing. The 20% limit describes explicit
guarded redraw area, not all browser/GPU memory writes. Actual capacity,
allocation attempts/count, cumulative capacity and scratch timing are separate
diagnostics. Sequential release bounds peak capacity; the cumulative limit
also bounds repeated native allocations across disjoint regions. The existing
full fallback can exceed partial-path limits, as it did before this optimization.

## Authority and fallback

`static_terrain.js` is a data-only UMD module. `capture(room, context)` copies
effective floor classifications and canonical dependencies into an immutable
snapshot. Only snapshots created by the module are trusted. `plan(previous,
next)` returns `full`, `patch` or `noop`, a reason, changed cells, output regions,
guarded redraw bounds, canvas geometry and floor-input ranges.

Dependencies include room identity/index/pattern, walls, border, blocker styles,
trees, mounted lamps, decor/pattern exclusions, bridge topology, microtile size
and objective kinds used by lamp substitution. Context includes native size,
source/renderer/art/atlas/material identities and exact serialized LUT/atlas
metadata. In-place edits are detected even if a name, length or identity remains
unchanged.

Room entry, resizing, source replacement, missing/stale rendered baselines,
dependency changes, unsupported microtiles and excessive work use the full
renderer. Wall authority catches the interstitial-vegetation threshold: crossing
three-to-four shared blockers can change a whole row pair. Painting over a
blocker/tree also falls back. Partial microtile sizes are 4, 8 and 16; other
supported sizes retain the full painter.

Geometry and budgets determine eligibility without room-name, benchmark-position
or sprite-category exceptions. The earlier fractional mounted-sprite and prefix
fallbacks are removed. Unchanged lamps, patterns and foliage must pass the native
oracle with the reference target geometry.

PERF-002 generated/authored decor, recruitable robots, completed objectives,
gates and bridge-stage art remain live presentation. Their ordinary changes do
not rebake the static backing. Bridge topology is static; completion stage is
not. Unrelated actors and progression retain their existing ownership.

## Why materials remain unchanged

Issue #37 initially proposed recomposing all three maps. The production painter
provides a stronger invariant: floor classifications paint only color, while
every material-writing input is covered by the static snapshot.

| Full drawing stage | Color dependency | Normal/specular dependency |
| --- | --- | --- |
| Sky and row-major floor primitives | Classification, seed, microtile size, LUT | None; floor rectangles/circles receive only the color context |
| Patterns | Pattern, exclusions, art, objective roles | Same unchanged static inputs |
| Sorted blockers | Border, walls, styles, room seed, art | Same unchanged static inputs |
| Interstitial vegetation | Walls, styles, exclusions, seed | Same unchanged static inputs |
| Mounted decor | Lamps, objective-kind substitutions, art | Same unchanged static inputs |
| Footer | UI LUT and art | None; material contexts are detached first |

Full builds initialize material maps transparently. Only `sprite` and
`spriteSubrect` write into them through `drawMap`/`drawMapSubrect`. A floor-only
delta leaves their entire draw commands and sources unchanged. Partial builds
keep material contexts detached, create one color canvas and request no
transformed-normal sources.

A complete current three-texture GPU baseline is required. Missing/stale storage
or changed material/art/LUT/static dependencies still rebuild all three maps.
Preservation adds no GPU layer and does not relax whole-texture equality. It
avoids resampling unchanged material sprites into another destination, which
earlier native tests showed could alter individual bytes.

## Output, redraw and canvas geometry

Outputs follow the real floor envelope. No accepted primitive extends left or
above its tile. At microtile 4, the union of floor types reaches at most three
logical pixels right and two down; sizes 8 and 16 stay inside the tile. Native
minima use `floor`, maxima use `ceil`, and results are clipped to the frame.
Only touching outputs merge. No extra native output border replaces unrelated
pixels.

The genuine logical overhang remains: separately drawn opaque rectangles can
both partially cover one fractional-scale pixel, leaving earlier marks visible.
The production regression evaluates all 9,120 tile/type/microtile footprints,
including playable-area edges.

Each output starts with a 32-native-pixel guard. Before an eligible patch is
allocated, `StaticPainter.staticOverlayBounds` replays the actual pattern,
blocker, interstitial and mounted-decor placement methods through a data-only
receiver. It collects complete transformed sprite/subrect quads, glow/dot
circles and rounded pixel rectangles. The existing footer body is shared through
`drawFooter`, so imported art sizes also contribute the actual footer sprite
bounds. The collector does not allocate a canvas, touch image sources or caches,
look up LUT colors, request materials or modify the runtime painter.

`plan(previous, next, {overlayBounds})` expands the guard to contain every such
primitive that can touch the tight output, including the existing two-native-
pixel conservative projection margin. It does not trim to nontransparent texels
or recursively pull in primitives touching only the enlarged guard. These
exterior pixels are not uploaded. Bounds round outward to the same 16-pixel
grid and clip to the frame. Floor ranges are then recalculated with the existing
four-logical-pixel plus two-native-pixel input halo; all output, redraw, floor
and capacity budgets apply to the enlarged geometry before allocation.

The footer's unfiltered background gradient, full-width stripe, panel and
stroke retain their bounded clip. They are analytical backgrounds rather than
sampled image quads. Footer sprites are always collected; their default sizes
sit below the terrain, but imported metadata can extend them into an output.
Whole-texture native tests include the footer boundary and would reject a
clipping difference in those analytical backgrounds too.

Collection caps emitted primitives at 4,096 and prebounds room sets, lamp/
objective arrays and copied role lists to the 760-cell room size. Invalid or
excessive geometry selects the full renderer. The collected data is transient;
ordinary noops, dependency fallbacks and forced builds skip this additional
replay. No room-name or sprite-category fallback substitutes for geometry.

Floor inputs replay in original row-major order. Alignment preserves device-
coordinate gradient-dither phase in local integer-scale surfaces. Fractional
surfaces retain both the target dimensions and origin of the full renderer.

| Region fields | Meaning |
| --- | --- |
| `x`, `y`, `width`, `height` | Tight output uploaded into the existing texture |
| `rasterX`, `rasterY`, `rasterWidth`, `rasterHeight` | Guarded, explicitly redrawn native area |
| `tx0`, `ty0`, `tx1`, `ty1` | Floor inputs covering that area and its halo |
| `canvasMode` | `local` or `native-clip` |
| `canvasX`, `canvasY`, `canvasWidth`, `canvasHeight` | Actual temporary canvas origin and capacity |

`GLRenderer.patchBackground` validates dimensions, mode and all containment
before querying or changing GL state. The nine-argument WebGL2 DOM-source
subupload crops directly from the actual canvas. With vertical flipping enabled,
skip rows count from its bottom. Skips derive from canvas geometry, not the
smaller redraw clip, following the
[WebGL2 DOM-source pixel-store contract](https://registry.khronos.org/webgl/specs/latest/2.0/#PIXEL_STORE_PARAM_UPLOAD_DOM).
There is no application crop canvas or readback and no zero-copy claim.

Flip and both skip settings are restored on success and failure. Snapshot and
rendered revision advance only after all regions commit coherently. A partial
failure triggers synchronous full repair; failed repair invalidates the baseline
and background key for retry. Scratch is released on success, raster/subupload
failure and failed repair. Replacing source resources also discards and releases
derived tint/normal canvases.

## Diagnostics and timing

F10 exposes `renderer.staticRefresh`: mode/reason, changed cells, charged floor
inputs, output/redraw area, actual upload calls/bytes, canvas mode/geometry,
actual peak capacity, allocation attempts/successes/cumulative capacity and
retained scratch. Noops report zero work. Constructor attempts that throw are
distinct from successful allocations; failed uploads and repair remain visible.

`scratchPixels` is the largest allocated canvas area; `scratchBytes` is peak
simultaneous nominal capacity. Full builds retain three-map accounting.
`scratchAllocationPixels` sums successfully allocated canvas areas, including
all three full maps, and its byte count is four times that sum. `rasterPixels`
charges guarded redraw areas independently of allocation capacity.

The opt-in probe separates planning, allocation, floor, overlays/materials,
footer and uploads. To summarize the complete static event, sum nonoverlapping
parent phases: full `static.build` plus three uploads; or `static.plan`,
`static.patch.build` and color subupload. Do not double-count scratch/floor/overlay
children already included in the build parent.

The original visible-water move and path-paint actions keep their coordinates,
viewport and responsive native resolution. They must avoid a full build and
texture replacement, obey redraw/floor/capacity limits, preserve materials and
retain no scratch. Existing PERF-003 bounded-water gates remain mandatory.

After each event and its first post-event frame, timing is disabled and all three
GPU textures are compared against a full reference at the actual native size.
`staticParity` records the exact results. This oracle is outside the measured
event/frame interval. A mismatch fails validation and retains raster diagnostics.
PR CI measures accepted base then candidate on one host with identical scenarios,
three samples and 1x/4x throttling. Software-rendered milliseconds are evidence,
not a universal latency gate or physical-device guarantee.

## Native investigation record

These failed candidates informed the design; none is successful qualification.

| Evidence | Finding |
| --- | --- |
| [Shared/cold sources](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41560857705) | Recreated normal-source canvases could sample differently despite equal source bytes. Full compatibility uses independent cold current/legacy builds; patch/full parity uses the same loaded sources. |
| [Gradient alignment](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41563498272) | An unaligned local origin changed glow dithering; align guards without expanding output. |
| [Material guards](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41566897343) | Larger guards did not reliably fix unchanged material resampling; preserve material authority instead. |
| [Tight outputs](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41568094642) | Upload padding replaced unrelated pixels; retain only the real logical overhang. |
| [Mounted stage](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41571669664) | A required color byte diverged at mounted decor; global translation rounding did not fix it. |
| [Local floor divergence](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41572947659) | A fractional local patch differed in 19 floor bytes before overlays. |
| [Origin-only divergence](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41574605048) | An untranslated prefix still changed a mounted-sprite byte during the original same-count move. |
| [Origin plus mounted fallback](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41576567695) | The genuine foliage-overlap edit exposed two required floor bytes even with identical global origin. |
| [Native target with fixed guard](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41579124347) | Floor pixels matched, but clipping the nest swirl introduced two required color bytes. |

In the origin-plus-mounted-fallback case, tile `(8,6)` changed ground to path at 997×563. Output
`(199,150,30,29)` came from a 272×224 prefix. Canvas pixels `(209,168)` and
`(210,168)` had green 87 instead of 86; both changed in the reference. Material
and exterior bytes matched. Their five contributors were identical: sky, an
opaque path microtile, a translucent stripe, the next opaque microtile and its
top stripe. No circle, neighbor or sprite contributed. The common logical seam
`y=108` maps to native `168.9`.

Skia's
[Ganesh target-state code](https://skia.googlesource.com/skia/+/refs/heads/main/src/gpu/ganesh/gl/GrGLProgram.cpp)
derives device-to-clip adjustment from actual target dimensions. Its
[compiler helper](https://skia.googlesource.com/skia/+/c5fb1f796056d9d6f7f72328d92f915fc6ca678d/src/sksl/SkSLCompiler.h)
uses floating-point `2/width` and `2/height`. Equal Canvas2D coordinates on
different targets therefore do not establish equal GPU projection arithmetic.
Target-dependent coverage rounding is supported by these sources and the
failures; it is not a captured trace of Chromium's exact shader.

[Diagnostic run 41578077693](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41578077693)
holds bounded floor inputs fixed while testing native targets with no clip,
guard clip and output clip, and tests the small target with every floor cell.
Both the full-native target without a clip and the full-native target with the
guard clip matched the full floor-only crop exactly. Replaying all 760 cells on the small target still
produced the same two green-byte differences, separating target size from
omitted noncontributing commands. A clip tight to the output introduced 12 byte
differences in four edge pixels, with maximum difference 5; the guard remains
necessary. This is the prerequisite evidence for the native-clip design.
Resolving this diagnostic does not replace the complete original matrix.

### Complete sprite geometry matters independently of target size

With the full native target, the adjacent repeated-edit case at 997×563 still
differed at top-origin pixels `(502,285)` and `(504,285)`: two color bytes,
maximum difference one, with unchanged materials and exterior. Both pixels
really changed from the previous terrain. Floor-only matched; adding the nest
pattern introduced both differences. The guard `(432,240,144,96)` clipped the
swirl's complete destination bounds, approximately
`[431.609,238.005,565.391,353.645]`.

[Diagnostic run 41580112159](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41580112159)
separated clipping from omitted floor commands. All controls used the same
997×563 target and unchanged transforms and compared the complete output crop.

| Diagnostic control | Floor calls | Color differences |
| --- | ---: | ---: |
| Pattern or all overlays, no clip | 35 | 0 |
| Pattern or all overlays, clip enclosing the complete swirl | 35 | 0 |
| Pattern or all overlays, guarded floor then unclipped overlays | 35 | 0 |
| Pattern, all floor cells, original guard | 760 | 2 bytes / 2 pixels / maximum 1 |

The enclosing diagnostic clip was `(429,236,147,120)`, derived from real sprite
geometry with a two-native-pixel margin. Production does not hard-code that
case: it collects every relevant overlay and reuses the existing alignment and
work limits. Including the nearby glow yields a guarded redraw of 39,936 pixels
and 100 floor cells for that edit, within the unchanged limits. The original
water/path benchmark guards do not grow.

Skia's [rectangular clip optimization](https://skia.googlesource.com/skia/+/d2b9e48baf1697760afc1dc8ea3ad40110b8cacc/src/gpu/ganesh/SurfaceDrawContext.cpp)
can fold a clip into a textured quad and recompute local texture coordinates.
This source and the discriminating controls support the clipping explanation;
they are not a captured trace of this Chromium draw. The complete native
matrix, including a new unchanged 1280×720 matrix, remains the production gate.

### A distant edit can change the default full renderer

Candidate 19 passed the clipped-sprite case, then failed the disjoint edit at
997×563 in [run 41581460412](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41581460412).
Edits at cells `(34,3)` and `(3,13)` produced exact local crops, but a fresh full
render changed three color bytes in two untouched ground pixels: native
top-origin `(133,139)` and `(443,139)`. Both lay outside the two output regions.
Their local draw commands and contributing geometry were unchanged. The actual
bounded update preserved every exterior byte; normal and specular were exact.

[Diagnostic 20](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41582840848)
reconstructed the previous terrain from its immutable snapshot and compared
complete old/new/repeated frames. Both floor-only and complete compositions
reproduced the same three exterior differences. Repeated old and new frames,
including old after new, were exact. Every control reused the same 52 observed
tint sources with zero cache misses, replacement or generation change. This
separates a reproducible nonlocal full-floor effect from source-cache churn or
omitted local contributors; it does not identify a captured GPU mechanism.

[Diagnostic 21](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41584129614)
requested `willReadFrequently:true` only for each color destination. Material
and source contexts retained their original options. The hinted old frame plus
both actual production patch crops equaled the hinted new full frame exactly,
including its exterior. However, the hinted full renderer changed the image
substantially compared with the unchanged default full renderer:

| New-terrain comparison | Different bytes | Different pixels | Maximum channel difference |
| --- | ---: | ---: | ---: |
| Floor-only default versus hinted color | 978,857 | 367,262 / 65.43% | 28 |
| Complete default versus hinted color | 1,040,772 | 396,170 / 70.58% | 46 |

For complete composition, RGBA maxima were `[30,46,34,0]`. Repeated hinted
frames were stable, all tint identities remained unchanged, and a final default
render matched its original control exactly. The hint is an API optimization
request, not a portable backend guarantee. These are comparisons with the
current default full painter, not a newly executed frozen-legacy comparison.
The color-hint experiment is **rejected as a production solution** because of
its visual compatibility cost; it is not a passing PERF-004 qualification.

Diagnostic 21 tested commit `54d3a79edeeaec3888542c62afd5d470198cf201`, tree
`1758fada3034c0ef229dcc16906d306985bb8ff4`. Artifact `13207556395` has verified
SHA-256 `a9d7fee5dcc3279727be8d7eeef0321cd44d8b1ab7b2c0ca1512097c280e734d`.
No production context setting, original coordinates, exact-zero tolerance or
performance gate changed in these diagnostics. Native correctness and the
same-host performance comparison remain outstanding.

## Stable transformed-normal sources

The previous 64-entry FIFO cache could churn its own room working set: Dawn
requires 66 distinct transforms. The cache now promotes hits and retains at most
96 entries, releasing evicted backing immediately. Every shipped static room
set fits. Normal-vector math, source pixels, tint-cache limits and draw order
are unchanged.

The production-method regression replays 2,958 authored full/repeat requests,
checks source RGBA/alpha and repeated identity, verifies bounded eviction and
rejects the old FIFO behavior. A generation counter exposes new normal sources.
Terrain patches keep material contexts detached and do not advance it.

## Executable acceptance and limits

- Planner: immutable authority, same-count/history, dependencies/identities,
  full-grid floor envelopes, separate clip/canvas geometry, single-axis fractional
  scales, complete primitive bounds, nonrecursive guards, unchanged work and
  peak/cumulative budgets, and malformed/stale inputs.
- Runtime: real Game/StaticPainter/GLRenderer methods; full/partial command
  traces; independent allocation, clip, crop and material observations; unpack
  restoration, partial failure, full repair and cleanup.
- Native browser: every color/normal/specular byte at 640×360, 997×563 and 1280×720;
  independent accepted full-build compatibility across nine rooms; exterior
  invariance, overlays/materials/footer, history/final flush/cancel/coalescing,
  every fallback, water and live ownership.
- Existing deterministic/GLES suites, unchanged 1x/4x benchmark actions and
  before/after tracked-source manifests remain mandatory on the final head.

Local Chromium is blocked by this environment's socket policy. Local
deterministic/GLES results do not replace hosted browser qualification. A missing
or failed native result is not a rendered pass.

Large strokes, structural changes, fragmentation and fractional targets over the
fixed capacity ceiling intentionally rebuild. Overlay command replay and native
allocation/initialization still have cost. Linux software rendering does not
certify Windows/Firefox drivers, high-DPI performance or physical low-end frame
times. No gameplay, campaign, art, schema, wave or material-appearance change is
intended.
