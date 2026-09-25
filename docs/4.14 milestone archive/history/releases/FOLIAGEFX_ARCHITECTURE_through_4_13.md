# FoliageFX Architecture — Relay Moth Forest v4.02

## Purpose

`foliagefx.js` is a reusable, presentation-only WebGL2 subsystem for rooted sprite foliage. It turns authored atlas foliage/clumps into deterministic static GPU instances, deforms only the non-root portion in coherent wind, shades the bend without emissive/glitter effects, reacts to a hard-bounded set of actors, and renders on either side of actors without owning gameplay state.

The subsystem is deliberately separate from `SurfaceFX.GrassField`:

- **GrassField**: fine, inexpensive ground-scale grass/material detail.
- **FoliageFX**: readable sprite foliage — moss, grass tufts, ferns, broad leaves, flowers, and bushes.
- **Floater-FX**: retained experimental pink/purple magical vegetation-like effect; hidden by default, independently toggleable, and not physical foliage. It reads only explicit map `floater_clumps`; v4 ships with no automatic Floater placement.

## Ownership

```text
GLRenderer
├── core scene / lighting / unified shadow / post
├── SurfaceFX
│   ├── WaterField
│   └── GrassField
├── FoliageFX
│   ├── FoliageRegistry
│   ├── FoliageInstanceBuffer
│   ├── WindField
│   ├── InteractionField
│   ├── RootedDeformation
│   ├── FoliageMaterial
│   ├── DepthClassifier
│   └── DebugView
├── sprite batches
└── semantic fullscreen FX
```

FoliageFX consumes visual descriptors only. It never owns collision, `Room.move`, pathfinding, objectives, room completion, bridge progression, or save authority.

## Metadata authority

`hd_remake_atlas.json` contains optional `foliage_fx` metadata for physical foliage regions. The runtime supports these categories:

```text
GROUND_MOSS
SHORT_GRASS
FERN
BROAD_LEAF
FLOWER_CLUSTER
BUSH
```

Each category has safe defaults for:

- `root_cutoff`
- `bend_scale`
- `flutter_scale`
- `stiffness`
- `damping`
- `interaction_scale`
- `shadow_scale`
- `bend_exponent`

Per-region metadata overrides category defaults. Maps continue to own placement/clump data; they do not name shader implementations.

## Static instance model

A foliage instance occupies 28 `float32` values / **112 bytes**. Packed data contains only static GPU/depth-classification inputs: root/size, atlas UV rectangle, deterministic phase/category, root cutoff, bend/flutter/recovery parameters, material/contact parameters, deterministic variation, depth bias, lower opaque width and auxiliary flags.

The instance buffer is rebuilt only when:

- the room/foliage descriptor changes; or
- the foliage quality tier changes.

There is no per-frame CPU plant simulation and no per-instance texture allocation.

### Hard bounds

- quality tiers: **0–3**
- hard instance ceiling: **208** physical foliage instances
- hard interaction-source ceiling: **8**
- interaction budgets by quality: 0 / 4 / 6 / 8
- static actor/foliage spatial grid cell: **40 logical px**

## Rooted deformation

Physical plants are not rigidly translated quads. A five-strip mesh provides six vertical sample rows. Deformation is weighted from the root upward.

Core invariant:

```text
t <= root_cutoff  =>  displacement = 0 exactly
```

Above the cutoff, the normalized height is smooth-stepped and exponentiated. Quality 1/2 quantize this into progressively richer band responses; quality 3 uses the smooth weight directly. The base/root therefore remains on the exact same logical world coordinate under wind and actor interaction.

Typical root locks are 30–45% depending on category. The intended visual hierarchy remains:

```text
root/base      0%
lower body     very little
middle body    partial
upper body     full response
```

## Coherent wind

Wind is sampled in logical world space rather than assigning independent sine oscillators to plants.

The production vertex shader combines:

- primary coherent wave, wavelength **216 logical px**;
- secondary coherent wave/gust, wavelength **94 logical px**;
- a slow spatial/temporal gust envelope;
- very small deterministic per-instance variation.

These wavelengths sit inside the v4 design ranges and make nearby plants visibly share motion. The default ordinary tip displacement is tuned around a few logical pixels; category bend scale and the user bend/wind controls modulate it.

Quality 3 adds low-energy upper-body flutter. Roots never receive flutter.

