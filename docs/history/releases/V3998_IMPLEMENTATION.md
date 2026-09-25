# Relay Moth Forest v3.998 — grass visibility implementation

## Problem
The first three supplied screenshots showed no readable grass effect despite authored grass
clumps and a functioning instanced GrassField code path. Previous passes increased GPU blade
size/density but still relied on fine geometry surviving a dark, high-frequency background.

## Solution
v3.998 keeps the GPU GrassField and adds an intentionally readable `HeroGrass` presentation
layer. It is not a replacement simulation: both layers use the same `Room.grassClumps` data.

### Renderer changes
- `SpriteAtlas`: added procedural alpha masks `grassBlade` and `grassTuft`.
- `GLRenderer`: added `groundNormal` / `groundGlow` arrays and `addGround()`.
- Ground batches flush after GPU `renderGrass()` and before projected shadows and live actors.
- This adds no per-tuft draw calls; hero tufts are one ordinary batched sprite submission.

### Game changes
- Added `Game.renderHeroGrass(now)`.
- Deterministic placement from authored clump seed/radius/density.
- Coherent wind sway using the existing grass wind settings.
- Bounded by quality tier: 110 / 220 / 380 / 520 hero tufts maximum.
- Added `grassHeroStrength` control, default 1.10.
- Brightened GPU grass material LUT sample points as a secondary visibility improvement.
- F10 diagnostics report `{ heroGrass: { rendered, authoredClumps } }`.

### Persistence
Graphics settings now write `relayMothGraphics3998` and migrate from 3.995.5 and older keys.
Values still equal to prior default grass settings are promoted; deliberate custom values remain.

### Launcher
`run_relay_moth_pretty_graphics.cmd` was renamed to `-Play.cmd`.

## Validation
The new `grass_visibility_regression_3998.py` mirrors the default q3 count formula and requires
>=280 hero tufts in each of Quiet Nest, Lantern Lane and Tin Stream. The full inherited movement,
input, NPC, jitter, fault, transition-memory, SurfaceFX, ambient-AI, bridge and visual-behavior
suite also remains passing.
