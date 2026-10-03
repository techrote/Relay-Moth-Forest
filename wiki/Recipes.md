# Modding Recipes

These are practical “I want to change X” examples.

## Change the opening story

File:

```text
relay_moth_story.json
```

Find the room with:

```json
"key": "quiet_nest"
```

Edit `title`, `subtitle`, `intro`, `prompt` and/or `complete_line`.

No asset rebuild is required.

## Make Tin Stream much grassier

Preferred method:

1. launch locally;
2. go to Tin Stream;
3. F2;
4. open **GRASS FX**;
5. add several clumps along the bank;
6. save to project.

Hand-edit alternative:

```json
"grass_clumps": [
  {
    "x": 500,
    "y": 180,
    "radius": 28,
    "density": 1.5,
    "seed": 123456
  }
]
```

Keep seeds deterministic and avoid placing every clump directly on water/path/objective cells.

## Add three squirrels

In the target room:

```json
"creature_groups": [
  {
    "id": "my_squirrel_group",
    "kind": "squirrel",
    "count": 3,
    "spawn": [12, 8],
    "seed": 12345
  }
]
```

Or use F2 -> WILDLIFE.

## Add a mini-robot group

```json
{
  "id": "my_mini_group",
  "count": 4,
  "variant": "teal",
  "spawn": [20, 10],
  "seed": 22222,
  "requires": "pip"
}
```

Current variant names are listed in [Robots, Wildlife and Relay Moths](Robots-Wildlife-and-Relay-Moths).

## Move an objective

Do **not** change retained `x_fraction` / `y_fraction` fields to position an objective in v4.15.

Move the map placement instead.

Example:

```json
"objects": {
  "nest_lamp": [23, 8]
}
```

Easier: F2 → OBJECT → select → move, or edit tile coordinates in the inspector. The move ghost and committed tile agree. Persistent story identity is unchanged.

## Add a relay moth pickup

```json
{
  "id": "moth_my_room_bonus",
  "tile": [18, 10],
  "variant": 2,
  "colour_index": 180
}
```

The ID must be globally unique.

## Change default bloom strength

In `game.js`, find `GRAPHICS_DEFAULTS`.

Change:

```js
bloomIntensity:.28
```

to your desired value.

Then use **RESET DEFAULTS** in the graphics menu because previously saved browser settings override code defaults.

## Remove Quiet Nest's transparent moon/stars

Use:

1. F2;
2. S / SELECT;
3. select “Moon / star swirl”;
4. Delete;
5. Save.

Equivalent JSON:

```json
"pattern_exclusions": ["nest:swirl"]
```

## Add explicit ambient art

Use F2 -> **AMBIENT**.

Explicit ambient art is stored as normal `editor_decor`, so it can be moved/copied/deleted later.

## Replace a room's objective effect

Suppose a `lamp` objective should use the beacon effect.

In `relay_moth_effects.json`:

```json
"objective_map": {
  "lamp": "beacon_ping"
}
```

This changes all objectives of that kind unless you change the runtime to select effects more specifically.

## Create a new colour theme

Safest process:

1. duplicate a complete existing theme in `relay_moth_pixel_luts.json`;
2. rename it;
3. add the name to `theme_order`;
4. modify colours with the in-game LUT tools;
5. verify every semantic element still contains 256 valid colours;
6. run self-test.

## Create a simple new room

This is a more advanced mod because room order, transitions and reachability must agree.

At minimum:

1. add a new story room entry with unique `index` and `key`;
2. add a map room with the same key;
3. connect `previous_room` / `next_room`;
4. set transition sides/fractions;
5. add objective definitions;
6. add matching map objective tiles;
7. ensure spawn/objective/exit tiles are reachable;
8. run self-test and fix any route assumptions/tests that intentionally encode the nine-room campaign.

The current regression suite assumes nine rooms, so a true campaign expansion also requires updating the tests to describe the new intended campaign.

## Restore hidden or suppressed artwork

For an objective: F2 → OBJECT → select its hidden handle → SHOW VISUAL. This does not move it or change the story.

For generated decor or `nest:swirl`: SHOW SUPPRESSED → SELECT its ghost → RESTORE. An empty tile-exclusion handle can also be restored. No JSON editing is required; normal generation/reservations still decide what appears.

## Reposition a generated plant

SELECT the plant → CONVERT TO AUTHORED → move/edit the resulting authored item. Conversion is undoable. Its source remains suppressed; restoring the source separately can create overlap with the authored copy.

## Copy a group without duplicating identities

OBJECT-select one wildlife or mini-robot group, Ctrl+C, point to the destination, Ctrl+V. The new selection is one copied group with a fresh ID, not one copy for each spawned actor. Adjust count/seed/spawn in the inspector and use VALIDATE. Robot placements use SELECT; moving one preserves its existing persistent ID.

## Fix an overlap without moving the wrong object

Choose SELECT for decor or OBJECT for gameplay, then Alt+click repeatedly to cycle eligible overlaps. A mixed selection containing immovable content refuses movement. Copy reports skipped unsupported items; it never manufactures a new objective.
