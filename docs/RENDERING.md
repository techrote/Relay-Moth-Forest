# Rendering

## Scene and coordinate model

Relay Moth Forest renders a 640×360 logical scene. The playable world occupies the top 304 logical pixels; the lower strip is UI.

The runtime may render at a larger native framebuffer, but world/material calculations retain logical-world semantics.

## Frame order

The current ordering contract is:

1. static room colour + material background;
2. SurfaceFX water;
3. fine GrassField;
4. ground/low sprites;
5. unified shadow/contact-AO mask;
6. physical background foliage;
7. globally bottom-Y-sorted ordinary/tinted HD world sprites;
8. physical foreground foliage;
9. tall foreground scenery and tree canopies;
10. guide/objective/top particles and semantic FX;
11. bloom, lighting, colour grading and post-processing.

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

## Static material buffers

Most room decoration is still efficiently baked into a static colour texture.

During static construction, the same placement calls write aligned world normal/specular buffers. The static material shader therefore shades the composited room using source-derived material vectors instead of differentiating a resampled world-height texture.

This keeps static/live/clipped versions of the same art visually consistent without turning every background object into a separate live draw.

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
