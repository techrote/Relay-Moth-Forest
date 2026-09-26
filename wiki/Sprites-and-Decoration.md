# Sprites and Decoration

## Reusing existing sprites

The safest way to add visual detail is to reuse an existing atlas region.

Atlas metadata:

```text
hd_remake_atlas.json
```

Current HD atlas schema:

```text
relay-moth-hd-atlas/v4.14
```

Important role groups include:

- `border_trees`
- `blockers`
- `decor_plants`
- `lamps`
- `moths`
- `followers`
- `objective`
- `tree_blockers`
- `robot_variants`
- `decor_robots`
- `tree_canopies`
- `tree_trunks`
- `mini_robots`
- `creatures`
- `foliage_v391`
- `foliage_v401_*`
- `bridge`

## F2 Decor palette

For ordinary decoration, use F2 -> **DECOR**.

The editor writes explicit decoration into `editor_decor`.

Example:

```json
{
  "editor_id": "decor_42",
  "x": 300,
  "y": 175,
  "sprite": "some_existing_region",
  "scale": 1.0,
  "alpha": 1.0,
  "flip": false,
  "rot": 0
}
```

This is a free-position world decoration.

## Blocker vs decoration

A pretty sprite does not become collision just because it looks solid.

### Decoration

Visual only.

Use `editor_decor` or procedural decor.

### Blocker

Collision authority comes from `walls` plus its style entry in `blocker_styles`.

Example:

```json
"walls": [[1,1]],
"blocker_styles": {
  "1,1": {
    "sprite": "foliage_v391_18",
    "kind": "blocker",
    "lut": "blockers",
    "scale": 1
  }
}
```

## Large trees are special

Large trees are not ordinary decor.

They use split resources:

- background/lower trunk;
- foreground canopy.

That lets the player/robots pass behind the upper tree without drawing the trunk twice.

Use the **TREES** editor category or the `large_trees` map field.

Do not independently edit generated trunk/canopy normal/specular resources.

## Removing procedural decoration

If something visible was generated procedurally, deleting a non-existent explicit object would not normally work.

The editor uses exclusion fields:

### `decor_exclusions`

Suppresses generated decoration at specified tiles.

### `pattern_exclusions`

Suppresses named pattern objects.

Example:

```json
"pattern_exclusions": ["nest:swirl"]
```

## Quiet Nest moon/stars

The big transparent moon/star object is the room-pattern object:

```text
nest:swirl
```

F2 -> OBJECT -> select “Moon / star swirl” -> Delete.

## Adding genuinely new sprite art

That is an asset-pipeline job rather than simple map modding.

The current coordinate-matched material set is:

- `assets/sprite_runtime_atlas.png`
- `assets/sprite_bumpmap.png`
- `assets/sprite_normalmap.png`
- `assets/sprite_specularmap.png`

Use the repository's asset authoring/rebuild process rather than hand-editing only one derived atlas.
