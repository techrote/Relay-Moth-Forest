# Relay Moth Forest v4.01 — Implementation Record

## Scope implemented

Relay Moth Forest v4.01 converts the live v3.999 hero-grass path into a metadata-driven GPU FoliageFX layer while retaining the validated v3.999 gameplay, water, shadow, tree, LUT, map/story and launcher contracts.

## Major changes

### 1. Reusable `foliagefx.js`

Added the requested module family:

```text
FoliageRegistry
FoliageInstanceBuffer
WindField
InteractionField
RootedDeformation
FoliageMaterial
DepthClassifier
DebugView
FoliageFX
```

The implementation is a UMD-style standalone module so it can be reused by another raw-WebGL2 project without importing Relay Moth gameplay classes.

### 2. Metadata-driven physical foliage

`hd_remake_atlas.json` is now schema `relay-moth-hd-atlas/v4.01` and contains explicit `foliage_fx` metadata for 37 physical foliage/flower regions spanning all six required categories. Missing metadata is handled by safe category/default profiles inside FoliageFX.

No physical foliage behavior depends on sprite-name conditionals in `game.js`.

### 3. Root-locked GPU deformation

Visible physical foliage uses a static instanced strip mesh rather than whole-sprite CPU transforms. Root displacement is exactly zero below the per-region/category cutoff. Quality tiers progressively add bend fidelity, secondary wind, pseudo-normal shading, interaction budget and upper-body flutter.

### 4. Coherent wind + bounded interactions

The shader uses two coherent world-space wind bands plus a slow gust envelope and tiny deterministic variation. Actor response combines radial push and velocity drag. Each actor source carries two bounded decaying trail/recovery events, evaluated with per-category stiffness/damping in the vertex shader. Interaction source count is capped by quality and never exceeds eight.

### 5. Dedicated foliage shading

Physical foliage is source-alpha, non-additive and non-emissive. Bend pseudo-normal is combined with broad bump sampling for low-frequency dynamic diffuse/rim response and deliberately tiny specular response.

### 6. Unified root contact AO

Root footprints are rendered by an instanced contact mesh directly into the existing half-resolution MAX shadow mask. Contact shading stays at the root, scales from lower sprite width/metadata, and is discarded over WaterField water-mask pixels.

### 7. Actor/foliage depth ordering

Foliage has background and foreground instanced passes. A static foliage spatial grid, bounded actor candidates, root-Y / actor-bottom-Y classification, vertical-entry foreground promotion and hysteresis provide stable overlap behavior. Foreground trees/tall scenery still render after foreground foliage.

### 8. Graphics/UI and migration

`index.html` now contains a compact **Foliage FX** group for:

- Foliage animation (off = static physical foliage, not invisible foliage)
- Foliage quality 0–3
- wind strength
- wind speed
- interaction strength
- shading strength
- bend amount

Debug controls expose roots, interaction radii, wind freeze and category visualization. Floater-FX remains separate, hidden by default, independent of the SurfaceFX master toggle, and accepts only explicit `floater_clumps` authoring; physical grass clumps are never reused automatically.

The current graphics key is `relayMothGraphics400`; v3.999 values are migrated conservatively. The previous key is still written as a downgrade/inherited-regression compatibility mirror.

### 9. Runtime integration

The live order is:

```text
SurfaceFX fine GrassField
background FoliageFX
unified shadows/contact AO
actors
foreground FoliageFX
foreground trees/tall scenery
```

The old CPU hero-grass helpers remain as an explicit shader/module-failure fallback. Normal v4 rendering uses only the static GPU FoliageFX path; the CPU hero path is invoked only when FoliageFX is not ready, preserving a conservative visual fallback without making it normal-frame work.

### 10. Diagnostics and versioning

- application/server/version strings: 4.0
- current F10 diagnostic filename: `relay-moth-runtime-diagnostics-400.json`
- FoliageFX counters included in runtime diagnostics
- launcher remains `0Play.cmd`

## Explicitly preserved contracts

The implementation does not intentionally alter:

- 27 staged routes and objective flow;
- Tin Stream staged bridge authority/progression;
- WaterField waves, ripples, splashes and shoreline player interaction;
- water shadow rejection;
- unified shadow composition;
- deterministic player movement and keyboard priority;
- no world-mouse gameplay authority;
- follower fallback behavior;
- mini-robot completed-room behavior;
- wildlife behavior;
- tree split continuity / foreground occlusion;
- objective-marker visibility;
- LUT semantic routing and post controls;
- save progression compatibility;
- `0Play.cmd`.

## Performance design

No performance uplift is claimed without runtime profiling. The v4 implementation instead establishes explicit structural bounds:

- max 208 physical foliage instances at quality 3;
- max 8 interaction sources;
- 112-byte static packed instance records;
- buffer rebuild only on room/descriptor or quality change;
- no per-frame CPU update for every plant;
- no actor × all-plants CPU scan;
- no per-plant draw call;
- no per-instance texture;
- two instanced physical-foliage passes plus one instanced contact pass when applicable.

## Validation additions

New v4 tests cover root invariance, deformation hierarchy, deterministic generation, metadata defaults, hard caps, material semantics, coherent wind, interaction locality/recovery, bottom-Y depth ordering, vertical promotion, hysteresis, tree precedence, disable/failure isolation, UI/metadata integration and current visual contracts.

The optional `foliagefx_glsl_regression_400.py` extracts the exact production main/contact/debug shader sources and compile-links them in a surfaceless GLES3 context when EGL is available; it cleanly skips on systems without that validation facility.

See `VALIDATION_LOG_400.txt` for the executed validation matrix and environment notes.
