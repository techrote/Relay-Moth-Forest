# SurfaceFX and FoliageFX

Relay Moth Forest intentionally separates two kinds of vegetation and water rendering.

## SurfaceFX

`surfacefx.js` is a reusable raw-WebGL2 visual subsystem.

It consumes descriptors/masks and bounded interaction sources. It does not receive mutable story or collision authority.

### WaterField

Water authority begins with the map/Room water mask, with currently opened bridge cells excluded.

Quality tiers use derived shoreline fields:

| Quality | Base field width |
| ---: | ---: |
| 0 | legacy/fallback water |
| 1 | 128 |
| 2 | 224 |
| 3 | 320 |
| 4 | 416 |

Height follows the logical aspect ratio.

Current bounds:

- ripple hard cap: 12;
- bounded ripple lifetime/source arrays;
- no per-frame shoreline rebuild;
- refraction samples the already-resident scene texture;
- visual quality never changes gameplay walkability.

If WaterField fails or is disabled, the retained legacy water renderer is the fallback.

### Bounded water topology updates

`Game` owns the active logical mask canvas and its effective wet/dry tile snapshot.
Opened Tin Stream bridge cells are dry in this snapshot, matching `Room` collision
authority. Bridge progression commits the visual topology synchronously; editor
terrain updates use the existing coalesced invalidation and final transaction flush.
Same-count moves are detected by cell contents, not array length.

A revision-bound delta identifies changed logical rectangles. The legacy mask uses
bounded texture subuploads. WaterField conservatively projects those rectangles
to its quality resolution, reads only the affected mask pixels, and recomputes
shore distances in bounded crops. The encoded distance caps are 10 pixels at q1,
16 at q2, and 22 at q3/q4. Each changed cell expands by that cap for output and
by a second cap for source context, so removing the nearest shore still finds
all replacement shores capable of changing an encoded byte.

The production integer encoding is compared against a clean full rebuild. Texture
uploads cover only changed bytes. More than eight disjoint field regions, distance
work above 65% of the full field, ambiguous/stale revisions, source replacement,
room entry, quality changes, and fresh renderer recovery retain a full rebuild
path. Logical legacy deltas are capped at 32 rectangles.

The logical mask requests `{willReadFrequently:true}` on its **first** 2D context
creation. Requesting that hint only during a later read does not change the
existing backing store and caused large synchronous GPU readback stalls in the
recovered implementation. Timing reports retain separate mask-read and texture-
upload phases, plus full/bounded counters and actual work/upload sizes.

See [PERF-003 validation](validation/performance/PERF-003.md). Ordinary water
updates are bounded; structural editor terrain still legitimately rebuilds the
static room backing and is a separate remaining performance cost.

### Fine GrassField

GrassField is the low-level blade/detail layer.

It is separate from the large readable sprite foliage.

Current hard quality caps:

| Quality | Instance cap |
| ---: | ---: |
| 0 | 0 |
| 1 | 480 |
| 2 | 1500 |
| 3 | 3000 |
| 4 | 4600 |

Additional invariants:

- one instanced draw;
- deterministic generation from authored clumps;
- at most four push fields;
- coherent positional wind;
- roots outside the playable area are rejected;
- geometry/cache signatures include actual clump geometry, not only item count.

The v4.14 shader census caught and fixed a real optional GrassField compile failure. Fine grass must therefore remain covered by genuine GLSL compilation tests.

## FoliageFX

`foliagefx.js` owns readable physical foliage such as grass tufts, ferns, broad leaves, flowers, bushes and moss.

### Category model

The current metadata categories are:

- `GROUND_MOSS`;
- `SHORT_GRASS`;
- `FERN`;
- `BROAD_LEAF`;
- `FLOWER_CLUSTER`;
- `BUSH`.

Metadata controls root cutoff, bend, flutter, stiffness, damping, interaction response, shadow response and display scale.

Flower-heavy art is intentionally less interactive than flexible grass/fern art.

### Rooted deformation

Each instance has a fixed lower-centre/root point.

Rows at or below the category root cutoff have zero displacement. Upper rows receive progressively more wind/interaction response.

Wind is coherent in world space, not one unrelated sine oscillator per sprite.

### Interaction bounds

Hard bounds:

- physical foliage instances: 208;
- interaction sources: 8.

Actor interaction is visual only. It does not change collision.

### Whole-sprite depth rule

Earlier v4.04–v4.07 experiments used actor-local fragments and moving cut profiles. They were rejected after visible flicker and grass fragments appeared across robot faces.

The canonical design since v4.09 is **whole-sprite depth**.

A foreground relationship is conservative and directional, using the lower edge of the actor sprite as the depth origin. The relationship must hold for all overlapping relevant actor sources before the plant becomes foreground.

v4.14 preserves source opacity during the transition.

For source alpha `a` and foreground weight `f`:

```text
foreground alpha = a * f
background alpha = a * (1 - f) / (1 - a * f)
```

with a safe opaque endpoint.

The two passes therefore compose back to the original source alpha when no actor lies between them.

There are no face masks or sliced plant silhouettes.

### Spatial classification

Foliage instances are registered in spatial bins covering their actual bounds plus conservative deformation margin.

Candidate lookup is tested against brute-force overlap, including very wide fixtures, so large/multi-tile-looking plants do not disappear simply because their root lies outside a fixed query radius.

### Dynamic uploads

Room/quality changes rebuild static instance data.

Ordinary foreground-fade changes update only the bounded dirty flag span via in-place buffer updates rather than recreating the complete static instance buffer.

### Failure path

If FoliageFX fails:

- the subsystem disables locally;
- gameplay continues;
- VAO state is restored;
- the retained compatibility foliage renderer can be used.

The fallback renderer uses connected band geometry rather than separated rectangles that can expose horizontal cracks.

## Floater-FX

Floater-FX is a separate magical/experimental family.

It is not the physical grass system, is hidden by default, and uses explicit authoring rather than automatically borrowing physical grass clumps.
