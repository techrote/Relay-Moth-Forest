# Architecture

## Runtime shape

Relay Moth Forest is a browser game built around a 640×360 logical scene, a 640×304 playable region and a 40×19 gameplay grid of 16 px tiles.

The runtime is intentionally small and explicit:

```text
index.html / style.css
        |
        +-- surfacefx.js         WaterField + fine GrassField
        +-- sprite_material.js   shared sprite material math
        +-- foliagefx.js         physical readable foliage
        +-- procedural_decor.js  shared reserved-surface decor enumeration
        +-- editor_identity.js   cross-room persistent identity scan/allocation
        +-- editor_validation.js deterministic semantic validation + fingerprints
        +-- editor.js            F2 WYSIWYG authoring overlay
        +-- game.js              world, gameplay, renderer orchestration
        |
        +-- relay_moth_*.json    maps/story/LUTs/effects/sprites
        +-- hd_remake_atlas.json atlas regions/roles/material metadata
```

The local Python launcher serves the files and exposes the map-save endpoint used by the editor.

## Ownership boundaries

### Game / Room / StoryState

Own:

- player movement and collision;
- room geometry and walkability;
- story objectives and room completion;
- Tin Stream bridge progression;
- follower, mini-robot and wildlife simulation;
- save/progression state;
- construction of visual descriptors passed to render subsystems.

Rendering subsystems may observe these systems but do not mutate their authority.

### GLRenderer

Owns the WebGL2 render graph:

- static room texture;
- world normal/specular buffers;
- water/grass integration;
- shadow/contact mask;
- live sprite batches;
- foreground scenery;
- bloom/light/post passes;
- semantic FX and guide/objective layers.

### StaticPainter and mutable presentation

`StaticPainter` builds the expensive native-resolution **room-invariant backing** and aligned colour/normal/specular material buffers. Base terrain, blockers and scenery that do not change during ordinary progression remain baked.

Small stateful presentation is deliberately **not** part of that cache. Generated/editor decor, recruitable robot placements, completed-objective visuals, gates, Tin Stream bridge-stage art and other completion-sensitive presentation are submitted through a mutable live layer before shadows/actors. The mutable HD shader uses the same source colour/normal/specular atlases and accepts the exact per-item tint strength used by Canvas2D baking.

This boundary prevents an objective, robot recruitment or ordinary authored-decor edit from invalidating three full native-resolution backing textures while retaining the same material authority.

### Sprite material

`sprite_material.js` is the common source of truth for static/live/clipped sprite lighting.

It owns:

- material enable/disable behavior;
- source-space normal decode;
- flip/rotation normal transformation;
- diffuse/fill/specular response.

Turning sprite material lighting off returns the source/tinted colour instead of continuing to apply light-position-dependent shading.

### SurfaceFX

`surfacefx.js` owns visual water and fine grass. It accepts masks/descriptors and bounded interaction sources. It knows nothing about story completion or collision.

### FoliageFX

`foliagefx.js` owns readable rooted foliage:

- deterministic instances;
- rooted deformation;
- coherent wind;
- bounded actor interaction;
- spatial depth candidates;
- whole-sprite foreground/background transitions;
- foliage material/debug views.

It does not own collision, navigation, story or saves.

### Editor

`editor.js` owns authoring input only while F2 edit mode is active, explicit item/layer capability policy, room-keyed transactions/history, selection/clipboard, inspector UI, recovery controls and save/export UX. `RelayEditorPolicy` and `RelayEditorInvalidation` expose the policy/invalidation contracts to focused tests.

`procedural_decor.js` supplies the same deterministic generated-decor descriptors to the editor and mutable runtime presentation. Its reserved cells include bridge/island geometry, objective tiles and gate footprints. Exclusions affect presentation only.

`editor_identity.js` scans persistent robot/moth/wildlife/mini IDs across rooms and allocates unused IDs without renaming existing content. `editor_validation.js` provides deterministic semantic diagnostics plus canonical snapshots/dirty comparison to browser and Node tests; story definitions remain authoritative.

Editor invalidation uses STATIC, TERRAIN, FOLIAGE, CREATURES, MINI_ROBOTS, OBJECTS, ROOM_DATA and PRESENTATION flags. Repeated mutations coalesce through requestAnimationFrame; transaction completion, cancellation, room switches and persistence flush or discard pending work as appropriate. Room rebinding preserves bridge progress. Terrain refreshes static/water/foliage dependencies; common authored decor and object presentation update through the live mutable layer without a static bake. Object edits still rebind Room authority where placement/reservation data changed; group edits refresh only their own actor subsystem. Undo/cancel records carry the affected scope, with room-data rebinding where needed.

`Game.refreshEditorStatic`, `refreshEditorWater` and `refreshEditorFoliage` bridge rendering scopes to runtime subsystems. Creature and mini-robot scopes invoke `game.creatures.init(room)` and `game.miniGuides.init(room, state)` respectively. Geometry-sensitive descriptor keys preserve same-count invalidation. See [Editor](EDITOR.md) for transaction, recovery and persistence behavior.

Gameplay world movement remains keyboard/gamepad-driven. Editor pointer input is deliberately separate from gameplay input.

## Data flow

```text
maps/story/save
    |
    +--> Room / objective state / actors
    |
    +--> static painter ----------> invariant colour + normal/spec backing
    |
    +--> mutable presentation ---> generated/authored decor, robots, objectives, gates, bridge stage
    |
    +--> water mask -------------> SurfaceFX WaterField
    |
    +--> grass descriptors ------> SurfaceFX GrassField
    |
    +--> foliage descriptors ----> FoliageFX
    |
    +--> live actors/decor ------> shared HD sprite queues
    |
    +--> GLRenderer -------------> post/light/LUT composite
```

The same map JSON is used by both gameplay and the editor. There is no separate editor scene format.

## Render-order contract

At a high level:

```text
static ground / invariant room background
mutable background presentation (source-normal/specular)
water
fine GrassField
low/ground sprite material
unified shadow + contact-AO mask
background physical foliage
globally bottom-Y-sorted live HD world sprites
foreground physical foliage
foreground scenery / tree canopies
guide / objective / top FX
bloom / light / post / LUT composite
```

Tree trunks are not submitted twice. Canopies remain explicit foreground occluders.

See [RENDERING.md](RENDERING.md) for the detailed material and ordering rules.

## Failure isolation

Optional rendering/simulation systems are expected to fail locally:

- SurfaceFX WaterField failure falls back to the legacy water path.
- Fine grass can disable without stopping gameplay.
- FoliageFX failure falls back to the retained compatibility foliage path.
- Mini robots, wildlife and optional effects are isolated from the critical player update.
- Editor failure must not rewrite gameplay authority.

WebGL state cleanup is part of this contract: optional instanced paths restore VAO/divisor state even when a draw fails.

## Local server

`relay_moth_server.py`:

- binds only to localhost;
- serves repository files;
- uses bounded transfer concurrency;
- caches large image assets briefly but revalidates source/config files;
- exposes `POST /__editor/save_maps`;
- structurally validates a Relay Moth map object (semantic validation is shared JavaScript in the editor/tests, not an independent Python implementation);
- writes a timestamped backup before atomically replacing `relay_moth_maps.json`.

The runtime itself does not require a framework or external web server.

## Historical compatibility

Several runtime version strings and local-storage keys intentionally retain historical numbers. They are compatibility interfaces, not declarations that the project is still at those milestones.

Examples include the SurfaceFX internal version and graphics-settings migration keys.

Do not “clean up” these identifiers merely to make their numbers match the release number unless a migration plan accompanies the change.
