RELAY MOTH FOREST — PRETTY GRAPHICS EDITION 4.13


4.13 CLOSER CASUAL FOLLOWERS + DECORATION MATERIAL MAPS

Robot followers keep the loose/social v4.09+ behavior but now use a closer 46–104 px comfort band and substantially stronger catch-up acceleration when outside it. They still do not chase exact slots or wait for blocked group members.

All HD decoration vocabulary now has coordinate-matched bump and dedicated specular data. Static decorations baked into the room canvas emit aligned world-space material buffers and are dynamically shaded with the same broad, alpha-safe normal/specular method used by the large trees. Live HD sprites and tall foreground decoration clips sample the same specular atlas directly. See docs/current/MATERIAL_MAPS_413.md.


4.10 WYSIWYG ROOM EDITOR

Press F2 to edit directly on the normal rendered game view. The on-canvas editor provides palette painting, right-click decoration removal, box selection, drag movement, copy/paste, undo/redo, live room rebuilds, and localhost project saving. See docs/current/WYSIWYG_EDITOR_410.md and docs/current/EDITOR_GUIDE.txt.

4.10 WYSIWYG ROOM EDITOR / WHOLE-SPRITE FOLIAGE DEPTH / CASUAL FOLLOWERS

The v4.10 foliage compositor no longer cuts grass or foliage sprites into foreground fragments. Every physical plant remains complete in the background pass. When its lower-edge depth relationship is clearly and stably in front of every overlapping actor, a complete foreground copy fades in as a unit. Classification uses the centre of each actor sprite's lower edge, a small directional Y bias, a conservative deadband/dwell period, and a smooth whole-sprite blend. This removes the isolated grass/leaf patches that could appear pasted onto robot faces and bodies.

Followers now behave as a loose social group rather than a rigid formation. Each robot keeps a persistent personal target inside a broad 52–118 px comfort zone, retargeting mainly when too close, too far, isolated, or substantially left behind. Cohesion is weak and only activates at large separation; obstacle/stuck recovery remains per robot, so one blocked follower does not hold the others back.

Tin Stream retains the denser authored grass layering added to its right bank for high-overlap visual testing and screenshots.

PACKAGE LAYOUT

The release root is intentionally small and contains only runtime/package entry points. Historical material is organized rather than deleted:

- `assets/` — runtime and source art assets
- `docs/current/` — current architecture/editor/performance notes and the current implementation/material notes
- `docs/history/` — prior release notes, diagnostics and validation logs
- `tests/current/` — active regression and shader-validation suite
- `tests/history/` — superseded regression snapshots retained for reference
- `tools/` — authoring/build utilities; `tools/history/` contains obsolete patch helpers

Launcher: use `0Play.cmd`.

Validation: run `python self_test.py`. The current detailed implementation note is `docs/current/V409_WHOLE_SPRITE_DEPTH_AND_CASUAL_FOLLOWERS.md`.

PREVIOUS RELEASE NOTES

3.999 GRASS ART INTEGRATION / UNIFIED SHADOW COMPOSITION

3.999 replaces the flat/vector-looking hero grass with rooted, animated pieces sampled from the same HD foliage and ground-decoration atlas used throughout the forest. Grass therefore inherits the existing painted palette, texture density and silhouette language instead of appearing as a separate neon system. The bottom band is fixed, middle bands move slightly, and the top receives most of the wind displacement. The old pink/purple Floater-FX remains available in the graphics panel but is hidden by default.

Shadow composition is also revised. Shadow origins move inward to the lower-center footprint of each caster, spot shadows are stronger and width-matched to the projected shadow, and all caster shadows are first composed into a half-resolution MAX mask. The mask is applied once to the scene, preventing overlapping shadows from repeatedly multiplying darkness. Water-mask rejection is preserved.

Launcher: use `0Play.cmd`.

3.998.1 ROOTED GRASS / FLOATER-FX PASS

3.998.1 separates the visibly floaty 3.998 hero-grass treatment into a new pink/purple `Floater-FX`, then rebuilds visible grass as opaque chunky rooted tufts. The lower third of each grass element is fixed while middle/top bands deform in the wind. A bounded 40 px actor grid determines whether nearby grass is rendered in front of moving actors, while foreground tree occluders remain above both.

---------------------------

v3.998 focuses on one issue: grass SurfaceFX existed in data/GPU code but was not visually
readable in normal play at 1080p. The existing instanced GrassField remains, but it is now
paired with a bounded "hero grass" layer driven by the same authored grass_clumps. Hero grass
renders larger, higher-contrast animated tufts through the existing batched sprite renderer,
under shadows/actors and above the static floor. This makes grass unmistakably visible without
turning it into gameplay collision or unbounded per-blade work.

