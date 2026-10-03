# Data formats and authority

Relay Moth Forest keeps most content in JSON. The current schemas retain historical names for compatibility.

## `relay_moth_maps.json`

Schema: `relay-moth-maps/v3.99`.

Owns room-space content such as:

- walls/blockers;
- water;
- path cells;
- blocker styles;
- large tree placements;
- objective tile placements;
- bridge geometry/stages;
- decorative robots/lamps;
- grass clumps;
- moth pickups;
- mini-robot groups;
- creature groups;
- editor-authored decoration/exclusions.

The current runtime has nine rooms on a 40×19 grid.

### Important editor fields

Optional fields added by the WYSIWYG editor include:

- `editor_decor`;
- `decor_exclusions`;
- `pattern_exclusions`;
- `object_fx_hidden`.

These are presentation/authoring fields. They do not redefine story objective semantics. Their v4.15 interpretation remains compatible:

- `editor_decor` holds free-position logical-pixel records; `editor_id` is editor identity, not story progression. Optional scale/rotation (`rot`, radians)/flip/alpha/element/tint fields describe authored rendering. Converting generated decor adds an authored record and suppresses its source.
- `decor_exclusions` suppresses generated decoration by tile. Existing `[x, y]` and string `"x,y"` forms are accepted; UI restoration removes matching forms. This is tile-scoped, not an independent deletion of each generated sprite.
- `pattern_exclusions` contains named pattern IDs such as `nest:swirl`; SHOW SUPPRESSED exposes recoverable handles.
- `object_fx_hidden` contains objective IDs whose waypoint visual is hidden. OBJECT retains an editor ghost and SHOW VISUAL removes the flag without moving the objective or changing story completion.

Absent arrays stay optional; opening a map does not mass-add defaults or migrate its schema. Orphan tile-exclusion handles can be restored even when current generation emits nothing there; bridge/objective reservation still wins after restoration.

Persistent `id` on robots/moths/creature groups/mini groups is a save-compatible identity. Moves preserve it; permitted copies receive a globally unused ID. Group `count` describes actors within one logical group, not separate authoring objects. Legacy ID-less entries remain supported. History, selection, validation diagnostics and dirty/save fingerprints are in-memory editor state, not a new serialized map schema.

## `relay_moth_story.json`

Owns:

- room ordering;
- titles/subtitles/story copy;
- objective definitions;
- previous/next sides and transition fractions;
- progression requirements.

Map data places objective IDs; story data defines what those IDs mean.

Do not silently duplicate story rules into map rendering code.

## `relay_moth_pixel_luts.json`

Schema: `relay-moth-luts/v3.99`.

Owns semantic project colours.

Current channel order:

```text
WORLD
BLOCKERS
FOREST
MOTHS
SPARKLES
STORY
EFFECTS
INTERFACE
```

Each semantic element resolves through 256-entry LUTs per theme bank.

Render shaders may shape lighting response, but should not replace semantic palette authority with arbitrary hard-coded theme colours.

## `relay_moth_effects.json`

Schema: `relay-moth-effects/v3.99`.

Owns effect presets and their semantic LUT elements.

Effects are visual. They do not own progression.

## `relay_moth_sprites.json`

Contains the small/legacy runtime sprite definitions used by the basic sprite atlas.

The HD art system is separately described by `hd_remake_atlas.json`.

## `hd_remake_atlas.json`

Current schema: `relay-moth-hd-atlas/v4.14`.

Owns:

- master atlas image paths;
- coordinate-matched material image paths;
- sprite rectangles;
- roles/groups;
- per-region metadata;
- FoliageFX metadata;
- world scale.

Derived material files include colour, height, source-space normal and specular.

## `sprite_sheet_manifest.json`

Describes editable category sheets/regions used by authoring tools.

It is an authoring manifest, not gameplay authority.

## Compatibility rule

A schema/version string is not automatically stale merely because its number is older than the release number.

The project intentionally preserves compatible map/LUT/effect schemas and local-storage keys across releases.

Change a schema only when its contract actually changes and provide a migration path when required.
