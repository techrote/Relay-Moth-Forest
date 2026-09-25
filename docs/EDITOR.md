# WYSIWYG editor

Press **F2** to edit directly on the normal rendered game view.

There is no separate miniature map canvas. The rendered room remains the visual reference while gameplay simulation is suspended and the editor owns pointer input.

## Core controls

| Action | Control |
| --- | --- |
| Brush | B |
| Select / area select | S |
| Object select | O |
| Move selection | V |
| Erase | E |
| Hide/show editor chrome | Tab |
| Delete selection | Delete / Backspace |
| Copy / paste | Ctrl+C / Ctrl+V |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Close editor | Esc / F2 |

Left click paints/selects/drags according to the active tool.

Right click removes the topmost authored decoration under the pointer. Where the visible decoration is procedural, the editor can store an exclusion instead.

## Palette

The palette is built from the runtime atlas/roles so its thumbnails match the game art.

Current categories:

- Tiles;
- Blockers;
- Trees;
- Decor;
- Grass FX;
- Lamps;
- Robots;
- Moths;
- Wildlife;
- Mini Robots;
- Ambient.

## Object mode

**OBJECT** mode prioritises gameplay/ambient objects instead of ordinary terrain/grass.

Selectable object classes include:

- objective waypoint visuals;
- relay moth pickups;
- wildlife spawn groups;
- mini-robot groups;
- procedural ambient/pattern decoration.

Moving an objective changes its map placement. Deleting an objective editor item hides its waypoint visual rather than deleting the story definition.

### Quiet Nest moon/stars

The large transparent moon/star swirl is the procedural \`nest:swirl\` object.

To remove it:

1. F2;
2. O / OBJECT;
3. select **Moon / star swirl**;
4. Delete or right click;
5. Save to Project.

The exclusion is stored in \`pattern_exclusions\`.

## Live preview

Every editor mutation updates the in-memory map and rebuilds the current Room.

Renderer caches are invalidated using geometry-sensitive identities. Moving a grass clump or replacing a water cell must refresh rendering even when the number of objects has not changed.

Editor mode does **not** apply a dimming/desaturation filter to the game canvas. What you see underneath the editor chrome is the normal renderer.

## Authored editor fields

### \`editor_decor\`

Explicit free-position static decoration.

Example:

\`\`\`json
{
  "editor_id": "decor_1",
  "x": 320,
  "y": 160,
  "sprite": "foliage_v401_ground_r0c0",
  "scale": 1.0,
  "flip": false
}
\`\`\`

### \`decor_exclusions\`

Tile positions where generated non-authoritative decoration is suppressed.

### \`pattern_exclusions\`

IDs of room-pattern ambient objects to omit, such as \`nest:swirl\`.

### \`object_fx_hidden\`

Objective IDs whose waypoint visual is hidden while retaining gameplay/story authority.

These fields are optional. Existing rooms do not require migration.

## Save behavior

**SAVE TO PROJECT** sends the current maps object to:

\`\`\`text
POST /__editor/save_maps
\`\`\`

The localhost server:

- validates the map schema/rooms object;
- caps payload size;
- creates \`editor_backups/relay_moth_maps-<timestamp>.json\`;
- writes a temporary file;
- atomically replaces \`relay_moth_maps.json\`.

**DOWNLOAD JSON** is the fallback when the localhost save endpoint is unavailable.

## Input ownership

Editor pointer ownership is deliberately isolated from gameplay input.

The editor DOM toolbar/palette sits above the canvas interaction overlay. Pointer capture is only acquired for valid world-edit gestures and is explicitly released.

Do not route normal gameplay world movement through editor pointer code.
