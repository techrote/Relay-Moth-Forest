# Reference

This page is a quick lookup for common current v4.14 values.

## Files

| File | Authority |
| --- | --- |
| `relay_moth_story.json` | campaign story/objective definitions |
| `relay_moth_maps.json` | room geometry and authored world content |
| `relay_moth_pixel_luts.json` | semantic colour themes |
| `relay_moth_effects.json` | effect presets/mapping |
| `relay_moth_sprites.json` | small/legacy sprite-grid definitions |
| `hd_remake_atlas.json` | HD sprite regions, roles and metadata |
| `game.js` | gameplay orchestration and defaults |

## Current room keys

- `quiet_nest`
- `lantern_lane`
- `tin_stream`
- `fern_hollow`
- `home_loop`
- `whisper_orchard`
- `star_battery`
- `dawn_tree`
- `morning_garden`

## Current objective kinds

- `lamp`
- `lantern`
- `rivet`
- `pip`
- `beacon`
- `bell`
- `star`
- `dawn`

## Full-size robot variants

- cream
- headset
- pink
- orange
- ivy
- black
- cyan
- lilac

## Mini-robot variants

- teal
- pink
- orange
- lilac
- mint
- silver
- charcoal
- sky

## Wildlife kinds

- squirrel
- rabbit
- cat
- pixie
- gnome
- mushroom_pixie

## Lamp/decor light roles

Current lamp role list includes:

- lamp_blue
- lamp_pink
- lamp_orange
- lantern_cluster
- lantern_blue
- lantern_cyan
- candelabra_wide
- candelabra_small

## Current LUT themes

- Moonlit Copper
- Mint Circuit
- Berry Starlight
- Winter Relay
- Sunrise Tin

## Current semantic LUT channels

- WORLD
- BLOCKERS
- FOREST
- MOTHS
- SPARKLES
- STORY
- EFFECTS
- INTERFACE

## Editor-only / editor-created fields

- `editor_decor`
- `decor_exclusions`
- `pattern_exclusions`
- `object_fx_hidden`

## Persistent browser keys

Primary current keys:

```text
relayMothForestPretty394
relayMothGraphics400
```

The runtime intentionally reads older keys as migration sources.

## Foliage limits

Readable FoliageFX:

- hard instance cap: 208;
- interaction-source cap: 8.

Fine GrassField:

- quality 1: 480;
- quality 2: 1500;
- quality 3: 3000;
- quality 4: 4600.

Water:

- ripple hard cap: 12.

## Coordinate systems

### Gameplay tile

```text
16 logical px
40 × 19 grid
```

### Logical scene

```text
640 × 360
```

### Playable world

```text
640 × 304
```

### Free-position editor decoration

Uses logical-pixel `x` / `y`, not tile coordinates.

## Story fields retained but not consumed by v4.14 objective placement

Current story objectives still contain:

- `x_fraction`
- `y_fraction`
- `required`

Current v4.14 `game.js` does not read those fields. Objective placement comes from the map room's `objects` table.
