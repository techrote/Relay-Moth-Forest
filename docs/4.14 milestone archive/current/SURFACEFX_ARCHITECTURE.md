# Relay Moth Forest 3.995.2 — SurfaceFX Architecture

## Purpose

3.995 introduces the first production-shaped version of the planned 4.0 `SurfaceFX` layer while deliberately leaving the validated 3.99 gameplay architecture intact. `surfacefx.js` is a reusable raw-WebGL2 subsystem: it consumes masks, visual descriptors, semantic colours, time, bounded interaction events, and quality settings. It does **not** know about story objectives, collision, bridge progression, saves, or follower pathfinding.

## Ownership and data flow

```text
relay_moth_maps.json / StoryState
        |
        | visual adapters only
        v
Game.buildWaterMask() -------------------> SurfaceFX.WaterField
  room.water - bridgeOpen cells             |
                                             +-- derived shoreline field
                                             +-- analytical wave normal
                                             +-- bounded ripple/foam sources
                                             +-- LUT material

Game.buildGrassSurfaceDescriptor() ------> SurfaceFX.GrassField
  7–9 deterministic sparse clumps           |
  excludes walls/water/path/bridge/object    +-- deterministic instance buffer
                                             +-- coherent wind
                                             +-- <=4 push fields
                                             +-- LUT material
```

The adapters are one-way. SurfaceFX never receives a mutable `Room` object and cannot modify navigation state.

## Renderer integration

Current scene order:

1. native-resolution static background;
2. WaterField, or legacy 3.99 water fallback;
3. sparse instanced GrassField;
4. projected blocker/follower shadows and contact AO;
5. live sprite/HD material batches and additive glows;
6. bloom/light/post composite;
7. semantic shader FX;
8. top sprites/particles;
9. objective marker;
10. guide/star shader.

Grass intentionally renders before shadow/AO so environmental shadows can darken it while live characters remain above both layers.

## WaterField

### Source authority

The input canvas is built by `Game.buildWaterMask()`. It contains every authoritative exposed water cell except bridge cells currently reported open by `Room.bridgeOpen()`. Tin Stream therefore retains exactly the 3.99 gameplay relationship.

### Derived shoreline field

WaterField downsamples the source mask and computes a bounded two-pass chamfer distance transform only when its source signature or quality changes.

| Quality | Field size at 640×360 | Use |
| ---: | ---: | --- |
| 0 | none | legacy 3.99 water shader |
| 1 | 96×54 | low-cost SurfaceFX water |
| 2 | 160×90 | default |
| 3 | 256×144 | highest shoreline fidelity |

RGBA packing is currently:

- R: binary water mask;
- G: normalized interior distance from dry boundary;
- B: complementary edge proximity;
- A: 1.

The field is uploaded only after rebuild, not every frame.

### Waves and material

The fragment shader uses a fixed analytical spectrum. Quality 1 evaluates four stable directional bands, quality 2 adds two shorter bands, and quality 3 adds two additional high-frequency bands. A finite-difference normal is reconstructed from the combined height field.

Final material colour is supplied semantically from the existing `fx_water` LUT at three indices: base, foam, and highlight. Shader constants shape response but do not select the project palette.

### Ripples and foam

`WaterField.addRipple(x, y, opts)` is a visual event API. Sources carry position, lifetime, radius, amplitude, and foam weight. They expire automatically. The hard shader/source limit is 8 and the graphics setting can lower the active budget.

Current Relay Moth emitters:

- Space pulse: broad moderate ripple;
- Tin Stream bridge-segment completion: larger foam-bearing construction ripple.

The water field does not notify gameplay systems and cannot complete objectives or alter collision.

### Fallback behavior

The original 3.99 `waterProg` remains compiled in `GLRenderer`. It is used when:

- `SurfaceFX master` is disabled;
- `waterQuality == 0`;
- `surfacefx.js` is missing;
- WaterField shader creation or rendering is disabled after an error.

Thus SurfaceFX OFF is intentionally close to the 3.99 visual/runtime path rather than a blank-water failure mode.

## GrassField

### Scope

3.995 intentionally does **not** carpet the forest. Each room derives at most 4–5 small clumps near authored path edges. Candidate cells exclude:

- blockers/walls;
- water;
- paths themselves;
- border cells;
- staged bridge cells;
- story-objective cells.

No new map schema is required for this bridge pass. A later 4.0 authoring pass can add explicit visual density masks without changing collision authority.

### Instancing

Grass is one WebGL2 instanced draw. Each instance stores:

- base X/Y;
- height/width;
- wind phase;
- LUT tint interpolation factor;
- sway coefficient.

Generation is deterministic from clump seeds and settings. The hard cap is 1200 instances, with lower quality tiers using smaller caps.

| Quality | Hard per-room cap |
| ---: | ---: |
| 0 | 0 |
| 1 | 320 |
| 2 | 760 |
| 3 | 1200 |

### Motion and interaction

Wind is a coherent low-frequency field derived from world position plus time, not independent per-blade sine jitter. The vertex shader accepts at most four push fields. Relay Moth currently sends the guide/player and up to three closest persistent followers. Push affects only blade vertices.

### Material

Base/tip/highlight colours come from existing semantic LUTs (`far_forest` and `tree_lights`). Grass does not hard-code theme colours.

## Resource and failure model

SurfaceFX owns its WebGL programs, textures and buffers. No textures/buffers are allocated per animation frame. Water source arrays and grass instance arrays are bounded. SurfaceFX diagnostics expose:

- readiness and recent errors;
- WaterField quality, field resolution, bytes, rebuilds, ripple occupancy/cap;
- GrassField instance count/cap, candidate/cull count, bytes, rebuilds and descriptor signature.

Shader creation is isolated: WaterField and GrassField can fail independently. Water falls back to legacy 3.99; grass simply disables.

## Settings persistence

3.995 introduces `relayMothGraphics3995`. Loading order is:

1. `relayMothGraphics3995`;
2. `relayMothGraphics399`;
3. older graphics keys already supported by 3.99.

Missing SurfaceFX fields are filled from current defaults. Story progress deliberately continues using the historical compatible StoryState key; 3.995 does not risk orphaning existing save data.

## Non-negotiable gameplay boundaries retained

- direct keyboard/gamepad player movement;
- no world mouse control;
- deterministic swept collision;
- critical player update isolated from optional actors/effects;
- follower no-route recovery preserved;
- mini robots/wildlife remain non-colliding low-tick ambience/hints;
- 27 staged routes and Tin Stream progression remain authoritative;
- objective marker/top-layer order retained;
- no large circular burst effects from mini robots/wildlife.


## 3.995.2 material-visibility refinements

WaterField now optionally samples the already-resident static scene texture for bounded
normal-driven refraction. Additional uniforms independently control normal strength, octave
detail, highlights, edge response and refraction. This still remains a visual pass: the
water mask is generated exclusively from Room water minus opened bridge cells.

GrassField remains sparse but is intentionally more readable. The descriptor derives roughly
7–9 clumps, quality caps are 320 / 760 / 1200 instances, and blade geometry is larger with
stronger base-tip-highlight separation. It is still one instanced draw and never modifies the
Room grid.