## Actor interaction

`InteractionField` accepts a small prioritized actor descriptor list. The game currently supplies the player, up to three important followers, and on high quality selected nearby mini robots/larger wildlife, then the subsystem applies its hard quality cap.

Each source carries:

```text
position
velocity
radius
strength
actor half-size
foreground-bias state
```

The vertex shader combines:

1. radial push away from the actor; and
2. velocity-aligned wake/drag along recent actor movement.

This produces directional sweep instead of symmetric pulsing. Each actor track also retains exactly two small recovery events. Their fixed trail positions, ages and strengths are uploaded with that actor source; the vertex shader applies an exponential decay rate derived from the foliage instance stiffness/damping. This gives visible return-to-rest without any per-plant CPU recovery state or unbounded trail history.

## Depth classification

Foliage is rendered in two instanced passes:

- background foliage before actors;
- foreground foliage after actors.

`DepthClassifier` maintains a static spatial grid of foliage roots and queries only cells around bounded actor sources. Normal lateral classification compares `foliage.rootY` with `actor.bottomY`. Predominantly vertical entry can promote overlapping foliage into the foreground, with a short hysteresis hold to prevent rapid layer flipping.

The production vertex shader receives the bounded source/bias array and clips instances out of the inappropriate pass. Foreground tree/tall-scenery occluders are rendered after foreground foliage, preserving tree precedence.

## Material and shading

Physical foliage uses standard source-alpha compositing:

```text
blend equation: FUNC_ADD
blend function: SRC_ALPHA, ONE_MINUS_SRC_ALPHA
emissive: 0
```

The fragment shader samples the source atlas and stable bump source, combines that broad bump normal with a bend pseudo-normal, then applies:

- high ambient/base retention;
- moderate diffuse response;
- very-low specular response;
- restrained rim response;
- no additive glow.

Bump gradients are intentionally broad/low-frequency to avoid the moving granular shimmer seen in earlier experimental sprite materials.

## Root contact AO / shadows

Foliage root contact is an instanced soft ellipse derived from the root position, lower opaque width, sprite height and metadata `shadow_scale`. It does not move with upper deformation.

Contact AO is drawn into the existing half-resolution **MAX** shadow mask. It therefore shares the unified one-composite shadow path rather than darkening repeatedly in a separate layer. The contact shader samples the authoritative water mask and discards contact shading over water.

## Render order

```text
floor / ground
static low decor
SurfaceFX fine GrassField
background FoliageFX
unified shadow mask + foliage contact AO
actors
foreground FoliageFX
foreground tree/tall-scenery occluders
top particles / objectives / guide FX
```

## Animation-off semantics and fault isolation

The **Foliage animation** control does not erase authored physical plants. When it is off, the renderer still draws the static source-alpha foliage/contact footprint but submits quality 0 deformation, zero wind and zero interaction sources. Quality 0 likewise keeps static foliage.

Construction, shader compilation/linking, and runtime foliage draws are locally guarded. On a FoliageFX failure:

- the subsystem sets `ready=false` and records an error;
- future foliage calls become no-ops;
- player input/movement is not cleared or aborted;
- collision/pathfinding/story/save state is untouched;
- SurfaceFX/WaterField and the rest of the renderer continue independently;
- Relay Moth can fall back to its retained v3.999 CPU hero-grass presentation on subsequent frames if the FoliageFX renderer is unavailable.

## Diagnostics

F10 runtime diagnostics expose:

```text
foliageFX.enabled
foliageFX.quality
foliageFX.instances
foliageFX.backgroundCount
foliageFX.foregroundCount
foliageFX.interactionSourceCount
foliageFX.categoryCounts
foliageFX.instanceBytes
foliageFX.rebuilds
foliageFX.drawCalls
foliageFX.error
```

The v4 diagnostics download filename is `relay-moth-runtime-diagnostics-411.json`.

## Validation

Dedicated contracts are implemented in:

- `foliagefx_regression_400.js`
- `foliagefx_depth_regression_400.js`
- `foliagefx_metadata_regression_400.py`
- `foliagefx_glsl_regression_400.py` — exact GLSL ES compile/link when surfaceless EGL is available
- `visual_behavior_regression_400.py`

`self_test.py` runs these alongside inherited SurfaceFX, NPC, migration, grass/shadow, fault, route, atlas and visual contracts.
