# Relay Moth Forest v4.03 — Sprite Order, Clipping, Tree Seam & Lighting Audit

## Scope

Audit of the v4.01 presentation pipeline after the FoliageFX expansion, concentrating on moving foliage scale, alpha/compositing order, foreground/background clipping, tree split continuity, and sprite-local bump lighting. Gameplay, collision, AI, story authority, WaterField, LUT routing and the unified shadow mask were treated as regression boundaries.

## Findings and corrections

### 1. Large-tree trunks were submitted twice — corrected

**Finding:** `renderTreesBack()` submitted each split trunk to the ordinary HD world batch, then `renderForegroundScenery()` submitted the same trunk again to the foreground batch before the canopy. This made the lower trunk unconditionally cover actors and introduced avoidable second-pass alpha/lighting differences.

**Correction:** each trunk is now submitted **exactly once** to the ordinary HD world batch. That batch is stable-sorted by visual bottom-Y, so trunk/actor occlusion follows conventional 2D depth ordering. Only the canopy remains forced foreground.

### 2. Dynamic HD actor/scenery order was insertion-order rather than depth-order — corrected

**Finding:** ordinary HD sprites were rendered in subsystem call order (objectives → mini robots → wildlife → followers, etc.), not world Y order. Overlapping characters/scenery could therefore clip incorrectly even when their root positions clearly implied the opposite ordering.

**Correction:** HD world quads and HD-tinted world quads are now stable-sorted by the maximum Y of each complete quad before GPU upload. Foreground HD scenery is sorted similarly. The sort is stable for equal-depth sprites.

### 3. GPU foliage instances had deterministic content but not depth order — corrected

**Finding:** FoliageFX instance generation was deterministic, but primitive order followed clump/generation order rather than root Y. Source-alpha edges on overlapping plants could therefore composite in a visually arbitrary order.

**Correction:** generated physical foliage instances are deterministically sorted by `rootY`, then X/name as stable tie-breakers, before packing/upload. Instance indices are reassigned after sorting.

### 4. Tall wall-blocker foreground clipping double-drew the upper sprite — corrected

**Finding:** tall authored wall sprites were painted in full into the static background, then the upper ~52% was drawn again as foreground scenery. The foreground copy used the HD bump-lighting path while the underlying static copy used Canvas tinting. This produced both redundant compositing and a possible horizontal lighting discontinuity at the clipping boundary.

**Correction:** eligible explicit tall wall blockers are now split into complementary source regions. The static background receives only the lower region. The exact upper region is sent to a dedicated **flat HD foreground shader** using the same tint mix as the static painter. There is no source-region overlap or omission.

The previous 72-item foreground limit was also removed. The heaviest current rooms contain only about one hundred eligible tall wall blockers, so the complete set remains trivial for a single batched draw.

Border/fallback blocker sprites that do not have an authored dynamic foreground counterpart remain full static sprites and are not split.

### 5. Tree split formats were audited separately — preserved correctly

The project intentionally contains two split representations:

- **Original trees:** cropped canopy + cropped lower trunk; the two source heights meet exactly.
- **Remixed v3.91 trees:** cropped canopy + full-size trunk canvas whose upper section is alpha-masked; the two layers intentionally overlap in canvas coordinates.

Treating the remixed trees as cropped trunks would create a seam. v4.03 preserves both formats and validates them independently. All ten tree families reconstruct their source art from the current trunk/canopy pair within the existing pixel-difference tolerance, and split components use the same world scale as their parent.

### 6. Transparent atlas gutters could influence bump normals — corrected

**Finding:** HD and foliage shaders estimated normals by sampling neighboring bump texels without considering whether the corresponding color texel was transparent. Near sprite boundaries and split-asset edges, transparent atlas gutters could therefore appear as abrupt height changes, creating false rim highlights/darkening and emphasizing seams.

**Correction:** neighboring bump heights are now accepted only where the corresponding color sample is non-transparent. Transparent neighbors collapse to the center height before the gradient is calculated. This is applied to both ordinary HD sprite lighting and FoliageFX lighting.

### 7. Fallback banded grass could expose tiny horizontal cracks — corrected

**Finding:** the compatibility `addHDRootedGrass()` path deforms separate horizontal source bands. Under large sway, sub-pixel rasterization can expose a hairline between adjacent bands.

**Correction:** adjacent bands now overlap by a very small source-relative epsilon. Root anchoring and the compatibility-only nature of this path are unchanged.

### 8. Moving foliage scale was too conservative after v4.01 — increased

Category-aware display scaling is now metadata-backed:

| Category | Width | Height |
| --- | ---: | ---: |
| Ground moss | 1.06× | 1.08× |
| Short grass | 1.14× | 1.34× |
| Fern | 1.10× | 1.26× |
| Broad leaf | 1.08× | 1.18× |
| Bush | 1.07× | 1.12× |
| Flower cluster | 1.00× | 1.00× |

This increases visual stature without restoring the excessive interaction/stretch envelope removed in v4.01. Fine GrassField blades are independently increased to 1.24× height / 1.10× width.

## Render-order contract after the audit

```text
static ground / lower clipped blockers
WaterField
fine GrassField
low ground sprites
background FoliageFX
unified MAX shadow/contact mask
stable-Y-sorted ordinary world sprites + tree trunks
stable-Y-sorted HD-tinted world sprites
world glows
foreground grass / foreground FoliageFX
flat upper blocker clips
foreground tree canopies / tall HD occluders
top particles / objective marker / guide FX
post/bloom/light composition as before
```

## Validation added

`render_order_seam_regression_402.py` checks:

- stable quad Y sorting is active on the correct batches;
- no tree trunk is re-submitted to foreground;
- all split tree families reconstruct their source and preserve scale contracts;
- both tree split representations are present and handled;
- static/foreground blocker clipping is complementary and uncapped;
- transparent-neighbor bump rejection is present in HD and foliage shaders;
- foliage instance root-Y ordering is deterministic;
- moving grass scale increases are category-aware and flowers remain 1.0×;
- fallback band overlap is present.

`render_pipeline_glsl_regression_402.py` extracts the exact production HD, flat-foreground, and HD-tint GLSL programs from `game.js` and compile-links them under surfaceless GLES3 when available.

## Remaining limitation

This execution environment cannot initialize Chromium's headless GPU/ANGLE display, so an automated browser screenshot could not be produced here. The exact production shaders do compile/link under the available surfaceless OpenGL ES 3.2 Mesa context, and the source/asset/render-order regressions pass. A final Windows hardware-browser visual pass is still recommended for subjective tuning of the larger grass scale.
