# Gameplay and simulation

## Core interaction model

Relay Moth Forest is an exploration game, not a mouse-driven point-and-click world.

World movement is direct:

- WASD / arrow keys;
- controller stick / D-pad.

The system cursor remains available, but the mouse is reserved for menus and editor authoring. This separation was deliberate: earlier world-mouse pathfinding was removed because direct movement was more predictable and easier to keep deterministic.

## Movement and collision

Player movement uses a swept/local collision solver around the player's small collision radius.

Important invariants:

- movement is continuous rather than tile-step animation;
- collision queries only the local tile neighbourhood;
- keyboard movement is not mixed with live gamepad-axis noise;
- large lateral “assist” probes are not used;
- local depenetration is preferred to visible teleport recovery.

Movement and jitter regressions exercise tens of thousands of cases and are part of the normal self-test.

## Rooms and progression

The current campaign has nine rooms.

Story authority lives in \`relay_moth_story.json\`; room geometry and authored placements live in \`relay_moth_maps.json\`.

The test suite exercises 27 staged objective/exit routes.

### Tin Stream

Tin Stream is a special staged bridge room.

Bridge progression controls both traversal and visual water authority:

- bridge segments unlock in stages;
- open bridge cells cease to count as exposed water for SurfaceFX;
- the final exit is not reachable at stage 0;
- completion yields the intended traversable bridge path.

Rendering must never independently decide that a bridge cell is walkable or dry.

## Persistent robot followers

Followers are intentionally a **casual social group**, not a formation solver.

Current behavior:

- broad comfort zone around the player: roughly 46–104 logical px;
- persistent personal follow targets rather than constant reaction to every small player movement;
- weak cohesion only after substantial group separation;
- loose follower-follower separation;
- stronger catch-up outside the comfort zone;
- independent pathfinding and independent stuck recovery;
- one stuck robot cannot block or delay the rest of the group.

The v4.08 compact formation experiment was deliberately relaxed in v4.09. Do not reintroduce exact slots or group-level waiting without a new design decision.

## Mini robots

Mini robots are lightweight, non-colliding ambient/hint actors.

They:

- do not use world BFS in their normal simulation;
- use authored groups/variants;
- can enter social/circle/scatter states;
- may emit bounded visual responses;
- never own story progression.

They begin appearing after the early campaign progression defined by the maps/story.

## Wildlife

Woodland creatures are also lightweight, non-colliding ambient actors.

Current families include squirrel, rabbit, cat, pixie, gnome and mushroom pixie variants.

They use:

- low-cost waypoint movement;
- local obstacle/water avoidance;
- local recovery behavior;
- bounded splash/ambient interactions.

They do not use the player's collision/pathfinding authority.

## Relay moths

Relay moth pickups are authored in map data and have unique IDs.

Collected moths contribute to the player's flock. Flock orbit speed, distance and chaos are user-adjustable graphics/presentation settings.

## Objectives and lighting

Objectives are defined in story data and placed by map data.

Completing a room can change:

- ambient light target;
- objective visuals;
- bridge state;
- story progression.

Pressing **B** is a presentation/debug override that forces completed-room lighting; it is not progression.

## Pause and recovery

The game supports explicit pause plus transition/recovery paths designed not to destroy the user's save or local editor backups.

Critical player update logic remains isolated from optional effects/ambient actors so an auxiliary system failure does not freeze control.