At the default quality, the first three rooms each generate hundreds of bounded hero tufts in
their authored clumps in addition to the instanced GPU blades. F10 diagnostics now expose the
actual hero-grass count and authored-clump count.

Launcher naming has also changed: run_relay_moth_pretty_graphics.cmd is replaced by -Play.cmd
so the launch file sorts to the top of the project folder.

==================================================

3.995.4 WATER / GROUND COVER / ECOLOGY / BRIDGE PASS
---------------------------------------------------
3.995.4 follows the 3.995.3 structural fixes with a surface-material and living-forest pass
focused on idle water realism, visible authored grass, coherent tree occlusion, and richer
small-scale ecology without adding a full FFT ocean or heavier gameplay AI.

Water:
- Idle WaterField is now an optimized analytical pseudo-spectrum inspired by spectral-ocean
  techniques: three qualitative wave bands, directional wind-like energy, deep-water
  dispersion and analytical height/gradient accumulation in one fragment evaluation.
- It deliberately does NOT run FFT butterfly passes, floating-point ping-pong wave fields,
  SSR, physics foam accumulation or per-frame spectral textures. Existing bounded event
  ripples remain the interaction layer.
- Projected shadow geometry samples the authoritative water mask and is discarded over water.
- Player movement close to a shoreline now triggers bounded splash particles and WaterField
  ripples, in addition to wildlife/robot water interaction.

Grass / vegetation:
- Every room now contains explicit `grass_clumps` in `relay_moth_maps.json`; GrassField no
  longer depends on a barely-visible derived-only placement pass.
- Grass remains one instanced visual-only draw with deterministic per-clump density, coherent
  wind, interaction pushes and a hard instance cap.
- Dense adjacent horizontal vegetation rows get deterministic halfway-row inserts to reduce
  artificial striping/gaps in authored foliage bands.
- Legacy enlarged flower sprites are scaled back; three new high-resolution flower sprites
  and three new high-resolution foliage families are included in the runtime atlas and
  editable `sprites_foliage_hd` sheet.

Living forest:
- Wildlife has been halved from the oversized 3.995.3 presentation.
- Mini robots are slightly larger while retaining non-blocking, low-tick steering.
- Full-size followers use a calmer idle target/dead-zone and slower idle replan response.
- Cats can chase rabbits as well as squirrels, periodically lose interest, and sometimes play
  along nearby water edges.
- Rabbits share the same edge-escape jump used by squirrels.
- Mushroom pixies continue to gather and swirl around a shared local centre.
- Actors behind a large tree are re-occluded by both the tree trunk/lower body and canopy.

Tin Stream:
- Progressive construction still uses the four-row widened crossing and staged water/collision
  authority. Once complete, the visual switches to one coherent 512x256 authored wooden
  bridge sprite spanning the entire crossing, rather than a visible grid of repeated tiles.

Authoring / compatibility:
- `append_v39954_assets.py` reproducibly reapplies the complete bridge and HD flora after a
  normal atlas rebuild.
- Graphics settings use `relayMothGraphics39954` with migration from 3.995.3/3.995.2 while
  preserving deliberate user overrides.
- Display + Post continues to expose brightness, contrast and gamma separately from exposure.

Validation:
- Full inherited movement/input/NPC/jitter/fault/transition-memory regressions pass.
- SurfaceFX, graphics migration, completed-room mini social behavior, staged/widened Tin Stream,
  split-tree reconstruction and 3.995.4 visual/behavior contracts pass.

3.995.1 PORTAL TRANSITION HOTFIX
--------------------------------
3.995.1 is a crash-resilience hotfix for the 3.995 SurfaceFX bridge. A field report showed a portal transition followed by WebGL/browser memory pressure and repeated Python localhost `MemoryError` tracebacks during automatic recovery reloads. The runtime no longer retains native static room canvases after WebGL upload, caps pathological framebuffer backing sizes, suppresses repeated context-loss reload loops, and hardens the localhost server. See TRANSITION_MEMORY_HOTFIX.md.



3.995 SURFACEFX BRIDGE PASS
---------------------------
3.995 is the deliberately conservative bridge between the validated 3.99 game and the
larger 4.01 renderer revision. It introduces a reusable raw-WebGL2 `surfacefx.js`
subsystem without changing gameplay authority.

