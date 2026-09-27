# Current v4.14 editor contract

## Entry point

`editor.js` defines one `WysiwygEditor` attached through:

```js
root.setupWysiwygEditor(game)
root.toggleWysiwygEditor()
```

F2 toggles it from `game.js`.

The editor overlays the normal 640×360 game view. The playable world is 640×304; editor pointer gestures outside `PLAY_H=304` are rejected.

## Current tools

Toolbar:

- BRUSH
- SELECT
- OBJECT
- MOVE
- ERASE

Keyboard:

- B brush
- S select
- O object
- V move
- E erase
- Tab hide/show chrome
- Delete/Backspace delete selection
- Ctrl+C / Ctrl+V copy/paste
- Ctrl+Z / Ctrl+Y undo/redo
- Escape cancel active drag or close editor

## Current palette categories

- tiles
- blockers
- trees
- decor
- grass
- lamps
- robots
- moths
- wildlife
- mini
- ambient

Palette entries are generated from runtime atlas roles.

## Current right-click path

`onDown()` does:

```js
if(e.button===2){
  this.beginTransaction('remove decoration');
  this.dragMode='eraseDecor';
  this.eraseAt(p,true);
  return
}
```

Current `eraseAt(p, decorOnly)` calls:

```js
const hit=this.hitAt(p,!decorOnly)
```

For `decorOnly=true`, that only means `includeTiles=false`. It does **not** filter the item layer to decoration. Objectives, moths, wildlife, mini robots and room-pattern objects remain eligible.

If no hit is returned, right-click adds a tile to `decor_exclusions`.

## Current collectItems ordering

Current `collectItems()` pushes items in this order:

1. wall/blocker/tree
2. water
3. path
4. `editor_decor`
5. `grass_clumps`
6. `decor_lamps`
7. `decor_robots`
8. objectives
9. relay moth pickups
10. wildlife — one editor ref per currently rendered animal
11. mini-robot groups
12. procedural room-pattern items

`hitAt()` filters matching bounding boxes and returns the **last matching item**.

Therefore array insertion order is implicit editing priority.

## Current objective hit box

For each story objective, the editor starts from the sprite bbox and then expands it:

```js
bb.y0=Math.min(bb.y0,y-46)
bb.x0=Math.min(bb.x0,x-28)
bb.x1=Math.max(bb.x1,x+28)
```

This makes the invisible objective editor target much larger than the visible sprite and is one reason nearby decor becomes difficult to target.

## Current item mutation behavior

### Terrain/blocker/tree/path/water
Stored in tile arrays and blocker/tree metadata.

### Explicit decor
Stored in `editor_decor`.

### Grass
Stored in `grass_clumps`.

### Lamps
Stored in `decor_lamps`.

### Decorative robots
Stored in `decor_robots`.

### Moths
Stored in `moth_pickups`.

### Wildlife
Stored in `creature_groups`.

### Mini robots
Stored in `mini_robot_groups`.

### Pattern objects
Delete adds ID to `pattern_exclusions`.

### Objectives
Delete adds objective ID to `object_fx_hidden`.

## Current live preview

Every mutation calls `rebuildRoom()`, which reconstructs `Room`, forces background rebuild, then reinitialises creatures and mini robots.

The v4.14 browser regression checks that same-count grass and water edits invalidate their renderer caches.

## Existing useful behavior to preserve

- editor DOM sits above the pointer-owning canvas overlay;
- toolbar/palette input remains interactive after palette selection;
- pointer capture is acquired only for valid world gestures;
- pointer capture is explicitly released on normal pointer-up;
- Tab can restore hidden editor chrome;
- editor mode does not dim/filter the game canvas;
- palette ghost geometry was corrected in v4.14 to match runtime size/anchor.
