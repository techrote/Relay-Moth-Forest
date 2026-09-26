# Relay Moth Forest Modding Guide

Welcome to the **Relay Moth Forest Modding / Customisation Guide**.

This Wiki is for people who want to change the game rather than work on the renderer itself. Most common modifications do **not** require changing WebGL code.

Typical jobs covered here:

- rewrite room introductions, prompts and completion text;
- move or change objectives;
- edit walls, paths and water;
- add/remove trees, lamps and decorative robots;
- add relay moth pickups, wildlife and mini robots;
- make a room more or less grassy;
- change default graphics/lighting settings;
- recolour the game through the LUT system;
- adjust effects;
- test a modified build safely.

## Where to start

If this is your first modification, read **[Getting Started](Getting-Started)**.

Then jump to the part you want:

- [Story and Dialogue](Story-and-Dialogue)
- [Rooms and Maps](Rooms-and-Maps)
- [Changing Default Settings](Default-Settings)
- [Colours and LUTs](Colours-and-LUTs)
- [Sprites and Decoration](Sprites-and-Decoration)
- [Water, Grass and Foliage](Water-Grass-and-Foliage)
- [Robots, Wildlife and Relay Moths](Robots-Wildlife-and-Relay-Moths)
- [Effects](Effects)
- [Testing Your Mod](Testing-Your-Mod)
- [Recipes](Recipes)
- [Reference](Reference)

## The short version

The main editable files are:

| File | What it controls |
| --- | --- |
| `relay_moth_story.json` | room titles, story text, prompts, objective definitions and room order |
| `relay_moth_maps.json` | geometry, water, objective positions, trees, grass, wildlife, moths, mini robots and editor data |
| `relay_moth_pixel_luts.json` | semantic colour themes |
| `relay_moth_effects.json` | visual-effect presets and objective-effect mapping |
| `hd_remake_atlas.json` | sprite names/roles/metadata |
| `game.js` | default settings and advanced behavior that is not data-driven |

For map work, try the built-in **F2 WYSIWYG editor** before hand-editing JSON.

## Local build vs hosted web build

### Local source checkout

Run:

```text
0Play.cmd
```

The local launcher can use **SAVE TO PROJECT** in the F2 editor. It creates a timestamped backup in `editor_backups/` before replacing `relay_moth_maps.json`.

### techrote.github.io build

The hosted build is static. It cannot write back to GitHub. Its editor therefore downloads the modified `relay_moth_maps.json` instead.

## Back up first

Before major changes, keep copies of:

- `relay_moth_maps.json`;
- `relay_moth_story.json`;
- any LUT/effect file you are editing;
- `editor_backups/`.

The game deliberately preserves several historical schema names and browser storage keys. Do not rename them simply because their numbers look old.