WaterField now consumes the authoritative exposed-water mask and derives a bounded
shore-distance field only when room/bridge state or quality changes. It adds three
analytical spectral/octave quality tiers, LUT-driven base/foam/highlight response,
shore foam, and a hard-capped transient ripple/foam API. Quality 0, SurfaceFX OFF, or
a WaterField failure returns to the original 3.99 masked-water shader.

GrassField is intentionally first-pass and sparse: 4–5 deterministic clumps are derived
near authored paths without touching collision data. Blades are submitted with WebGL2
instancing under a hard 900-instance ceiling, use coherent wind, and accept at most four
visual push fields from the player / nearest followers. Grass remains visual-only.

F10 diagnostics now include SurfaceFX field sizes, instance counts, ripple counts,
quality tiers, rebuild counts, upload bytes, and shader/fallback errors. Graphics settings
migrate from `relayMothGraphics399` to `relayMothGraphics3995`. The stale 3.98 fault
regression has been replaced by a version-agnostic semantic test.

3.99 NPC / LIGHTING / AUTHORING BASELINE
--------------------------------------
- Fixed FOLLOWERS and MINI-ROBOTS undefined-iterable failures: follower route results are guarded and failed navigation uses three short step-aside/retry attempts; mini robots and wildlife use a non-colliding low-tick waypoint controller.
- Mini robots render 50% larger and there are substantially more after Pip. Wildlife renders at 2x its previous scale and the authored maps contain many more animals.
- Added animated mushroom pixies and expanded cat/gnome/pixie/squirrel/rabbit interactions. Gnomes loosely herd mushroom pixies; cats chase squirrels; rabbits/squirrels flee nearby activity.
- Original painted tree sprites are again the majority. New tree variants are remix-derived from those originals rather than a conflicting procedural-vector style.
- Sprite bump lighting is deliberately low-frequency and softer to reduce shimmer/noise; projected shadows are drawn beneath live characters.
- Space pulse has its own EFFECTS-channel 256-colour LUT, shader burst, particles and transient emissive light.
- Active objective marker is native-resolution shader geometry rendered after post-processing. Objective sprites are excluded from same-room decorative vocabulary.
- Graphics menu is a compact left-anchored numeric editor. It includes max FPS, initial/complete ambient light, force-complete override, and moth orbit speed/distance/chaos. Press B during gameplay to toggle the full-light override.
- Ambient light begins at INITIAL on room entry and fades toward COMPLETE after the room's final objective.


A fixed-room, child-friendly exploration game rendered with WebGL2.
Runtime dependencies: Python 3 (localhost file server) + a modern WebGL2 browser.
No npm install and no CDN dependency.

START
-----
Windows:
    run_relay_moth_pretty_graphics.cmd

Or:
    py -3 relay_moth_server.py

The launcher serves this folder on 127.0.0.1 only and opens it in your browser.

3.99 BASELINE PURPOSE
---------------------
3.99 is a graphical-fidelity/NPC-systems testbed pass on the road to the larger 4.01 renderer/art
revision. It deliberately spends the substantial WebGL headroom on stronger material
response, better spatial lighting, denser organic maps and a larger living-forest
vocabulary while keeping gameplay data external.

VISIBLE BUMP / MATERIAL LIGHTING
--------------------------------
The colour atlas and bump atlas share exactly the same sprite coordinates:
    assets/sprite_runtime_atlas.png
    assets/sprite_bumpmap.png

The HD sprite fragment shader now reconstructs a much stronger pseudo-normal from
neighbouring height samples. The visible result combines:
    directional diffuse light
    broad fill light
    cavity darkening / local AO
    specular response
    edge/rim response
    emissive contribution

Graphics menu controls:
    Sprite bump lighting
    Bump strength
    Specular response
    Ambient occlusion
    AO strength

Bump strength defaults to 1.15 and can be increased to 3.0 for deliberately obvious
material relief.

SHADOWS + AMBIENT OCCLUSION
---------------------------
2.5D blocker shadows are no longer hard-edged opaque wedges. They use a central
projected strip plus transparent feather ribbons, with alpha fading toward the tip.
Each collision caster also contributes a contact-AO footprint.

Controls:
    Projected shadows
    Shadow strength
    Shadow length
    Shadow softness
    Ambient occlusion
    AO strength

EFFECT COLOUR LUTS
------------------
Special effects have their own independent LUT channel:
    EFFECTS

Its semantic 256-entry LUTs are:
    fx_pulse
    fx_magic
    fx_water
    fx_portal
    fx_objective
    fx_teleport
    fx_creature

relay_moth_effects.json selects both shader type and semantic colour LUT. Alternate
games can reuse the WebGL effects runtime and replace the JSON mappings.

