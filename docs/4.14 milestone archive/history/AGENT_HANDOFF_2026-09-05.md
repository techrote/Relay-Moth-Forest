# Executive Handoff

## Product identity

Relay Moth Forest is a calm, friendly exploration game built around guiding a luminous relay-moth flock through a mechanical woodland and helping the forest remember its morning song. The project has consistently prioritised a child-friendly, zero-pressure tone: objectives complete by proximity, failure is not punitive, rooms can be revisited, and the final Morning Garden is explicitly free play.

The technical project has evolved from a simpler storybook/pixel-art implementation into a **native-resolution WebGL2 graphical testbed** while preserving externally editable story, map, sprite, LUT, and effect data.

## Current baseline

The latest complete archive is **Pretty Graphics Edition 3.99**. It is explicitly a fidelity/NPC-systems testbed on the path to 4.0, not a final renderer architecture.

Key current facts:

- Fixed logical world: **640×360**, gameplay area 640×304 plus 56 px lower HUD; fixed camera.
- Navigation/collision cell: **16 px**; visual floor microtile: **4 px**.
- Nine authored rooms; 27 validated staged objective/exit route segments.
- **1,926** sprite-backed wall/blocker cells in generated 3.99 maps.
- **162** live split trees, of which the current self-test reports **108 use original painted tree sprites**.
- **13** collectible moths plus 2 starters = **15 possible relay moths**.
- **67** mini robots after Pip and **127** wildlife actors across authored rooms.
- 361 runtime atlas regions with coordinate-matched softened bump atlas.
- WebGL2 only; Python 3 localhost server; no npm/CDN runtime dependency.

## Latest user-requested 3.99 fixes — status

| Requirement | Current status |
| --- | --- |
| Follower no-route recovery: short clear step, then two randomized clear retries | Implemented and regression-tested |
| Fix mini-robot pathfinding faults | Implemented by changing mini robots to non-colliding low-tick waypoint actors; no BFS |
| Shadows must not sit on top of characters | Implemented; shadows/AO render before live characters |
| Spacebar energy burst needs lighting + particles | Implemented: `fx_pulse` LUT, fullscreen shader burst, bounded particles, transient emissive light |
| Soften bump/height lighting shimmer and noise | Implemented through prefiltered bump atlas + wider/lower-energy normal/specular response |
| Mini robots / wildlife must not make circle energy bursts | Current runtime keeps them to sprite animation/small spark ambience; no circle-burst call is emitted from their update loops |
| Mini robots +50% / wildlife +100% and many more wildlife | Implemented in authored density and render scale |
| Objective-marker sprite cannot also be decoration in that room | Implemented by filtering current objective-role sprites from static decor vocabulary |
| Animate character sprites incl. mini robots, moths, wildlife/gnomes | Implemented: frame animation for robots/wildlife; relay moths use procedural wing-beat deformation/orbit animation |
| Add mushroom pixies and cats | Implemented |
| More swarming/interaction between wildlife | Implemented in lightweight species interactions; see living-forest spec |

## Non-negotiable regression boundaries

1. **Do not reintroduce complex player movement correction.** Current movement is intentionally direct, deterministic, and simple.
2. **Do not restore world mouse control by accident.** Mouse remains usable for DOM editors/menus, but world movement/pulse/gather/wheel control was deliberately removed.
3. **Decorative actors must never be able to break held player input.** Player movement is a critical isolated update; optional subsystems fault independently.
4. **Collision/gameplay authority remains external and separate from rendering.** Surface or shader systems must never become hidden gameplay truth.
5. **Keep story routes valid.** Organic decoration may not cut objectives, gates, the Tin Stream staged bridge, or spawn corridors.
6. **LUT semantics remain first-class.** Rendering improvements must continue to be recolourable through semantic LUT channels rather than hard-coded art-direction colours.
7. **Keep expensive live work bounded.** Current renderer deliberately caps lights, shader FX, particles, split canopies, and other high-overdraw systems.
8. **Preserve the child-friendly interaction model and readable objectives.** Visual sophistication must not make navigation or objectives harder to parse.

## Next phase

The strongest already-established 4.0 direction is a reusable raw-WebGL2 `SurfaceFX` subsystem:

```text
SurfaceFX
├── WaterField
│   ├── spectral / octave normal generation
│   ├── shoreline SDF
│   ├── interaction ripples
│   ├── foam sources
│   └── LUT material
└── GrassField
    ├── density map
    ├── instanced blades
    ├── wind field
    ├── interaction push fields
    ├── LOD / culling
    └── LUT material
```

For Relay Moth specifically, water should cover **all authoritative water** and evolve the current lightweight masked water pass. Grass should begin only in **small, sparse clumps**. Use lightweight spectral concepts rather than committing to a full FFT ocean. The subsystem should be reusable in other WebGL games and should not require Three.js at runtime.


---

# Current Truth and Invariants

## Authority order for future agents

When documents disagree, use this priority:

1. **Latest explicit product requirement** from the Moth Forest development conversation.
2. **Shipping 3.99 runtime code + generated 3.99 data + passing current regression tests.**
3. Focused 3.99 diagnostics such as `NPC_PATHFINDING_399.txt`, `GRAPHICS_399.txt`, `SELFTEST.txt`, and the current external `BUMP_LIGHTING_399.txt`.
4. General README/architecture/editor prose.
5. Historical 3.91–3.98 notes, which are useful for intent but are not current behavior.

Do not “fix” the runtime to match stale prose without first deciding whether the prose or the code is obsolete.

## Current executable constants

| Setting | Current value |
| --- | ---: |
| Logical viewport | 640×360 |
| Gameplay height / HUD height | 304 / 56 |
| Grid | 40×19 |
| Gameplay tile/collision cell | 16 px |
| Visual floor microtile | 4 px |
| Player collision radius | 2.40 px |
| Wall collision edge inset | 4.10 px; tree interior inset 2.65 px |
| Player speed | 72 logical px/s |
| Starting moths | 2 |
| HD atlas default world scale | 0.18 |
| Frame cap range | 15–240 FPS; default 60 |
| Live light shader cap | 16 |
| Live shadow blocker collection cap | 48 wall/tree casters plus followers |
| Shader FX upload cap | 16 active; JS list bounded to 18 |
| Particle update retained cap | 300 |
| Large split trees | 18 per room in current generated maps |

