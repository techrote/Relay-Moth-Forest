# Getting Started

## 1. Work from a local clone

For serious modding, clone/download the main repository rather than editing the GitHub Pages mirror.

The normal launcher is:

```text
0Play.cmd
```

or manually:

```text
python relay_moth_server.py
```

The game expects a WebGL2-capable browser.

## 2. Decide whether the change is data, art or code

### Usually data-only

These generally need no asset rebuild:

- story/dialogue;
- objective names and order;
- objective positions;
- walls/paths/water;
- existing tree/blocker placements;
- grass clumps;
- relay moth pickups;
- wildlife groups;
- mini-robot groups;
- existing ambient/decor sprites;
- LUT colours;
- effect preset parameters.

### Usually asset-pipeline work

These need the sprite authoring tools:

- adding genuinely new HD sprites;
- changing source sprite artwork;
- changing source material/normal/specular generation;
- editing derived tree split resources.

See the repository developer docs for those tasks.

### Usually code work

These are not currently external JSON settings:

- follower steering constants;
- collision algorithm;
- animation logic;
- how objectives activate;
- renderer ordering;
- default graphics values.

## 3. Use F2 for room layout first

Press **F2**.

Useful editor shortcuts:

| Key | Tool |
| --- | --- |
| B | brush |
| S | select / box select |
| O | object select |
| V | move selection |
| E | erase |
| Tab | hide/show editor chrome |
| Delete | remove selection |
| Ctrl+C / Ctrl+V | copy/paste |
| Ctrl+Z / Ctrl+Y | undo/redo |

The editor palette includes tiles, blockers, trees, decor, Grass FX, lamps, robots, moths, wildlife, mini robots and ambient objects.

Use **OBJECT** mode when you want to select objectives, moths, wildlife, mini robots or procedural ambient items instead of terrain.

## 4. Save safely

Local launcher:

- **SAVE TO PROJECT** writes `relay_moth_maps.json`;
- the old map is backed up to `editor_backups/`.

Hosted GitHub Pages build:

- **SAVE / DOWNLOAD MAP** downloads the JSON;
- copy that file into a local source checkout if you want to continue from it.

## 5. Know what browser saves can hide

Graphics preferences are stored in browser `localStorage`. Changing the defaults in `game.js` does **not** override an existing saved preference automatically.

Current primary graphics key:

```text
relayMothGraphics400
```

Current story/progression key:

```text
relayMothForestPretty394
```

Prefer the in-game **RESET DEFAULTS** and save-reset controls when testing. See [Changing Default Settings](Default-Settings) and [Testing Your Mod](Testing-Your-Mod).

## 6. Validate before calling it done

At minimum:

```text
python self_test.py
```

If you edited JSON by hand, this is especially useful because it checks route/progression and many map assumptions that a JSON parser alone cannot catch.