ORGANIC MAP PASS
----------------
All nine maps were remixed with irregular blocker clumps and less orthogonal negative
space while retaining route validation to every story objective and exit.

Outer boundaries use two blocked layers in gameplay terms: the implicit edge plus a
visible inner ring. More than 80 percent of visible inner-edge blocker sprites are
dense foliage or large trees.

Visual floor microtiles are now 4 px while authoritative collision/pathfinding remains
16 px. This increases texture frequency fourfold relative to the original 16 px tile
art without making pathfinding more expensive.

TREES + FOLIAGE
---------------
3.99 includes:
    24 completely new foliage sprites
    8 completely new large-tree families

They are authored procedurally from the existing project's HD-remake design language,
not taken from the accidental robot-fragment regions present in older decor pools.
Those foliage_extra_* regions are explicitly excluded from all decorative foliage
roles in 3.99.

Large trees remain authoritative blockers. A tree is split into:
    blocking trunk/root layer
    non-blocking foreground canopy layer

Moths, robots and woodland creatures can therefore pass visually behind the canopy.
A per-room live-canopy budget keeps the foreground layer bounded while the remaining
border cells use precomposited foliage blockers.

WOODLAND CREATURES
------------------
3.99 includes dedicated animated sprite families, each with idle/blink/walk-A/walk-B
frames:
    squirrels
    rabbits
    cats
    tree pixies
    garden gnomes

They are not full-size robots repurposed as scenery. Their behaviour is interactive:
    squirrels / rabbits   retreat from an approaching player or robot group
    cats                  cautiously approach, then keep personal space
    tree pixies           orbit / illuminate the current objective area
    garden gnomes         wander gently around a home patch

Creatures react to nearby player/follower motion. Mini robots and wildlife are deliberately
non-colliding low-tick waypoint actors with local repulsion; they do not use BFS or the
player/follower collision graph. Their current ambience is sprite animation plus tiny
sparks only—no objective-like circle bursts.

MINI ROBOTS
-----------
Mini robots remain purpose-built sprites rather than scaled normal robots. They are
larger and easier to read in 3.99, and there are more groups after Pip wakes.
Groups contain 2 or 3 mini robots and attempt to occupy randomized points between the
player and the nearest unfinished objective, functioning as diegetic navigation hints.

FOLLOWER SPACING
----------------
Full-size followers now keep much more distance from the guide and from each other.
Medium-distance rubber-banding increases catch-up speed progressively, but teleport is
reserved for very large separation (>690 logical px) or a prolonged severe pathfinding
failure (stuck >12.5 s while >455 px away). Their loose targets and separation prevent a rigid shadow-producing conga line.

RELAY MOTHS + FIREFLIES
-----------------------
Collected relay moths remain continuously swirling and use repulsion/final separation
to prevent pile-ups. Their body, wings and sparkle colours remain LUT controlled.
Ambient fireflies leave bounded WebGL particle trails.

WATER / SURFACEFX
-----------------
Authoritative water remains `room.water - open bridge cells`; rendering never owns
collision or bridge progression. 3.995 routes that mask into WaterField, which derives
a state-change shoreline field, richer multi-band analytical normals, shoreline foam,
LUT-driven highlights and bounded interaction ripples. The legacy 3.99 shader remains
compiled as an explicit quality-0 / SurfaceFX-failure fallback.

CONTROLS
--------
Mouse:
    DOM menus / editors only. World mouse movement, pulse, gather and wheel controls
    remain intentionally disabled; keyboard/gamepad are the gameplay authorities.

Keyboard:
    WASD / arrows              move
    Space                      sparkle pulse
    C                          gather moths
    F                          cycle moth formation
    U                          multi-channel LUT mixer
    G                          graphics + lighting menu
    L                          level select / save reset
    H                          help
    P                          pause
    F2                         WYSIWYG room editor
    F3                         child colour lab
    F4                         advanced LUT editor
    F8                         static-layer export
    F11                        fullscreen

Controllers:
    Xbox/browser-standard pads and generic Gamepad API joystick/HID mappings are
    supported, including common alternate stick axes, D-pad buttons and POV-hat axes.

EXTERNAL AUTHORING FILES
------------------------
    relay_moth_maps.json        collision, paths, blockers, creatures, mini robots
    relay_moth_story.json       story/objective authority
    relay_moth_sprites.json     semantic/token sprite authority
    relay_moth_pixel_luts.json  8 independent LUT channels
    relay_moth_effects.json     reusable shader-effect presets + effect LUT roles
    hd_remake_atlas.json        runtime HD atlas, bump binding and semantic roles
    sprite_sheet_manifest.json  external-edit sheet coordinates