## Exact graphics defaults from shipping `game.js`

```json
{
  "maxFPS": 60,
  "bloom": true,
  "bloomIntensity": 0.28,
  "bloomThreshold": 0.74,
  "saturation": 1.05,
  "gradeMix": 0.03,
  "vignette": 0.065,
  "grain": 0.0006,
  "exposure": 1.0,
  "lighting": true,
  "ambientInitial": 0.68,
  "ambientComplete": 0.94,
  "forceCompleteLight": false,
  "emissive": 1.0,
  "lightRadius": 1.78,
  "shadows": true,
  "shadowStrength": 0.22,
  "shadowLength": 0.94,
  "shadowSoftness": 1.05,
  "ao": true,
  "aoStrength": 0.18,
  "bump": true,
  "bumpStrength": 1.15,
  "specular": 0.28,
  "waterFX": true,
  "waterStrength": 0.76,
  "magicFX": true,
  "fxIntensity": 0.84,
  "portalFX": true,
  "mothOrbitSpeed": 1.0,
  "mothOrbitDistance": 1.0,
  "mothChaos": 0.55
}
```

These values override contradictory prose defaults. In particular, shipping bump strength is **1.15**, not 1.30/1.35.

## Authoritative external data

| File | Authority |
| --- | --- |
| `relay_moth_maps.json` | collision/navigation grid, paths, water, placements, blockers, trees, mini-robot groups, wildlife groups, bridge geometry |
| `relay_moth_story.json` | room order, story text, objective types/labels, door linkage |
| `relay_moth_sprites.json` | semantic/token sprite silhouettes used by the small runtime atlas |
| `relay_moth_pixel_luts.json` | semantic 256-colour LUTs and eight independently routed channels |
| `relay_moth_effects.json` | reusable effect presets, shader kind routing, effect LUT element/index/lifetime/params |
| `hd_remake_atlas.json` | HD colour atlas, bump atlas binding, regions, roles, scale/tint metadata |
| `sprite_sheet_manifest.json` | authoring sheet coordinates |

## Current map content totals

| Metric | Current generated 3.99 total |
| --- | --- |
| Rooms | 9 |
| Staged objective/exit routes | 27 |
| Wall/blocker cells | 1,926 |
| Water cells | 172 |
| Path cells | 538 |
| Story objectives | 19 |
| Split large trees | 162 |
| Collectible moths | 13 |
| Mini robots | 67 |
| Woodland creatures | 127 |


## Hard behavioral invariants

### Player movement
- Keyboard/gamepad are the only gameplay movement authorities.
- Keyboard owns the movement vector while any movement key is held; gamepad noise is not summed into WASD.
- Diagonals are normalized.
- Requested displacement is swept in ≤0.42 px substeps.
- Try true diagonal first, then stable axis slide if blocked.
- No acceleration, candidate scoring, tangent-probe side jumps, per-frame snap recovery, or decorative subsystem correction.

### Optional systems
- A follower/creature/firefly/particle/FX exception must not clear the keyboard set or abort the player critical update.
- Repeating optional faults back off rather than throwing every frame.

### Rendering vs gameplay
- 4 px ground detail is visual only. Navigation stays 16 px.
- Large-tree root/trunk cell is authoritative collision; canopy is visual foreground occlusion.
- Water mask derives from authoritative water minus open bridge cells.
- Mini robots/wildlife are currently decorative navigation hints/ambience and intentionally ignore collision; this is not the player/follower path model.

### Objective semantics
- The current runtime marks the first incomplete objective as active and completes an objective when the player is within ~18 logical px.
- Story JSON `required` numeric fields remain present but are **not consumed by current 3.99 JavaScript**. Treat them as legacy/inert metadata until a deliberate design decision gives them meaning again.


---

# Gameplay, Story, and Content

## Core loop

1. Enter a fixed room and read a short story card.
2. Move the guide using direct keyboard/gamepad input while the relay moth flock swirls around it.
3. Reach the current luminous objective; objectives resolve immediately by proximity.
4. Collect optional relay moths and recruit available full-size robots.
5. Complete all room objectives to open the forward gate.
6. Revisit earlier rooms freely; reach the Morning Garden for free play after the Dawn Heart.

The game is intended to feel exploratory, sparkling and forgiving rather than challenge/failure driven.

## Story progression

| # | Room | Current prompt | Objectives |
| --- | --- | --- | --- |
| 1 | THE QUIET NEST | Wake the sleepy relay lamp. | SLEEPY LAMP (lamp) |
| 2 | LANTERN LANE | Wake all three lantern trees. | LANTERN ONE (lantern), LANTERN TWO (lantern), LANTERN THREE (lantern) |
| 3 | THE TIN-STREAM BRIDGE | Wake the four bridge rivets and build a path across the Tin-Stream. | BRIDGE ANCHOR 1 (rivet), BRIDGE ANCHOR 2 (rivet), BRIDGE ANCHOR 3 (rivet), BRIDGE ANCHOR 4 (rivet) |
| 4 | PIP UNDER THE FERNS | Follow the curling trail to Pip. | PIP (pip) |
| 5 | PIP'S HOME LOOP | Lead Pip to the warm home beacon. | HOME BEACON (beacon) |
| 6 | THE WHISPER ORCHARD | Visit the copper, silver, and tin bells. | COPPER BELL (bell), SILVER BELL (bell), TIN BELL (bell) |
| 7 | THE STAR BATTERY | Collect all five ground-stars. | GROUND STAR ONE (star), GROUND STAR TWO (star), GROUND STAR THREE (star), GROUND STAR FOUR (star), GROUND STAR FIVE (star) |
| 8 | THE GREAT DAWN TREE | Gather around the bright Dawn Heart. | DAWN HEART (dawn) |
| 9 | THE MORNING GARDEN | Swirl, sparkle, and visit the friendly trees. | None — free play |


### Narrative arc
- **Quiet Nest:** wake the last sleepy relay lamp.
- **Lantern Lane:** restore three lantern trees and establish the idea of a distributed morning song.
- **Tin-Stream Bridge:** wake four anchors; the bridge appears progressively across a north–south river, left-to-right in four segments around a maintenance island.
- **Pip Under the Ferns:** wake Pip; Pip immediately becomes a persistent follower.
- **Pip’s Home Loop:** lead the procession to Pip’s home beacon.
- **Whisper Orchard:** restore the copper/silver/tin bell-fruit notes.
- **Star Battery:** collect five ground-stars to form the Dawn Key/constellation.
- **Great Dawn Tree:** gather at the Dawn Heart; room-wide morning returns.
- **Morning Garden:** no objectives and no failure; revisit, recolour and play with the flock.

