# Data formats and authority

Relay Moth Forest keeps most content in JSON. The current schemas retain historical names for compatibility.

## \`relay_moth_maps.json\`

Schema: \`relay-moth-maps/v3.99\`.

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

- \`editor_decor\`;
- \`decor_exclusions\`;
- \`pattern_exclusions\`;
- \`object_fx_hidden\`.

These are presentation/authoring fields. They do not redefine story objective semantics.

## \`relay_moth_story.json\`

Owns:

- room ordering;
- titles/subtitles/story copy;
- objective definitions;
- previous/next sides and transition fractions;
- progression requirements.

Map data places objective IDs; story data defines what those IDs mean.

Do not silently duplicate story rules into map rendering code.

## \`relay_moth_pixel_luts.json\`

Schema: \`relay-moth-luts/v3.99\`.

Owns semantic project colours.

Current channel order:

\`\`\`text
WORLD
BLOCKERS
FOREST
MOTHS
SPARKLES
STORY
EFFECTS
INTERFACE
\`\`\`

Each semantic element resolves through 256-entry LUTs per theme bank.

Render shaders may shape lighting response, but should not replace semantic palette authority with arbitrary hard-coded theme colours.

## \`relay_moth_effects.json\`

Schema: \`relay-moth-effects/v3.99\`.

Owns effect presets and their semantic LUT elements.

Effects are visual. They do not own progression.

## \`relay_moth_sprites.json\`

Contains the small/legacy runtime sprite definitions used by the basic sprite atlas.

The HD art system is separately described by \`hd_remake_atlas.json\`.

## \`hd_remake_atlas.json\`

Current schema: \`relay-moth-hd-atlas/v4.14\`.

Owns:

- master atlas image paths;
- coordinate-matched material image paths;
- sprite rectangles;
- roles/groups;
- per-region metadata;
- FoliageFX metadata;
- world scale.

Derived material files include colour, height, source-space normal and specular.

## \`sprite_sheet_manifest.json\`

Describes editable category sheets/regions used by authoring tools.

It is an authoring manifest, not gameplay authority.

## Compatibility rule

A schema/version string is not automatically stale merely because its number is older than the release number.

The project intentionally preserves compatible map/LUT/effect schemas and local-storage keys across releases.

Change a schema only when its contract actually changes and provide a migration path when required.
