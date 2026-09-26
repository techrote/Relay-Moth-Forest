# Robots, Wildlife and Relay Moths

## Decorative / recruitable robots

Map field:

```text
decor_robots
```

Example:

```json
{
  "id": "moss_bot",
  "tile": [25, 10],
  "variant": "ivy",
  "facing": "right",
  "name": "Moss Bot"
}
```

### Important distinction: `id`

A robot with an ID can participate in persistent recruited/follower state.

Changing an existing persistent ID can make old saves no longer recognise that robot.

Current full-size robot variants include:

- cream
- headset
- pink
- orange
- ivy
- black
- cyan
- lilac

## Persistent followers

Persistent followers are intentionally casual rather than formation-bound.

Current design:

- comfortable distance roughly 46–104 logical px;
- personal casual targets;
- weak long-distance cohesion;
- loose separation;
- faster catch-up when far away;
- independent stuck recovery.

Their steering constants are code-level settings in `game.js`, not map JSON.

## Mini robots

Map field:

```text
mini_robot_groups
```

Example:

```json
{
  "id": "fern_hollow_mini_v391_0",
  "count": 5,
  "variant": "charcoal",
  "spawn": [30, 9],
  "seed": 49211,
  "requires": "pip"
}
```

### Fields

- `id` — group identity;
- `count` — units in the group;
- `variant` — mini-robot sprite family;
- `spawn` — tile near which the group begins;
- `seed` — deterministic variation;
- `requires` — current content uses `"pip"` to gate groups behind Pip progression.

Current mini-robot variants:

- teal
- pink
- orange
- lilac
- mint
- silver
- charcoal
- sky

Use F2 -> **MINI ROBOTS** to add groups.

## Wildlife

Map field:

```text
creature_groups
```

Example:

```json
{
  "id": "whisper_orchard_wild_0",
  "kind": "squirrel",
  "count": 2,
  "spawn": [11, 5],
  "seed": 39255
}
```

Current creature kinds:

- squirrel
- rabbit
- cat
- pixie
- gnome
- mushroom_pixie

Use F2 -> **WILDLIFE** for ordinary additions.

Wildlife is lightweight ambience. It does not become solid collision.

## Relay moth pickups

Map field:

```text
moth_pickups
```

Example:

```json
{
  "id": "moth_whisper_orchard_a",
  "tile": [17, 5],
  "variant": 5,
  "colour_index": 237
}
```

### Fields

- `id` — persistent unique pickup ID;
- `tile` — pickup tile;
- `variant` — moth visual variant;
- `colour_index` — semantic LUT index.

Every moth ID must be unique across the whole campaign.

If two pickups share an ID, collecting one can make the other appear already collected.

## Adding a new moth safely

1. choose a globally unique ID;
2. place it on a reachable tile;
3. choose an existing variant;
4. choose a colour index 0–255;
5. run `python self_test.py`.

## Save compatibility

Current story state persists sets of:

- completed objective IDs;
- shown room/story IDs;
- moth IDs;
- robot IDs;
- current room.

That is why IDs should be treated as save-compatible identifiers, not cosmetic labels.