## Generated 3.99 room density

| # | Room | Walls | Water | Paths | Objectives | Trees | Moth pickups | Mini robots | Wildlife |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | THE QUIET NEST | 207 | 0 | 41 | 1 | 18 | 1 | 0 | 10 |
| 2 | LANTERN LANE | 190 | 0 | 63 | 3 | 18 | 1 | 0 | 16 |
| 3 | THE TIN-STREAM BRIDGE | 133 | 124 | 95 | 4 | 18 | 2 | 0 | 12 |
| 4 | PIP UNDER THE FERNS | 275 | 0 | 41 | 1 | 18 | 1 | 9 | 14 |
| 5 | PIP'S HOME LOOP | 248 | 0 | 58 | 1 | 18 | 1 | 9 | 15 |
| 6 | THE WHISPER ORCHARD | 175 | 0 | 85 | 3 | 18 | 2 | 9 | 13 |
| 7 | THE STAR BATTERY | 228 | 0 | 92 | 5 | 18 | 2 | 13 | 17 |
| 8 | THE GREAT DAWN TREE | 236 | 0 | 49 | 1 | 18 | 1 | 14 | 15 |
| 9 | THE MORNING GARDEN | 234 | 48 | 14 | 0 | 18 | 2 | 13 | 15 |


Totals: **1,926 blocker cells**, **162 split trees**, **67 mini robots**, **127 wildlife**, **13 collectible moths**.

## Wildlife mix

| Kind | Authored actor count |
| --- | --- |
| cat | 27 |
| gnome | 18 |
| mushroom_pixie | 32 |
| pixie | 18 |
| rabbit | 20 |
| squirrel | 12 |


## Mini-robot palette/variant mix

| Variant | Authored actor count |
| --- | --- |
| charcoal | 14 |
| lilac | 4 |
| mint | 4 |
| orange | 9 |
| pink | 10 |
| silver | 5 |
| sky | 8 |
| teal | 13 |


## Persistent companions and collectables

- 2 starter relay moths.
- 13 authored collectible relay moths, for 15 total possible in the flock.
- Pip becomes a follower after the Fern Hollow objective.
- 9 separately recruitable full-size decorative robots are authored in later rooms.
- Mini robots are not recruitable full followers; they are diegetic objective-hint/ambience groups after Pip.

## Readability rules

- The active objective is always the first incomplete objective in story order.
- It receives a postprocessed top-layer shader marker and extra spark orbit.
- Any sprite chosen as an objective role is removed from that room’s decorative sprite pool.
- Forward gates require room completion; backward travel does not.
- Story intro/objective completion messages remain lightweight and non-punitive.
- Room remix/generation must preserve a clear route from spawn → each staged objective → exit.

## Tin Stream invariant

Tin Stream is not generic water decoration. It is a progression puzzle with authored state:
- vertical water strip;
- central maintenance island;
- four bridge segments;
- each rivet advances one bridge segment;
- bridge-open cells are removed from both collision water and the water-material mask;
- the exit is inaccessible at stage 0 and reachable after stage 4.

Any 4.0 water rewrite must preserve this exact authority relationship.


---

# Runtime Architecture

## Runtime topology

```text
index.html / style.css
        │
        ▼
     game.js
        │
        ├── data load
        │   ├── relay_moth_maps.json
        │   ├── relay_moth_story.json
        │   ├── relay_moth_sprites.json
        │   ├── relay_moth_pixel_luts.json
        │   ├── relay_moth_effects.json
        │   └── hd_remake_atlas.json + colour/bump images
        │
        ├── gameplay state
        │   ├── Room
        │   ├── StoryState
        │   ├── Flock
        │   ├── Followers
        │   ├── MiniRobotGuides
        │   ├── WoodlandCreatures
        │   └── FireflyField
        │
        ├── authoring/UI
        │   ├── map editor
        │   ├── colour lab
        │   ├── advanced LUT editor
        │   ├── channel mixer
        │   └── graphics editor
        │
        └── rendering
            ├── StaticPainter (OffscreenCanvas precomposition)
            ├── SpriteAtlas / HDArtSheet
            ├── GLRenderer
            ├── ParticleField
            ├── EffectsLibrary / ShaderFX
            └── native-resolution post/light/material passes
```

## Coordinate systems

- Logical gameplay coordinates stay 640×360 regardless of display/device pixel ratio.
- Room grid is 40×19; runtime constant `TILE=16` maps authored coordinates into the logical world.
- Display render targets track CSS canvas size × `devicePixelRatio`.
- Static background is rebuilt at native target size but painted under a transform from logical coordinates.
- `relay_moth_maps.json.grid.tile` still says 8 and is stale metadata; runtime does not use it for collision sizing. See tech-debt register.

## Room authority

`Room` owns the interpreted collision/navigation model:
- explicit `walls`;
- implicit outer border;
- `water`, blocked unless a bridge cell is open;
- path cells;
- object placements;
- blocker sprite styles;
- large-tree split metadata;
- moth, robot, lamp, mini-robot and creature placements.

Internal wall collision rectangles are inset on exposed edges so the visible sprite cluster is less boxy than a full 16 px tile, while connected blockers remain solid.

## Player collision

`movePlayer()` is deliberately separate from the more permissive `move()` used by followers.

Current player step:
1. input vector resolved;
2. keyboard has priority if held;
3. normalize diagonal;
4. multiply by constant `PLAYER_SPEED`;
5. subdivide into ≤0.42 px sweeps;
6. attempt full diagonal candidate;
7. if blocked, slide individual axes in a stable dominant-axis order;
8. no candidate scoring, no tangent jump, no global recovery snap.

## Full follower navigation

Followers use `Room.findPath()` on the 16 px grid and `Room.move(..., radius=4.8)` for physical movement. Failed path results are guarded; no waypoint is destructured unless it exists. See the dedicated living-forest document for fallback/teleport policy.

## Update isolation

`Game.update()` is intentionally partitioned:

