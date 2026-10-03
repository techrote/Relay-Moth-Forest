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

In v4.15, **SELECT** targets terrain, decor, full-size robot placements and generated/pattern art. **OBJECT** targets objectives, moths, wildlife and mini-robot groups. Alt+click cycles overlapping items within that scope. Right click only removes/suppresses decor, never a gameplay objective.

Select one supported item to edit its properties in the inspector. Enter or leaving a field commits; Escape cancels an unfinished field/gesture. Undo/redo is room-local. Existing persistent IDs are read-only and survive moves; copyable persistent objects get fresh IDs. Objectives and patterns are not copyable; generated decor can first be converted to authored decor.

Use OBJECT → HIDE VISUAL / SHOW VISUAL for objectives. For removed generated or pattern art, SHOW SUPPRESSED → SELECT the ghost → RESTORE. No coordinate trick or hand-edited exclusion is needed.

## 4. Save safely

Local launcher:

- **SAVE TO PROJECT** writes `relay_moth_maps.json`;
- the old map is backed up to `editor_backups/`.

Hosted GitHub Pages build:

- use **DOWNLOAD JSON** explicitly; SAVE TO PROJECT reports that its endpoint is unavailable;
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

## Read the save indicator

Use **VALIDATE** before saving. Errors expose diagnostics and stop the first Save/Download attempt; fix them rather than routinely using SAVE ANYWAY / DOWNLOAD ANYWAY. Warnings are shown without blocking. CLEAN means the map matches its loaded/saved/exported baseline, not that validation found no errors. Undo to that baseline becomes clean; switching rooms does not save.

A successful project save marks the map clean. Download JSON also marks an exported baseline clean, but does not write the project file or confirm that your browser retained the download. Keep the downloaded file and install it deliberately. Failed saves do not clear dirty state.
