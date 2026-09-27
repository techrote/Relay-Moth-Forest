# Current rebuild path and performance opportunities

## Current rebuildRoom()

After every editor mutation, current code:

1. reconstructs the current `Room`;
2. preserves bridge progress/built state;
3. relocates player if the edit makes their position invalid;
4. clears `game.bgKey`;
5. forces `game.ensureBackground(true)`;
6. reinitialises `game.creatures`;
7. reinitialises `game.miniGuides`;
8. rerenders editor overlay/status.

This is correct enough for WYSIWYG but broader than necessary.

## Why this matters

A continuous decor/grass drag can call `rebuildRoom()` many times in one pointer gesture.

Moving a flower does not logically require:
- recreating wildlife population;
- recreating mini-robot population;
- rebuilding water if water did not change.

Excess rebuild scope can also make ambient actors visibly jump during authoring.

## v4.14 cache correctness that must remain

The v4.14 browser regression specifically checks same-count geometry changes:

- moving a grass clump changes the FoliageFX descriptor identity;
- changing one water coordinate changes the water mask/signature.

Do not trade away this correctness while optimising rebuild scope.

## Target invalidation classes

A useful design can classify mutations:

### STATIC_VISUAL
Examples:
- editor_decor move/property
- lamp visual
- blocker/tree visual changes

Needs static background/material rebuild.

### TERRAIN
Examples:
- walls
- water
- path
- bridge geometry

Needs Room reconstruction; water/terrain/static invalidation; possibly player relocation.

### FOLIAGE
Examples:
- grass clump move/radius/density
- foliage-related authored descriptors

Needs grass/foliage descriptor rebuild and relevant static visual update.

### CREATURES
Examples:
- creature group add/remove/properties

Needs creature preview reinit, not unrelated systems.

### MINI_ROBOTS
Needs mini preview reinit only.

### OBJECTS / MOTHS
Needs object/pickup presentation and any Room placement update.

The implementation does not have to use these exact enum names, but must make invalidation scope explicit and testable.

## Coalescing

For continuous pointer painting:
- coalesce expensive rebuild work to at most one per animation frame where possible;
- keep the editor overlay responsive;
- final pointer-up must leave runtime state exactly matching the map.

Do not introduce background async work that makes save/undo race with pending edits.

## Measurement

Add lightweight diagnostics/counters in tests rather than relying only on subjective speed.

Useful assertions:
- moving editor decor does not reinit creatures;
- changing a creature group does not rebuild water;
- N pointer-move events within one frame do not force N static rebuilds;
- final rendered descriptor signatures reflect the last edit.