**Critical:**
- player
- moth pickups
- robot pickups
- objectives
- doors

**Optional/fault-isolated:**
- flock
- followers
- mini robots
- wildlife
- fireflies
- particles
- shader FX

Optional subsystems use per-name fault state and temporary backoff. A cosmetic fault cannot clear held keys or cancel the player movement step.

## State and persistence

Story progress is in `StoryState`:
- completed objectives;
- shown story cards;
- collected moths;
- recruited robots;
- current room.

The current 3.99 implementation still writes the localStorage key `relayMothForestPretty394` and reads a chain of legacy keys. This is a compatibility quirk, not evidence that runtime version is 3.94. Do not rename it casually: doing so can orphan existing browser progress unless a migration is implemented.

Graphics settings use current key `relayMothGraphics399` and migrate several older graphics keys.

## Static vs live scene ownership

Static texture rebuild occurs only when room, LUT routing, completion state, bridge stage, recruited static robots, or native framebuffer size changes.

Static content includes:
- microtiled floor/paths/water base;
- blocker sprites and trunks;
- decorative foliage and lamps;
- unrecruited map robots;
- completed-object aftermath;
- gates.

Live content includes:
- current objectives and marker;
- moth pickups;
- full followers;
- mini robots;
- wildlife;
- fireflies;
- relay moth flock;
- particles;
- foreground tree canopies.

This boundary is a key performance contract and should be preserved or made more explicit in 4.0 rather than dissolved.


---

# Rendering, Art, and LUT System

## Current WebGL2 frame pipeline

At a high level, shipping 3.99 renders:

```text
native-resolution static background texture
    ↓
masked water material pass
    ↓
projected shadows + contact AO
    ↓
live normal sprites / HD material sprites
    ↓
additive sprite glow
    ↓
half-resolution bright-pass + separable bloom
    ↓
16-light emissive light map
    ↓
post composite: light × scene + bloom + saturation/grade/vignette/grain/exposure
    ↓
fullscreen semantic shader FX
    ↓
top-layer particles/sprites
    ↓
active objective shader marker
    ↓
guide/star shader
```

The important ordering requirement is that projected shadow/AO geometry is drawn **before live character sprites**, preventing a character from being visibly darkened by its own shadow layer.

## HD sprite material

Colour and bump atlases are coordinate-identical:
- `assets/sprite_runtime_atlas.png`
- `assets/sprite_bumpmap.png`

The HD fragment shader samples neighboring height texels and reconstructs a pseudo normal. The current response combines:
- directional diffuse;
- broad fill;
- cavity/local AO;
- low-energy specular;
- subtle rim;
- semantic tint/emissive contribution.

The latest direction is broad 2.5D volume, **not granular glitter**. High-frequency bump detail was specifically softened because moving sprites produced noise-like shimmering highlights.

Current shipping defaults: bump strength **1.15**, specular **0.28**, AO strength **0.18**.

## Lighting

Light map shader cap: 16 lights. Priority ordering deliberately prevents a large wildlife/moth population from consuming gameplay-critical lights.

Priority sources include:
1. guide/player light;
2. Space pulse flash;
3. current objective;
4. up to three full-size follower lights;
5. uncollected moth pickups;
6. sampled relay moth lights;
7. pixie/mushroom-pixie lights;
8. one ambient firefly if budget remains.

Ambient state begins at `ambientInitial=0.68` on room entry and eases to `ambientComplete=0.94` after the final objective, unless B forces complete lighting.

## Shadows / AO

The 2.5D projected shadow is cheap screen-space geometry:
- central tapered strip;
- transparent feather ribbons on both sides;
- fade-to-zero tip;
- contact AO footprint at blocker/follower feet.

Wall/tree casters are distance-filtered and capped. Mini guide robots are explicitly non-shadow-casting.

## Bloom and post

- Scene/light targets: full native display resolution.
- Bloom targets: half resolution.
- Bright extraction uses luminance threshold then separable blur.
- Post controls include bloom, saturation, grade mix, vignette, fixed grain, exposure.

## Current water material

3.99 water is already a separate fullscreen masked material pass. It uses:
- authoritative water mask minus open bridge cells;
- several sine-wave components as a height field;
- finite-difference normal;
- directional diffuse;
- Fresnel-like edge term;
- specular;
- caustic ridge functions;
- `fx_water` LUT-derived base colour.

This is the correct insertion point for 4.0 `WaterField`; replace/encapsulate it rather than adding a second unrelated water truth.

## Semantic LUT architecture

Eight independently routable channels:

| Channel | Semantic elements |
| --- | --- |
| WORLD | sky, stars, far_forest, ground, path, water |
| BLOCKERS | blockers |
| FOREST | tree_metal, tree_shadow, tree_lights, robot_faces |
| MOTHS | moth_body, moth_wings |
| SPARKLES | moth_spark, moon_cursor |
| STORY | discoveries |
| EFFECTS | fx_pulse, fx_magic, fx_water, fx_portal, fx_objective, fx_teleport, fx_creature |
| INTERFACE | ui |


Five current theme banks:
- Moonlit Copper
- Mint Circuit
- Berry Starlight
- Winter Relay
- Sunrise Tin

Every semantic LUT is a literal 256-colour table. Effect algorithms, sprite materials and art themes are therefore separable.

### EFFECTS channel
Current elements actually include **`fx_pulse` plus six older effect domains**:
`fx_pulse`, `fx_magic`, `fx_water`, `fx_portal`, `fx_objective`, `fx_teleport`, `fx_creature`.

`relay_moth_effects.json` currently contains 18 named presets and routes story/objective semantics to shader branches without putting GLSL IDs in map/story files.

## Art direction / sprite policy

- Preserve the hand-painted/remixed mechanical-forest vocabulary.
- Original painted tree sprites should remain the majority; 3.99 self-test reports 108/162 current split trees use original painted tree sprites.
- New tree variants should remix/extend the originals, not introduce a conflicting procedural-vector language.
- `foliage_extra_*` is excluded from foliage roles because older regions contained accidental partial robot imagery.
- Objective-role sprites are excluded from same-room decoration.
- Large trees split into static blocking trunk/root + live non-blocking foreground canopy.
- Current atlas has 361 named regions.

## Animation policy

