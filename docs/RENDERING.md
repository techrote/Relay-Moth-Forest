# Rendering

## Scene and coordinate model

Relay Moth Forest renders a 640×360 logical scene. The playable world occupies the top 304 logical pixels; the lower strip is UI.

The runtime may render at a larger native framebuffer, but world/material calculations retain logical-world semantics.

## Frame order

The current ordering contract is:

1. static room-invariant colour + material background;
2. mutable background presentation (generated/authored decor, recruitable robots, completed objectives, gates and bridge-stage art);
3. SurfaceFX water;
4. fine GrassField;
5. ground/low sprites;
6. unified shadow/contact-AO mask;
7. physical background foliage;
8. globally bottom-Y-sorted ordinary/tinted HD world sprites;
9. physical foreground foliage;
10. tall foreground scenery and tree canopies;
11. guide/objective/top particles and semantic FX;
12. bloom, lighting, colour grading and post-processing.

Exact batching may combine compatible materials, but the ordering relationship must remain.

## Shared sprite material

\`sprite_material.js\` provides one lighting implementation for:

- static room decorations;
- live HD sprites;
- tinted HD sprites;
- clipped/tall foreground scenery.

Runtime sprite resources are coordinate-matched:

- colour;
- source-space normal;
- specular.

The height map remains an authoring/inspection resource rather than an additional full-sized GPU atlas.

### Normal transforms

Normals are authored in source sprite space.

When a sprite is flipped or rotated, the renderer transforms the sampled normal through the actual UV/world derivative basis. Mirroring the UV alone is not sufficient.

This v4.14 correction is important: transformed sprites must move their highlights with the geometry.

### Material disabled

When sprite bump/material lighting is disabled, the shader returns the source/tinted colour. It does not continue to darken sprites based on light position with a flat normal.

## Static material buffers and mutable presentation

Room-scale invariant scenery is efficiently baked into static colour/normal/specular textures. During static construction, the same placement calls write aligned material buffers, so the background shader uses source-derived material vectors rather than differentiating a resampled world-height image.

Stateful or frequently authored presentation is intentionally outside this cache. The mutable layer batches those HD sprites through a dedicated source-normal/specular shader with per-item tint strength, allowing the runtime to reproduce the Canvas2D source-atop tint contract without rebuilding the room textures.

Current mutable classes include generated and authored editor decor, unrecruited persistent robots, completed-objective visuals, gate state and Tin Stream bridge-stage presentation. Structural terrain remains in the static backing; a terrain edit may therefore still require an expensive room bake.

Rendered-pixel tests compare mutable tinted output against the equivalent static colour/normal/specular composition.

## Tree splits

Large trees are split into trunk/background and canopy/foreground resources.

Two historical representations exist:

- cropped lower trunk + canopy;
- full-canvas trunk with upper alpha removed + canopy.

Both are valid.

v4.14 derives child colour/material resources from the authoritative parent and validates exact visible reconstruction. Do not independently paint generated child normal/specular maps.

Tree trunks are drawn once. Canopies are the explicit foreground occluder.

## Depth ordering

Ordinary and tinted HD actors/scenery share one stable bottom-Y ordering. They are not sorted correctly in separate queues and then blindly painted one queue over the other.

Special explicit foreground layers remain outside that world sort where their role requires it.

## Foliage depth

Readable FoliageFX plants remain whole sprites.

The renderer does **not**:

- cut plant silhouettes around actors;
- paste lower foliage fragments across robot bodies;
- use face masks;
- use sliding actor-shaped clip contours.

When a plant transitions between background and foreground, both passes use complementary alpha so the combined plant opacity remains equal to the original source alpha.

See [SURFACE_AND_FOLIAGE.md](SURFACE_AND_FOLIAGE.md).

## Shadows and contact AO

Projected shadows and contact AO are accumulated into a unified low-resolution mask using MAX composition.

This avoids repeated multiplicative darkening when several shadow/contact sources overlap.

Foliage root contact remains fixed to the root instead of following upper-body deformation.

Water masking rejects inappropriate contact/shadow coverage where required.

## Lighting and LUTs

The renderer combines:

- ambient/completed-room light level;
- emissive lights;
- sprite material diffuse/specular;
- projected shadows/AO;
- bloom;
- exposure/brightness/contrast/gamma;
- temperature/tint;
- shadow lift/highlight gain;
- semantic LUT colour sources.

LUTs remain semantic palette authority. Shader constants shape response; they are not a substitute for project palette data.

## Post-processing

Bloom is bounded/separable and intentionally avoids treating every bright saturated pixel as a large glow source.

The renderer also supports vignette, saturation, exposure and fixed grain.

Foliage and ordinary physical sprite art are not additive/emissive simply because their source colours are bright.

## Rendering validation philosophy

A source-level assertion that “the right function exists” is not enough for a visual renderer.

v4.14 added:

- strict atlas/material alpha checks;
- exact split-tree reconstruction;
- full production shader census;
- real GLES rendered-pixel fixtures;
- mirrored/rotated material comparisons;
- static/live material comparisons;
- split-material seam checks;
- native Chromium room/editor integration.

See [TESTING.md](TESTING.md).
