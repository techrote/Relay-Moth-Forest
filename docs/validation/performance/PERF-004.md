# PERF-004 bounded terrain refresh

Issue: [#37](https://github.com/techrote/Relay-Moth-Forest/issues/37).
Accepted starting source: `5e6ea67c0ca8ba4d00b35d0e68ac4bb4d573680d`.

## Completed qualification and acceptance decision

[PR #38](https://github.com/techrote/Relay-Moth-Forest/pull/38) merged as
`f61a49d6ba09d17a4b7b04328a76056a89f84118`. Its tree is identical to qualified
candidate `afabaa080489c980157306667ea03817e1827c29`, tree
`ab3bbbd50cbf30366f10b66370d05c97cebcd7df`.
[Exact-head run 41590918373](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41590918373)
passed the full deterministic/GLES, native, performance-work/pixel and manifest
gates. The selected production policy remains `canvas2d-row-sync-v1`.

**The bounded-edit objective is complete; warmed full refreshes are slower.**
This measured tradeoff is accepted for the small-terrain-edit scope and tracked
separately in [PERF-005, #41](https://github.com/techrote/Relay-Moth-Forest/issues/41).
There is no claim that every static refresh or editor operation is faster.

Two design refinements remain explicit. Dependency-qualified changes preserve
the existing normal/specular textures instead of rerasterizing them; every byte
still equals a clean full build. Row synchronization also revises the original
default color baseline by at most one RGB quantization step, with exact alpha
and material bytes. Partial-versus-selected-full checks remain strictly exact.

### Native and work results

| Check | Qualified result |
| --- | --- |
| Complete native matrix | 112/112: 69 patch, 31 full/fallback, 6 no-op, 6 live |
| Whole color/normal/specular textures | 336 comparisons, zero differing bytes |
| Exterior where a prior image was captured | 243 comparisons across 81 cases, zero differences |
| Frozen independently synchronized full reference | 162 exact map comparisons across nine rooms, three sizes, warm/cold sources |
| Original default-context compatibility | All 54 comparisons pass the separate maximum-one-RGB-step bound; alpha/material exact |
| Post-timing water/path/full-control textures | 54/54 exact map comparisons |
| Representative water/path work | 30/25 floor cells, five row reads, one color upload, no full build or replacement |
| Water/path upload bytes | 10,508/5,772 at the original 1278×718 benchmark size |
| Retained room scratch after refresh | Zero |

The former 1280×720 bottom-cell failure is exact after retaining the native
target. Its output `(640,576,38,36)`, overlay-expanded guard
`(592,544,128,112)`, 15 floor inputs, three row reads and 5,472-byte color upload
remain unchanged. It uses one 3,686,400-byte transient color canvas. Full cases
without captured exterior fields are not reported as exterior comparisons.

### Paired performance, including the full-refresh cost

The accepted study used Chrome 155.0.8059.0, ANGLE and Mesa llvmpipe LLVM 20.1.2.
Each condition has three samples on the same runner. These are diagnostic
medians in milliseconds; the retained report includes every raw sample and
minimum/maximum range.

| Rate and event | Complete synchronous event, baseline → candidate | Combined static scopes | First post-event frame marker |
| --- | ---: | ---: | ---: |
| 1× water | 662.7 → 186.4 | 651.0 → 139.8 | 814.4 → 204.4 |
| 1× path | 663.0 → 159.6 | 652.7 → 121.3 | 745.2 → 172.0 |
| 4× water | 726.5 → 285.5 | 667.8 → 157.9 | 764.6 → 317.6 |
| 4× path | 1,112.7 → 266.8 | 1,072.7 → 142.4 | 1,144.1 → 285.0 |
| 1× warmed full control | 480.2 → 861.5 | 479.6 → 710.8 | 632.2 → 868.1 |
| 4× warmed full control | 801.4 → 1,330.5 | 799.1 → 1,196.5 | 840.7 → 1,355.7 |

Bounded complete-event medians improve 60.7–76.0%; their static scopes improve
76.4–86.7%. Full-control complete-event medians regress 79.4% and 66.0%, while
combined static scopes regress 48.2% and 49.7%. These costs remain part of the
acceptance record. The full control is warmed `quiet_nest`, not cold room entry.

`firstFrameAfterMs` and `frameGapMs` use markers after the JavaScript render
loop. They are not GPU-completion fences or display-scanout measurements.
Nested floor/synchronization timings are already inside build time. The study
does not establish hardware latency, confidence intervals or tail percentiles;
absolute timings from different runs or browser versions must not be paired.

### Cheaper outside-read experiment: not adopted

[Diagnostic #40](https://github.com/techrote/Relay-Moth-Forest/pull/40),
[run 41594561195](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41594561195),
changed no production source. On identical source/browser/host it redirected
only actual production row requests to `getImageData(-1,-1,1,1)`. The frozen
reference retained its in-bounds reads. All 112 native cases, 162 independent
frozen-reference map comparisons and 54 post-timing maps per variant passed.
Actual forwarded coordinates and incoming audit requests were recorded separately.

Full complete-event medians improved only 11.8%/12.7%, and small-edit results
were mixed, including a 1× path regression. Most apparent static-scope savings
reappeared in the final GL validation call: full `getError` medians increased
from 192.1 to 917.1 ms at 1× and 217.6 to 1,058.5 ms at 4×. After subtracting
static scopes and that call per record, only 0.7–1.1/2.9–3.5 ms remained.
Canvas cleanup was negligible. Deferred synchronization is the supported
interpretation, not a proven description of a particular GPU fence.

The [Canvas algorithm](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-getimagedata)
requires transparent outside pixels, not a flush. The inspected
[Gecko implementation](https://github.com/mozilla-firefox/firefox/blob/112b98932d21154eb1c2019faedbe336edac4ab6/dom/canvas/CanvasRenderingContext2D.cpp#L6887-L6905)
returns before snapshot access for a fully outside rectangle. The modest and
mixed total benefit does not justify adopting that implementation dependency.
The in-bounds policy and GL error checks remain. An in-bounds read is also not a
standards-defined whole-canvas GPU fence; native qualification establishes the
recorded implementation's behavior.

### Retained evidence and reproduction

The [paired report](PERF-004-qualified/performance-review.md),
[raw performance samples](PERF-004-qualified/performance.json),
[source record](PERF-004-qualified/source.json),
[compact native qualification](PERF-004-qualified/native-qualification.json),
[outside-read timing summary](PERF-004-qualified/row-oob-timing.json),
[independent diagnostic audit](PERF-004-qualified/row-oob-native.json) and
[provenance with artifact/payload hashes](PERF-004-qualified/provenance.json)
are retained together. The qualified artifact ZIP digest is
`1d99e37dfd420a1f270bffa79986b0952c7cefd09244aa342b590a1be2ed1132`.

Reproduce the report from the repository root:

```sh
python3 tools/summarize_perf004.py \
  docs/validation/performance/PERF-004-qualified/performance.json \
  --expect-baseline 5e6ea67c0ca8ba4d00b35d0e68ac4bb4d573680d \
  --expect-candidate afabaa080489c980157306667ea03817e1827c29 \
  --require-full-control --all-scenarios
```

The tool checks source identity, paired environments, work/capacity geometry,
synchronization, full controls and exact texture results before calculating
medians/ranges. Its self-test includes 13 synthetic positive cases and 119
negative controls. The stored comparison is specifically the original
pre-PERF-004 baseline versus qualified candidate; it is not silently reused as
a later authoring-only comparison whose baseline already contains this feature.

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

## Preserve scaled target dimensions, not just the transform

Native qualification rejected both translated small surfaces and untranslated
prefix surfaces. It also rejected a local surface at exact 2× scale. Keeping
the Canvas2D transform identical, or making the scale an integer, was
insufficient: the GPU projection also depends on actual target dimensions.

| Surface mode | Canvas | Transform | Explicit redraw |
| --- | --- | --- | --- |
| Original 640×360 logical and native dimensions | Local guarded color surface | Unit scale plus integer translation | Local guarded surface |
| Any other native dimensions, including integer 2× | One transient color surface at full native dimensions | Full renderer's origin and scale, without translation | Integer native clip around the guarded dirty region |

Both modes draw only the floor inputs needed by the guarded region, then replay
unchanged static overlays and footer in their established order. Native-target
mode applies its clip before scaling. It does not repaint all floor cells or
replace a complete GPU texture. Each surface is released immediately after its
region is uploaded; no room-sized CPU backing or multiroom canvas cache remains.

The original floor rectangles/circles, gradients, sprite helpers, material math
and drawing order remain intact. There is no replacement floor rasterizer,
native-resolution change or coordinate quantization. Full and partial color
builds share the explicit row-synchronization policy below. Their complete GPU
textures must match exactly; original default-backend compatibility is measured
separately because synchronization can change an RGB rounding step.

## Explicit color row synchronization

`canvas2d-row-sync-v1` requests `{alpha:false, willReadFrequently:false}` on the
first static color context and discards one `getImageData(0,0,1,1)` result after
each actually painted floor row. All floor commands retain their previous
coordinates, values and order. Material and atlas-source contexts retain their
existing policies. The common full/patch builder applies the same policy during
repair. Its identifier is captured separately from source-resource identity;
changing it forces a full rebuild without evicting unchanged art.

In the qualified browser this partitions color work at row boundaries. Diagnostic 22 reproduced
exact full-frame patch reconstruction for both the disjoint edit and independent
export-to-path edit. The old default renderer changed distant unchanged floor
pixels; the synchronized controls did not. The two renderers differed in a few
one-step RGB values. **This is an explicit pixel-baseline change, not a claim
of exact compatibility with the old default GPU batching.**

| Comparison | Requirement |
| --- | --- |
| Bounded update versus synchronized clean full build, every map and exterior | Exact equality; one corrupted bit fails |
| New full builder versus the unchanged frozen drawing program under independently applied row synchronization | Exact equality for all three maps, warm and independent cold sources |
| New full builder versus the original default-context frozen renderer | Report all differences; at most one RGB quantization step, with exact alpha, normal and specular bytes |

The latter comparisons cover all nine rooms at 640×360, 997×563 and 1280×720.
A failed compatibility bound remains fatal when collected to finish the matrix.
Existing GLES/material tests and all partial/full checks keep their previous
tolerances; the one-step allowance applies only to the explicitly declared
old-default-versus-new-policy comparison.

The flag is not a portable GPU guarantee. Chromium's
[readback implementation](https://chromium.googlesource.com/chromium/src/+/524531ca671a63eb3b9db3faea2b6fc06b69f092/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc)
distinguishes explicit false from an omitted flag in its repeated-readback
fallback heuristic. Native evidence records creation options and accepted
attributes. This explains the setting, not the exact driver mechanism.

One returned pixel does not make synchronization free: it can wait for all
pending clipped floor work. Counts, successful pixels, failed attempts and time
are reported. No returned pixel enters rendering, each synchronization request
asks for only one pixel, and no synchronization bitmap is retained. Physical
GPU readback volume is not measured by those API counts. The unchanged benchmark measures
this cost in the completed qualification above; diagnostic wall times alone
are not performance qualification.

### Resource policy and the revised capacity ceiling

The initial design imposed a universal 1 MiB color-scratch ceiling. Native tests
showed that smaller fractional and integer 2× targets can change legacy pixels.
This design **revises that ceiling for scaled rendering**. Issue #37 requires bounded
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
| Peak scaled native color capacity | 1,048,576 pixels / 4 MiB |
| Cumulative allocated color capacity per planned partial refresh | 2,097,152 pixels / 8 MiB |
| Retained room scratch after completion | Zero |

At 997×563, fractional color capacity is 2,245,244 bytes (about 2.141 MiB).
At the unchanged 1278×718 benchmark resolution it is 3,670,416 bytes (about
3.500 MiB), versus 11,011,248 bytes for the former simultaneous three-map full
build. These are nominal RGBA canvas capacities, not total process or driver
memory. At exact 1280×720, native color capacity is 3,686,400 bytes; integer
scale no longer selects a differently sized local target. Larger scaled targets
select the existing full renderer before any partial allocation. Original
640×360 rendering retains the local 1 MiB ceiling.

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
coordinate gradient-dither phase in local 640×360 surfaces. Every other native
size retains both the target dimensions and origin of the full renderer.

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
There is no application crop canvas or crop readback, and no zero-copy claim.
The separate one-pixel floor-row synchronization reads are accounted above.

Flip and both skip settings are restored on success and failure. Snapshot and
rendered revision advance only after all regions commit coherently. A partial
failure triggers synchronous full repair; failed repair invalidates the baseline
and background key for retry. Scratch is released on success, raster/subupload
failure and failed repair. Replacing source resources also discards and releases
derived tint/normal canvases.

## Diagnostics and timing

F10 exposes `renderer.staticRefresh`: mode/reason, changed cells, charged floor
inputs, output/redraw area, actual upload calls/bytes, canvas mode/geometry,
actual peak capacity, allocation attempts/successes/cumulative capacity, color
policy, synchronization attempts/reads/pixels/time and retained scratch. Noops
report zero work. Constructor attempts that throw are
distinct from successful allocations; failed uploads and repair remain visible.

`scratchPixels` is the largest allocated canvas area; `scratchBytes` is peak
simultaneous nominal capacity. Full builds retain three-map accounting.
`scratchAllocationPixels` sums successfully allocated canvas areas, including
all three full maps, and its byte count is four times that sum. `rasterPixels`
charges guarded redraw areas independently of allocation capacity.

`colorSyncAttempts` includes failed reads; `colorSyncReads`, `colorSyncPixels`
and `readbackPixels` count successful one-pixel color reads. `colorSyncMs`
includes time in failed reads. Failed patch and full-repair work both accumulate.
These counters describe requested/returned API pixels, not independently
observed physical GPU transfers.

The opt-in probe separates planning, allocation, floor, color synchronization, overlays/materials,
footer and uploads. To summarize the complete static event, sum nonoverlapping
parent phases: full `static.plan`, `static.build` and three uploads; or `static.plan`,
`static.patch.build` and color subupload. Do not double-count scratch/floor/overlay
children already included in the build parent. `static.full.color-sync` and
`static.patch.color-sync` are nested within floor/build; their time includes
deferred raster execution and is not an additive cost on top of those parents.

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

An appended `control-full-static` scenario measures a forced full static refresh
after the same warmed `quiet_nest` setup on both sources. It leaves all ten
original scenarios, their order, coordinates and timing boundaries unchanged.
The control checks one full build, all three uploads, 760 floor inputs, three
native canvases, 19 successful row reads and exact post-timing texture parity.
Candidate combined static time includes planning plus the build and three
uploads; the old full renderer has no planning phase. Nested synchronization
time remains nonadditive. This control measures the new policy's cost on a full
refresh; it does not measure cold room loading or claim hardware frame latency.

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
same-host performance comparison were still outstanding at that stage.

### GPU synchronization controls and the selected candidate

[Diagnostic 22](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41585433900)
tested explicit false, alpha, desynchronized, row-read and four-cell-read color
controls. Explicit false and desynchronized matched default pixels but retained
the error. Alpha changed 989 pixels with maximum difference 21 and retained it.
Both synchronization controls reconstructed the complete new frame exactly:

| Control / fixture | Old-to-new exterior differences | Patch reconstruction differences | Default versus synchronized old / new |
| --- | ---: | ---: | --- |
| Row / disjoint terrain | 0 | 0 | 2 bytes / 3 bytes, maximum 1 |
| Four-cell / disjoint terrain | 0 | 0 | 5 bytes / 2 bytes, maximum 1 |
| Row / export-to-path | 0 | 0 | 3 bytes / 0 bytes, maximum 1 |
| Four-cell / export-to-path | 0 | 0 | 6 bytes / 3 bytes, maximum 1 |

The independent export fixture ran in
[41585631400](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41585631400).
Sources remained stable and default-after-controls rendering was exact. The
observed browser version was `156.0.8078.0`, distinct from the installed
Playwright binary in dependency logs; the driver was ANGLE/Mesa llvmpipe.
These results support qualifying the row policy, with its smaller read count;
they do not replace the full matrix or original performance benchmark.

The matrix collects exact pixel failures, repairs each failed baseline separately
and continues, then fails if any mismatch was recorded. Structural/work/GL/source
failures and failed repairs still stop immediately. Negative controls run outside
collection. Repairs never count as successful bounded work. Artifacts retain
measured failures, separate repairs and the completed/partial matrix. Seventeen
focused control-flow cases and negative mutation controls verify this reporting.

### Integer 2× target qualification

[Candidate 23](https://github.com/techrote/Relay-Moth-Forest/actions/runs/41587933348)
completed the matrix: 111 of 112 cases passed. The only failure was the open
bottom-row cell at 1280×720. Its tight output was `(640,576,38,36)`; the local
canvas and guard were `(592,544,128,112)`, with 15 floor inputs and three row
reads. Color differed in 11 bytes across eight pixels, maximum one. Normal,
specular and every actual exterior byte were unchanged. The exact full repair
passed. This remains a failed native qualification.

Stage isolation showed zero floor-only and floor-plus-pattern differences.
Adding blockers introduced all 11 bytes; omitting sprites removed them.
Changing the local guard or quantizing sprite translations did not fix them.
Full-native target controls with the same 15 floor inputs matched exactly when
overlays were unclipped or enclosed by the larger diagnostic clip. Full-native
floor-only with the original guard also matched. The precise production
combination of bounded inputs, original overlay-enclosing guard and full-native
target subsequently passed the complete candidate-24 matrix reported above;
the diagnostic controls alone did not substitute for that qualification.

The correction therefore applies by dimensions, not room or sprite category:
only original 640×360 uses local targets. Other sizes use the existing native
clip path and unchanged output, redraw, floor-input and capacity ceilings. A
1920×1080 target exceeds the fixed 4 MiB partial capacity and falls back before
allocation; two 1280×720 regions fit the existing cumulative 8 MiB ceiling,
while three do not. No output padding, coordinate change or pixel tolerance is
introduced.

Candidate 23 separately passed all 162 selected-policy full-reference map
comparisons and all 54 warm/cold comparisons with the original default policy.
The latter differed by at most six color bytes in four pixels per comparison,
with maximum RGB difference one and exact alpha/material bytes.

Its independent same-host performance run passed all 36 water/path texture
checks. Static event medians were 1,370.2→206.1 ms and 1,068.7→188.2 ms at 1×
CPU throttling, and 1,626.6→245.7 ms and 1,139.6→207.8 ms at 4×, for water and
path respectively. These are preliminary measurements of the failed candidate,
not final-head acceptance. The unchanged benchmark remained at 1278×718 and was
repeated after the correction. The artifact is `13209452399`, SHA-256
`eb1b01a2919af1b679ec234e5cc07395eaa45600dd4b1bab0f9c064f827cc259`.

CI now preserves native failure evidence immediately before the independent
performance step, with source identity and a unique run/attempt artifact name.
The final complete artifact and every failure outcome remain required.

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
  full-grid floor envelopes, separate clip/canvas geometry, integer/fractional
  and anisotropic scales, complete primitive bounds, nonrecursive guards, unchanged work and
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

Large strokes, structural changes, fragmentation and scaled targets over the
fixed capacity ceiling intentionally rebuild. Overlay command replay and native
allocation/initialization still have cost. Linux software rendering does not
certify Windows/Firefox drivers, high-DPI performance or physical low-end frame
times. No gameplay, campaign, art, schema, wave or material-appearance change is
intended.