- Full followers: idle/blink/walk-A/walk-B frame families where available.
- Mini robots: idle/blink/walk-A/walk-B.
- Wildlife: idle/blink/walk-A/walk-B.
- Relay moths: HD moth sprites with continuous procedural wing-beat scaling, bob/rotation, orbit and trail animation rather than a discrete atlas walk cycle.
- Fireflies: point/spark motion + bounded trails.

Future art work may increase frame count, but should not silently revert existing actors to static sprites.


---

# NPC Movement and Living Forest

## Two explicit locomotion tiers

3.99 deliberately separates persistent gameplay-adjacent followers from cheap decorative/hint actors.

### Tier A — full-size recruited followers
Collision-aware and path-based.

Current behavior:
- maintain a loose orbit around the guide, not a conga line;
- separation force when followers are closer than ~62 logical px;
- grid pathfinding to a target around the guide;
- collision movement radius ~4.8 px;
- replan more frequently when far away;
- progressive rubber-band begins at ~255 px and rises to ~3.3× catch-up multiplier over the next ~385 px;
- direct long-distance teleport only if distance exceeds **690 px**, or after prolonged severe stuck state (`stuck > 12.5 s` and distance >455 px);
- teleport uses visible teleport particles/FX because it is a recovery event, not normal locomotion.

#### No-route recovery
The latest user-requested behavior is implemented as three local attempts:
1. short clear cardinal step;
2. clear cardinal/diagonal step with randomized start order;
3. another randomized clear step;
then navigation is retried.

The fallback searches unblocked candidate endpoints and never destructures an absent path waypoint. `npc_regression_399.js` forces `findPath()` to return `[]` for 240 frames and verifies survival through fallback stage 3.

### Tier B — mini robots and wildlife
Intentionally non-colliding, low-tick waypoint ambience/hints.

They:
- do **not** use BFS;
- do **not** query/obey the room collision graph;
- are clamped to logical world bounds;
- use smooth direct waypoint steering and local overlap repulsion;
- cannot block the player;
- do not cast projected shadows;
- cannot fault the player update because their subsystem is optional/fault isolated.

This is the actual shipping policy and overrides stale architecture prose that says all AI shares `Room.findPath`/`Room.move`.

## Mini-robot hint swarm

Activation: after Pip wakes.

Authored current population: **67** across later rooms.

Behavior:
- groups are external map data;
- each low-tick target is biased to a randomized point between player and current unfinished objective;
- repel the player within ~42 px;
- repel other minis within ~21 px;
- walk/blink animation;
- current render scale ~1.38× the HD art’s world size;
- tiny sparkle ambience only; do not add large circular energy bursts.

## Woodland wildlife

Current authored count: **127**.

| Species | Current behavior | Actor count |
| --- | --- | --- |
| Rabbit | flees nearby player; also flees cats | 20 |
| Squirrel | flees player/cats; cats can acquire squirrels | 12 |
| Cat | chases nearby squirrels; otherwise may approach/hover around player at social distance | 27 |
| Pixie | orbits current objective-biased location and contributes small emissive light | 18 |
| Mushroom pixie | clusters around nearby gnome/herd locus with a light swarm motion | 32 |
| Gnome | wanders near home; when mushroom pixies are nearby, loosely follows/herds their group | 18 |


Wildlife scale was deliberately increased to roughly double its earlier visual size, and authored population increased substantially.

### Effect hierarchy
Current runtime render loops use sprite animation and tiny spark traces for mini robots/pixies. They do not emit the objective-like circle burst the user rejected. `relay_moth_effects.json` still contains reusable `mini_hint`, `creature_chime`, and `creature_dash` presets, but their existence is **not permission to spam circular bursts from ambience actors**. If these presets are used later, keep them visually subordinate and consistent with the no-circle-burst requirement.

## Relay-moth flock

Formations: `SWIRL`, `RIBBON`, `BLOSSOM`, `COMET`.

Tunable live parameters:
- orbit speed;
- orbit distance;
- chaos.

Behavior includes:
- continuously moving formation offsets;
- separation/repulsion;
- final three-pass minimum-separation correction;
- gathering contraction;
- pulse response;
- bounded moth-trail particles;
- LUT-controlled body/wing/spark colours.

## Fireflies

14 lightweight fireflies are initialised per room. They drift slowly and periodically emit the same bounded small trail particle mechanism used by moth ambience. They are not navigation/collision entities.

## Future AI rule

Do not make decorative life “smarter” by default. Any richer swarm/ecology logic should remain:
- bounded;
- visually legible;
- decoupled from player authority;
- free of unbounded all-pairs cost at larger populations;
- capable of being disabled or degraded without changing gameplay progression.


---

# Tests, Regressions, and Acceptance Gates

## Validation run while building this pack

### `python3 self_test.py` — PASS
Observed:
```text
NPC REGRESSION 3.99 PASS
no-route follower survived 240 frames; failCount=3 position=38.6,42.0
Relay Moth Forest — Pretty Graphics Edition 3.99
SELF-TEST PASSED
  27 staged objective/exit routes
  67 mini robots; 127 woodland creatures incl mushroom pixies/cats
  162 large trees; 108 use original painted tree sprites
  361 atlas regions + softened coordinate-matched bump atlas
  NPC no-route fallback, animation, effects LUT, ambient fade, frame cap and compact numeric graphics menu validated
```

### `python3 movement_regression_397.py` — PASS
```text
movement cases: 30072
free diagonal cases: 15036
free diagonals preserving both axes: 15036
maximum single-step displacement: 1.2 logical px
mouse world-control: disabled by design
per-frame player recovery snap: removed from gameplay update
```

### `node input_regression.js` — PASS
Validated:
- generic idle baseline produces no movement;
- noisy/sub-threshold button 0 produces no pulse edge;
- stable press emits one edge;
- release/repress emits exactly one new edge;
- generic axis delta is calibrated from connection baseline.

### `node npc_regression_399.js` — PASS
Forced no-route follower survives 240 frames and reaches `failCount=3` without exception.

### `python3 jitter_regression.py` — PASS
10,740 cases; maximum unintended lateral displacement 0 logical px; legacy 2.75 px corner side-step absent.

### `python3 fault_regression_398.py` — FAILS AS A STALE TEST
The script asserts that shipping JavaScript contains literal filename:
```text
relay-moth-runtime-diagnostics-398.json
```
Current 3.99 correctly contains:
```text
relay-moth-runtime-diagnostics-399.json
```
The rest of the 3.98 fault-isolation design remains in current code. Do **not** revert runtime diagnostics to 398 just to make this historical string assertion pass. Update/replace the stale regression in the next cleanup pass.