LUT CHANNELS
------------
    WORLD
    BLOCKERS
    FOREST
    MOTHS
    SPARKLES
    STORY
    EFFECTS
    INTERFACE

Each semantic LUT contains exactly 256 literal colours. Every channel can select a
different theme bank simultaneously.

SPRITE EDITING
--------------
Dedicated clean / bump / coordinate-grid sheets now include:
    large
    small
    terrain
    characters
    mini robots
    foliage
    trees
    creatures
    FX
    UI

See SPRITE_EDITING_GUIDE.txt.

To regenerate the current 3.99 art and runtime atlas:
    py -3 -m pip install -r requirements-authoring.txt
    py -3 build_v399_assets.py

To re-author/remix map placement from the current source data:
    py -3 remix_v399_maps.py

After hand-editing category sheets, the existing atlas rebuild workflow remains:
    py -3 rebuild_runtime_atlas.py

TEST
----
    py -3 self_test.py

The test covers route progression, blockers, two-layer border policy, 4 px floor
microtiles, foliage/tree/creature sprite families, category/bump sheets, all literal
256-colour LUTs, effect LUT routing, Tin Stream progression and JS/Python syntax.


3.93 HOTFIX
-----------
Mouse navigation now uses clearance-aware routing, preventing the player from wedging at tight blocker corners. The player collision footprint is 4.5 logical pixels. Shadows and ambient occlusion use compact ground-contact footprints rather than full sprite silhouettes.


3.93 MOVEMENT HOTFIX
--------------------
Player movement now uses continuous circle-vs-tile collision resolution with substeps instead of rejecting whole X/Y movements. This makes keyboard movement slide naturally along blocker edges and through tight turns. A small corner-assist is used only when a cardinal movement is being caught on a tile corner.

3.95 MINI-ROBOT / COLLISION HOTFIX
---------------------------------
Mini guide robots are explicitly non-blocking and no longer cast projected shadows. Their pathfinding replans are budgeted to avoid main-thread spikes when several guides are active. Internal wall collision uses an inset physical footprint while water and outer borders remain full-solid. Keyboard collision now compares direct, axis-slide and corner-assist candidates and chooses the movement with the best forward progress.


V3.96 CONTROL / CLARITY FIX
---------------------------
- Internal foliage collision uses merged blocker clusters with inset exposed edges.
- Player collision radius is 2.40 logical px and tangent motion is preserved at corners.
- Generic gamepad axes are baseline-calibrated; action buttons use hysteresis + stable-edge debounce.
- Space/pointer/controller sparkle pulses share a cooldown and keyboard auto-repeat cannot retrigger them.
- Bloom is now luminance-high-pass with a crisp default profile to avoid scene-wide haze.


3.96 KEYBOARD MOTION FIX
------------------------
If a controller remains connected while using WASD/arrows, keyboard movement now owns the movement vector completely. Collision corner assistance is continuous and sub-pixel rather than performing side-step probes. A one-frame collision overlap can no longer snap the guide to a tile centre.


3.97 MOVEMENT CONTROLLER REWRITE
--------------------------------
The v3.96 keyboard recording showed that collision correction had become more complicated than the movement problem. 3.97 removes that stack rather than tuning it again.

Gameplay mouse control is disabled. The mouse remains visible and works normally in menus, but moving/clicking/wheeling over the playfield does not steer the guide or trigger actions.

Keyboard/controller movement is now direct:
    WASD / arrows      normalized 8-direction movement
    controller stick   direct analogue movement
    Space              sparkle pulse
    C                  gather moths while held
    F                  formation

There is no player acceleration filter, candidate-scored corner correction, tangent side-step, or continuous recovery teleport. Collision is a deterministic swept circle with stable axis sliding. The guide star visual is also static in orientation: orbiting satellite specks were removed so its FX cannot create perceived positional jitter.

Run:
    py -3 movement_regression_397.py

The regression covers 30,072 movement cases and 15,036 unobstructed diagonal cases across the authored map paths.


3.98 UPDATE-FAULT ISOLATION
----------------------------
A recovered update exception no longer clears held keyboard keys. Player movement runs in its own critical update step; flock, followers, mini robots, woodland creatures, fireflies, particles and shader FX are isolated so a fault in one system cannot abort the rest of the frame. Repeating optional-system faults use exponential backoff instead of throwing every frame. Press F10 to download relay-moth-runtime-diagnostics-398.json if a fault remains browser-specific.
