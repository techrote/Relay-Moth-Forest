# Rooms and Maps

Room geometry and most authored world content live in:

```text
relay_moth_maps.json
```

Current schema:

```text
relay-moth-maps/v3.99
```

The schema number is intentionally older than the release number; it is still the current compatible map contract.

## Grid

The map grid is:

- 40 tiles wide;
- 19 tiles high;
- 16 logical pixels per gameplay tile.

Tile coordinates use:

```json
[x, y]
```

Example:

```json
[20, 9]
```

## Fields used directly by the current Room runtime

The current `Room` constructor reads:

- `walls`
- `water`
- `path_cells`
- `objects`
- `blocker_styles`
- `large_trees`
- `moth_pickups`
- `decor_robots`
- `decor_lamps`
- `editor_decor`
- `decor_exclusions`
- `pattern_exclusions`
- `object_fx_hidden`
- `bridge_cells`
- `bridge_segments` / legacy `bridge_phases`
- `bridge_island`
- `foliage_density`
- `floor_microtile`
- `mini_robot_groups`
- `creature_groups`
- `grass_clumps`
- `floater_clumps`
- `outer_border_depth`

Other note/history fields may also exist in the JSON, but they are not necessarily runtime authority.

## Walls

```json
"walls": [
  [1, 1],
  [1, 2],
  [2, 2]
]
```

Walls block movement.

The visual sprite for a wall cell can be controlled independently through `blocker_styles`.

## Blocker styles

Example:

```json
"blocker_styles": {
  "1,1": {
    "sprite": "foliage_v391_18",
    "kind": "blocker",
    "lut": "blockers",
    "scale": 1
  }
}
```

The key is a string `"x,y"`.

Changing a wall's sprite does not make it non-colliding. Collision authority comes from the map wall/water/border data.

## Paths

```json
"path_cells": [
  [5, 9],
  [6, 9],
  [7, 9]
]
```

Path cells influence static floor presentation and some procedural decoration choices. They are not a separate navigation graph.

## Water

```json
"water": [
  [16, 8],
  [16, 9]
]
```

Unopened water cells are blocking.

SurfaceFX consumes the water mask visually, but it does not decide walkability.

## Objectives

Map objective placement:

```json
"objects": {
  "pip": [20, 9]
}
```

The key must match a story `object_id`.

Use F2 -> OBJECT if you only want to move an objective.

## Large trees

Example:

```json
{
  "tile": [1, 9],
  "sprite": "tree_green"
}
```

Large trees use special split trunk/canopy rendering so actors can pass behind the canopy.

Do not convert a large tree into an ordinary decoration just to move it; use the tree placement/editor tool so the intended split/occlusion behavior is retained.

## Lamps

Example:

```json
{
  "tile": [30, 12],
  "lamp": "lamp_pink",
  "base": "orb_pillar"
}
```

The static painter provides the mounted post/base presentation.

## Free-position editor decoration

```json
"editor_decor": [
  {
    "editor_id": "decor_1",
    "x": 320,
    "y": 160,
    "sprite": "foliage_v401_ground_r0c0",
    "scale": 1.0,
    "flip": false
  }
]
```

Coordinates here are logical pixels rather than tile coordinates.

Optional fields include alpha, rotation, tint/element overrides and flip.

## Procedural-decor exclusions

### `decor_exclusions`

Suppress generated non-authoritative decoration at tile locations.

### `pattern_exclusions`

Suppress named room-pattern objects.

Example:

```json
"pattern_exclusions": ["nest:swirl"]
```

This is how the editor removes Quiet Nest's large transparent moon/star swirl without deleting the room pattern.

### `object_fx_hidden`

Hides an objective waypoint visual while preserving the story objective itself.

## Tin Stream bridge

Tin Stream is special and should be edited carefully.

Its bridge uses:

- `bridge_cells`
- `bridge_segments`
- `bridge_island`

Current bridge segments are staged. Open bridge cells stop behaving as blocked water.

Changing these fields can affect:

- walkability;
- water masking;
- progression;
- route tests.

Always run `python self_test.py` after changing Tin Stream bridge geometry.

## F2 WYSIWYG workflow

For ordinary layout work:

1. launch locally;
2. F2;
3. use Brush/Select/Object/Move;
4. save;
5. inspect the resulting JSON diff;
6. run the self-test.

This is safer than hand-writing coordinates for large batches of decorations.