## Mandatory pre-merge acceptance gates for 4.0

### Gameplay stability
- all 27 staged route checks remain valid;
- Tin Stream is inaccessible at stage 0 and passable after stage 4;
- movement regression remains 100% pass, including both-axis free diagonals;
- no world mouse control reappears unintentionally;
- keyboard priority over gamepad noise remains intact;
- follower no-route regression remains pass;
- optional SurfaceFX failures cannot clear input or abort critical gameplay update.

### Rendering correctness
- SurfaceFX OFF reproduces 3.99 gameplay and a visually equivalent baseline path;
- bridge-open cells disappear from WaterField mask immediately when state changes;
- objective marker remains visible above post/FX and is not reused as decoration;
- shadows/AO remain below live characters;
- bump material does not reintroduce moving granular shimmer;
- pulse still has shader + particles + transient light;
- mini/wildlife remain free of large circular action bursts.

### Performance / bounds
- no unbounded actor×actor or pixel×pixel CPU loop introduced by SurfaceFX;
- water field has explicit resolution/quality bounds;
- grass instance count, clump count, interaction sources and LOD work are capped;
- no per-frame rebuilding of static shoreline/density data when map state is unchanged;
- fallback quality exists for expensive techniques;
- current 15–240 frame limiter still functions.

### Data/reuse
- maps/story do not gain embedded GLSL/shader IDs;
- LUT route remains semantic;
- SurfaceFX consumes map masks/metadata but does not become collision authority;
- reusable subsystem can be instantiated independently of Relay Moth story classes.


---

# Discrepancies and Technical-Debt Register

This is intentionally explicit. 3.99 contains several historical documents and compatibility fields that disagree with shipping code. A future agent should resolve them deliberately, not infer behavior from the first document it opens.

## D1 — README advertises world mouse gameplay that was removed in 3.97
**Stale prose:** move guide to cursor; left-click pulse; right-hold gather; wheel formation.  
**Shipping truth:** canvas pointer world controls are intentionally unbound; keyboard/gamepad are world authorities.  
**Action:** update README/help documentation; do not re-enable world mouse behavior unless product design explicitly reopens it.

## D2 — bump default has three competing values
- shipping `game.js`: `bumpStrength=1.15`;
- external `BUMP_LIGHTING_399.txt`: says 1.30;
- README: says 1.35.

**Action:** runtime is authoritative now. Normalize docs to 1.15 or deliberately retune code + tests with visual validation. Do not silently assume README value.

## D3 — follower teleport threshold is stale in README
README says approximately 610 logical px. Shipping code uses direct teleport at **>690 px**, or severe prolonged stuck state `stuck>12.5 && distance>455`.

**Action:** document actual thresholds; change only with behavior testing.

## D4 — architecture prose contradicts current mini/wildlife locomotion
`ARCHITECTURE.txt` correctly opens by describing collision-aware followers vs collision-free hint/wildlife actors, but its later “Living Forest AI” section says mini robots are pathfinding and all AI shares `Room.findPath`/`Room.move`.

`NPC_PATHFINDING_399.txt`, `PERFORMANCE.txt`, and current code agree that mini robots + wildlife are **collision-free low-tick waypoint actors with no BFS**.

**Action:** remove stale lower architecture paragraph.

## D5 — README says wildlife can emit creature chime/dash effects
Effect presets exist, but current `WoodlandCreatures.update/render` does not emit fullscreen ShaderFX events; pixies/mushroom pixies emit only small sprite spark ambience.

This also aligns with the user requirement that wildlife/mini robots not produce circle-energy-burst visuals.

**Action:** treat effect presets as reusable vocabulary, not evidence that current actors should fire them. If reintroduced, design subordinate/non-circular effects.

## D6 — Editor Guide contains old 8 px / seven-channel text
Early editor paragraph says floor uses 8 px microtiles and lists seven channels excluding EFFECTS. Later 3.99 addendum says `floor_microtile=4` and EFFECTS is routable. Shipping maps/runtime use **4 px** and **eight channels**.

**Action:** rewrite editor guide around 3.99 truth.

## D7 — map top-level metadata still says `grid.tile: 8`
Every generated room has `floor_microtile=4`, while runtime defines `TILE=16`. Existing map note `v39_floor` also says visual floor 8 px. The top-level 8 is legacy metadata ignored by current JavaScript.

**Action:** introduce explicit schema fields if cleaning this up, e.g. `gameplay_tile=16`, `floor_microtile=4`, with migration/versioning. Do not simply change a legacy value if any old tools still read it.

## D8 — story `required` values are inert
Story objects retain values such as 1.45, 1.25, 0.95 and 0.78, inherited from earlier objective timing/proximity semantics. Current JavaScript never references `obj.required`; objective completion is distance `<18`.

**Action:** either deprecate/document as legacy, or define a new explicit use. Do not accidentally interpret it as seconds/distance without a design decision.

## D9 — save key remains `relayMothForestPretty394`
Current 3.99 StoryState writes the 3.94 localStorage key and reads a legacy key chain. This preserves browser progress but is confusing.

**Action:** if changing, implement migration: read legacy → write new 4.0 key → retain one-time fallback. Avoid wiping child/user progress.

## D10 — dead mouse-path code remains
`setMouseDestination`, mouse fields, `MOUSE_MAX_SPEED` and clearance-path helpers still exist despite world mouse input being disabled.

**Action:** can be removed/refactored in a cleanup pass only after confirming editor tooling does not depend on them. Movement regression should guard the removal.

## D11 — historical 3.94 mini-BFS performance notes remain in `PERFORMANCE.txt`
They are useful history, but current minis have no BFS.

**Action:** move them under a clearly historical heading or archive section.

## D12 — stale `fault_regression_398.py`
It fails only because the expected diagnostics filename has advanced from 398 to 399.

**Action:** create a version-agnostic fault regression or update it to assert the current diagnostics contract rather than a historical literal filename.

## D13 — `BUMP_LIGHTING_399.txt` packaging inconsistency
A current standalone `BUMP_LIGHTING_399.txt` exists alongside the latest project in Library, but it is not contained in the 3.99 ZIP audited here.

