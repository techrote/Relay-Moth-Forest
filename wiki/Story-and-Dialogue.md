# Story and Dialogue

Story data lives in:

```text
relay_moth_story.json
```

Current schema:

```text
relay-moth-story/v3.91
```

The game currently has nine room entries.

## Room entry structure

A story room looks broadly like:

```json
{
  "index": 0,
  "key": "quiet_nest",
  "title": "THE QUIET NEST",
  "subtitle": "A round clearing under sleeping relay branches",
  "intro": [
    "The robot forest has forgotten its morning song.",
    "..."
  ],
  "prompt": "Wake the sleepy relay lamp.",
  "complete_line": "Click! The first light remembers how to glow.",
  "pattern": "nest",
  "previous_room": null,
  "previous_side": null,
  "previous_fraction": 0.5,
  "next_room": 1,
  "next_side": "EAST",
  "next_fraction": 0.54,
  "objects": [
    {
      "object_id": "nest_lamp",
      "kind": "lamp",
      "label": "SLEEPY LAMP"
    }
  ]
}
```

## Text fields

### `title`

Large room heading.

### `subtitle`

Secondary room heading.

### `intro`

Array of story paragraphs shown when entering a room for the first time.

You can add/remove/rewrite paragraphs freely as long as the JSON remains valid.

### `prompt`

The current-room objective prompt.

### `complete_line`

Text displayed when the room objective set is complete.

## Room identity and order

### `index`

The room's numeric campaign position.

### `key`

The important link between story and map data.

For example:

```json
"key": "tin_stream"
```

must correspond to:

```text
relay_moth_maps.json
  -> rooms
     -> tin_stream
```

### `previous_room` / `next_room`

Numeric room links.

### `previous_side` / `next_side`

Gate/transition side. Current content uses values such as:

- `WEST`
- `EAST`
- `NORTH`
- `SOUTH`

### `previous_fraction` / `next_fraction`

Fraction along the relevant room edge used to position transition gates/spawns.

## Objectives

Each story objective has an `object_id`.

That ID is the join key between story and map placement.

Example story definition:

```json
{
  "object_id": "lane_a",
  "kind": "lantern",
  "label": "LANTERN ONE"
}
```

Example map placement:

```json
"objects": {
  "lane_a": [9, 5]
}
```

If you rename `lane_a` in only one file, the objective will no longer line up correctly.

## Current objective kinds

The current HD objective roles include:

| Story `kind` | Default visual |
| --- | --- |
| `lamp` | orange lamp |
| `lantern` | pink lamp |
| `rivet` | cyan orb |
| `pip` | cream robot |
| `beacon` | green orb |
| `bell` | wide candelabra |
| `star` | blue orb |
| `dawn` | purple orb |

Objective kinds also map to effect presets in `relay_moth_effects.json`.

## Important current-runtime note

The story JSON still contains `x_fraction`, `y_fraction` and `required` fields on objective definitions.

In the current v4.14 runtime, objective world placement comes from `relay_moth_maps.json -> rooms -> <room> -> objects`, and `game.js` does not read those three story fields.

Treat them as retained/historical metadata unless you deliberately change the runtime to use them.

## Worked example: change the opening objective

Suppose you want the opening task to read “Restart the copper lamp.”

Change:

```json
"prompt": "Restart the copper lamp."
```

You can also change:

```json
"label": "COPPER RELAY"
```

without moving it.

To move it, edit `quiet_nest.objects.nest_lamp` in the map file or use F2 -> OBJECT -> move.

## Adding another objective

Adding an objective is more than adding story text.

You need:

1. a unique `object_id` in the story room;
2. a supported `kind` (or code/role support for a new one);
3. a corresponding tile in the map room's `objects` dictionary;
4. a reachable position;
5. progression/room-completion testing.

Room completion is currently:

```text
all story-room object_ids are present in the completed set
```

So adding another story objective makes it required for room completion.

Run `python self_test.py` after changing objective count/order.
