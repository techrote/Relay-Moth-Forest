# Colours and LUTs

Relay Moth Forest uses semantic colour lookup tables instead of assigning every effect/sprite a fixed theme colour.

Main file:

```text
relay_moth_pixel_luts.json
```

Current schema:

```text
relay-moth-luts/v3.99
```

## Current themes

- Moonlit Copper
- Mint Circuit
- Berry Starlight
- Winter Relay
- Sunrise Tin

## Semantic channels

Current channel order:

1. WORLD
2. BLOCKERS
3. FOREST
4. MOTHS
5. SPARKLES
6. STORY
7. EFFECTS
8. INTERFACE

### WORLD

Current elements:

- `sky`
- `stars`
- `far_forest`
- `ground`
- `path`
- `water`

### BLOCKERS

- `blockers`

### FOREST

- `tree_metal`
- `tree_shadow`
- `tree_lights`
- `robot_faces`

### MOTHS

- `moth_body`
- `moth_wings`

### SPARKLES

- `moth_spark`
- `moon_cursor`

### STORY

- `discoveries`

### EFFECTS

- `fx_pulse`
- `fx_magic`
- `fx_water`
- `fx_portal`
- `fx_objective`
- `fx_teleport`
- `fx_creature`

### INTERFACE

- `ui`

## Use the in-game tools when possible

Useful controls:

- **U** — LUT mixer;
- **F3** — Colour Lab;
- **F4** — advanced LUT editor.

These are better for experimentation than manually editing hundreds of colour entries.

## Why LUT entries have 256 colours

Each semantic element contains a 256-entry gradient/palette for each theme.

Runtime code asks for a semantic element plus an index.

Example conceptual lookup:

```text
fx_magic @ index 235
```

Changing that part of a theme can recolour multiple effects consistently without changing their shader code.

## Changing one room's overall mood

The runtime channel mixer can assign theme banks per channel.

For example, you can keep WORLD on Moonlit Copper while switching EFFECTS to Berry Starlight.

For permanent defaults, edit the corresponding channel/theme data in `relay_moth_pixel_luts.json`.

## Adding a new theme

A proper new theme needs a complete LUT for every semantic element expected by the runtime.

Safest workflow:

1. duplicate an existing complete theme;
2. give it a new unique name;
3. change colours using the LUT tools;
4. ensure every existing semantic element still has 256 valid `#RRGGBB` entries;
5. add the theme name to `theme_order`;
6. run `python self_test.py`.

Do not add a half-complete theme with missing semantic elements.

## Bright colour is not emissive by default

Physical foliage and ordinary sprite art can be bright while remaining non-emissive.

Use LUT colour to control pigment/theme colour and use actual lighting/effect settings for glow.