**Action:** add the canonical bump-lighting note into the next baseline archive after reconciling its 1.30 default claim with actual 1.15 runtime.

## D14 — 3.99 docs understate `fx_pulse`
Some effects documentation lists only `fx_magic`, `fx_water`, `fx_portal`, `fx_objective`, `fx_teleport`, `fx_creature`. Shipping LUT data adds dedicated `fx_pulse` and shipping Space pulse uses it.

**Action:** list all seven EFFECTS semantic elements in future docs.

## Cleanup priority

**P0:** do not touch runtime behavior merely to satisfy stale prose.  
**P1:** make docs/test names version-correct while preserving behavior.  
**P2:** formalize schema metadata and save migration as part of 4.0.  
**P3:** remove dead legacy world-mouse code only after regression coverage is retained.


---

# Next Phase: 4.0 SurfaceFX

## Established direction

The next phase should not be “add more random shaders.” It should convert the strongest surface rendering ideas into a **reusable subsystem** with explicit ownership, bounded workloads, quality fallbacks, LUT integration and clean disable behavior.

```text
SurfaceFX
├── WaterField
│   ├── spectral / octave normal generation
│   ├── shoreline SDF
│   ├── interaction ripples
│   ├── foam sources
│   └── LUT material
│
└── GrassField
    ├── density map
    ├── instanced blades
    ├── wind field
    ├── interaction push fields
    ├── LOD / culling
    └── LUT material
```

## Architectural contract

`SurfaceFX` must be reusable outside Relay Moth Forest.

It may consume:
- a surface mask/density field;
- semantic material/LUT handles;
- time;
- lighting inputs;
- bounded interaction events;
- quality configuration;
- logical→render coordinate transform.

It must **not** own:
- player collision;
- story completion;
- room route/path authority;
- bridge progression;
- follower pathfinding;
- save-game progression.

Relay Moth adapters should translate existing map/story state into SurfaceFX inputs.

## WaterField

### Relay Moth integration
- Apply to **all authoritative exposed water** in every room.
- Start from current water-mask authority: room water minus currently opened bridge cells.
- Reuse/replace the current `renderWater` pass rather than layering an unrelated second water shader.
- Water OFF must degrade safely to the static 3.99 water base.

### Desired capabilities
1. **Spectral / octave wave field**
   - Multiple stable wave bands / directional components.
   - Lightweight spectral concepts inspired by web ocean approaches.
   - Do **not** jump straight to a full FFT implementation; first target the large visual gain from a bounded analytical/octave field.
2. **Normals/material response**
   - coherent surface normal;
   - environment/main-light response compatible with existing lighting direction;
   - LUT-controlled base/foam/highlight palette relationship.
3. **Shoreline SDF**
   - derive from the water mask when room/bridge state changes, not every frame;
   - use for edge falloff, shoreline foam and optional shallows/material transition.
4. **Interaction ripple API**
   - bounded transient sources with position/radius/amplitude/frequency/age;
   - allow pulse/bridge/story interactions without giving the water field gameplay authority;
   - hard cap and expire sources.
5. **Foam sources**
   - shoreline-based baseline foam;
   - optional interaction/bridge/source foam events;
   - avoid full-screen uniform fizz.
6. **Quality ladder**
   - low: current/simple multi-wave approximation;
   - medium: octave normals + shoreline response;
   - high: more bands/ripples/foam samples;
   - all modes preserve the same art direction and LUT semantics.

## GrassField

### First integration scope
**Small sparse clumps only. Do not blanket every ground tile with grass in the first pass.**

This is explicitly a risk-control and art-direction decision: prove attractive instancing, wind, interaction and culling in a small amount of authored terrain before increasing density.

### Desired capabilities
1. density map / authored clump mask;
2. instanced blade/tuft geometry with deterministic per-instance variation;
3. wind field with low-frequency coherent motion rather than independent sine jitter;
4. bounded interaction push fields from player/followers where visually appropriate;
5. LOD/culling and instance-budget control;
6. LUT-driven blade base/tip/highlight material;
7. cheap approximation/fallback that preserves colour/motion language if the full blade field is disabled.

## Reference philosophy already established in the conversation

- Use the useful ideas from the referenced Three.js grass/water shader implementation as **inspiration/source material where appropriate**, but keep Relay Moth’s runtime raw WebGL2; do not introduce a Three.js runtime dependency merely to copy an effect.
- Borrow lightweight spectral concepts from `webgl-ocean`-style water, not its full architectural cost.
- Prefer fresh implementation when it fits the current renderer better than transplanting framework-specific code.

## Renderer integration proposal

A clean 4.0 structure could be:

```text
GLRenderer
├── core targets/post/light/shadow/material passes
├── SurfaceFX
│   ├── WaterField
│   └── GrassField
├── sprite batches
└── semantic fullscreen FX
```

Suggested data boundary:

```text
Room / Story state
    │
    ├─ buildWaterSurfaceDescriptor(room, bridgeProgress, LUTs)
    └─ buildGrassSurfaceDescriptor(room, authoredDensity, LUTs)
          │
          ▼
       SurfaceFX
          │
          └─ GPU-only/derived visual resources
```

Derived SDF/density/instance buffers should rebuild only when their authoritative source changes.

## 4.0 Graphics menu

Expose a compact set of useful numeric controls consistent with 3.99 UI philosophy, e.g.:
- SurfaceFX master;
- water quality;
- water wave strength/speed/scale;
- shoreline foam strength;
- ripple strength/source budget;
- grass enabled/quality/density multiplier;
- wind strength/speed;
- interaction push strength;
- optional debug masks/LOD view under an advanced/debug section.

Avoid dozens of raw shader constants in the normal UI. Defaults should be visually coherent and each major subsystem should be disable-safe.

## Performance rules

- No per-frame CPU scan of every water/ground pixel.
- No per-blade draw calls; grass must be instanced/batched.
- SDF generation is state-change work; choose bounded CPU or GPU approach based on measured cost.
- Interaction source arrays are capped.
- LOD/culling is explicit.
- Water passes have fixed known texture resolution/step counts per quality tier.
- Do not allocate textures/buffers every animation frame.
- Preserve current half-resolution bloom and bounded light/FX lists unless profiling proves a redesign is warranted.

## Acceptance target

4.0 succeeds when water feels materially richer everywhere it appears, sparse grass clumps add convincing living depth, both systems react coherently to the scene, LUT theming still works, disabling them returns to a stable baseline, and **none of the movement/NPC/story regressions that consumed 3.93–3.99 development return.**


---

# Agentic Implementation Prompt — Relay Moth Forest 4.0

You are taking over **Relay Moth Forest** from the validated **Pretty Graphics Edition 3.99** baseline. Treat the supplied development pack and `baseline/relay_moth_pretty_graphics_v3_99.zip` as your starting source of truth.

## Mission

Advance the renderer toward **4.0** by implementing a reusable raw-WebGL2 `SurfaceFX` subsystem with a high-quality `WaterField` and a deliberately limited first-pass `GrassField`, while preserving the 3.99 game’s deterministic movement, external data authority, child-friendly readability, living-forest behavior, LUT system, authoring workflows and stability.

Do not merely bolt one-off shaders onto `game.js`. Create a coherent subsystem that could be reused by another WebGL game.

## Before changing code

1. Unpack and run the 3.99 baseline through its Python localhost launcher.
2. Read `01_CURRENT_TRUTH_AND_INVARIANTS.md`, `08_TESTS_REGRESSIONS_AND_ACCEPTANCE.md`, and `09_DISCREPANCIES_AND_TECH_DEBT.md`.
3. Run the baseline tests and record results.
4. Inspect current `GLRenderer.renderWater`, water-mask rebuild, LUT manager, light pass, static painter and graphics UI before designing SurfaceFX integration.
5. Do not “correct” shipping behavior to match stale README text. Runtime/tests + latest requirements win.

## Required 4.0 architecture

```text
SurfaceFX
├── WaterField
│   ├── spectral / octave normal generation
│   ├── shoreline SDF
│   ├── bounded interaction ripples
│   ├── foam sources
│   └── LUT material
└── GrassField
    ├── density map / authored clumps
    ├── instanced blades or tufts
    ├── coherent wind field
    ├── bounded interaction push fields
    ├── LOD / culling
    └── LUT material
```

Implement this in **raw WebGL2** and integrate it with the existing renderer. Do not add Three.js as a runtime dependency. You may study/copy adaptable ideas from the grass/water shader references named in the development conversation and lightweight spectral concepts from web-ocean implementations, but prefer a fresh implementation where framework-specific code would distort the current architecture. **Do not begin with a full FFT ocean.**

## WaterField requirements

- Every authoritative exposed water cell in every room uses WaterField.
- Tin Stream bridge cells disappear from the water mask as they become open, exactly as in 3.99.
- Build coherent multi-band wave normals with noticeably richer large/small structure than current multi-sine water.
- Add shoreline SDF-driven edge response and foam.
- Support a small hard-bounded list of transient ripple/foam sources; keep the event API separate from gameplay authority.
- Route water/foam/highlight colour through semantic LUT material roles; do not hard-code the final palette.
- Provide quality tiers/fallback. Lowest/off mode must preserve playable 3.99 behavior.
- Rebuild static derived shoreline data only when water/bridge state or resolution requires it.

## GrassField requirements

- First pass is **small sparse clumps only**. Do not carpet all ground.
- Use instancing/batching, never one draw call per blade.
- Deterministic density/variation from authored or derived clump data.
- Coherent low-frequency wind and optional bounded player/follower push fields.
- LOD/culling and a hard instance budget.
- LUT-driven material.
- Disable-safe and quality-scalable.
- Grass is visual only unless a later explicit design changes collision; it must not alter `Room` navigation.

## 3.99 behavior that must not regress

- Direct keyboard/gamepad movement, normalized diagonal, deterministic ≤0.42 px swept steps.
- No world mouse movement/click/gather/wheel controls.
- No acceleration/candidate scoring/tangent-correction/player snap recovery.
- Player critical update remains isolated from optional systems.
- Follower no-route path results remain guarded with three-stage local step-aside fallback.
- Mini robots and wildlife remain low-tick non-colliding ambience/hints unless an explicit new design replaces that policy.
- Shadows/AO stay below live characters.
- Space pulse retains dedicated `fx_pulse` LUT + shader + bounded particles + emissive flash.
- Mini robots/wildlife do not emit large circular energy bursts.
- Objective sprites are not reused as decoration in the same room.
- Objective marker remains topmost/readable.
- Original painted tree visual language remains dominant.
- External maps/story/LUT/effect/atlas authority remains intact.
- All 27 staged story routes and Tin Stream progression remain valid.

## Quality and engineering standard

Be agentic about implementation details, but not about violating product constraints. Profile before making structural performance claims. Keep GPU work bounded and reuse buffers/textures. Prefer explicit resource ownership and cleanup. Add diagnostics for SurfaceFX resource sizes, quality tier, instance count, ripple source count, and derived-field rebuilds.

Where current 3.99 files contain contradictory historical documentation, fix the documentation **after** establishing actual runtime behavior. Preserve save compatibility or implement an explicit migration.

## Tests you must leave passing

- `self_test.py`
- `movement_regression_397.py`
- `input_regression.js`
- `npc_regression_399.js`
- `jitter_regression.py`

Also replace/update the stale `fault_regression_398.py` so it tests the semantic fault-isolation contract without hard-coding an obsolete 3.98 diagnostics filename.

Add SurfaceFX tests for at least:
- water mask/bridge exclusion;
- shoreline-field rebuild invalidation;
- bounded ripple sources;
- quality/off fallback;
- grass instance budget + deterministic generation;
- no collision-map mutation from SurfaceFX;
- graphics settings persistence/migration;
- shader compile/link failure reports with clean disable/fallback path.

## Deliverables

1. Updated runnable project archive / repository state.
2. `SURFACEFX_ARCHITECTURE.md` documenting ownership, data flow, GPU resources and quality tiers.
3. `SURFACEFX_VALIDATION.md` with test results and performance measurements from real browser/GPU conditions when available.
4. Updated README/editor/architecture docs with the 3.99 drift corrected.
5. Changelog describing 4.0 changes and intentional non-changes.
6. No regressions in the baseline acceptance suite.

The goal is not maximum shader complexity. The goal is a **cohesive, reusable, performant surface-rendering layer that makes Relay Moth Forest look materially more alive while making its architecture cleaner rather than more fragile.**
