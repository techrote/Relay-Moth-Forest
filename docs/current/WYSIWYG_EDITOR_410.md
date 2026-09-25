# Relay Moth Forest v4.10 — WYSIWYG Room Editor

Press **F2** to switch the normal game view into authoring mode. The game canvas remains the visual truth; the editor uses a transparent interaction/selection canvas over the same 640×360 view rather than opening a separate miniature map.

## Mouse workflow

- **Brush / B** — left-click paints the selected palette item directly into the room. Dragging paints continuously where appropriate.
- **Right click** — removes the topmost editable authored item under the pointer. If the visible decoration is procedural rather than authored, the tile is added to `decor_exclusions`, suppressing procedural decoration there.
- **Select / S** — click an item to select it, or drag empty space to area-select multiple items.
- **Move / V** — drag the current selection. Tile-backed items snap by tile; free-position decorations and GrassFX clumps move in logical-pixel space.
- **Ctrl+C / Ctrl+V** — copies the current selection and pastes it at the current mouse position.
- **Delete / Backspace** — deletes the current selection.
- **Ctrl+Z / Ctrl+Y** — editor undo/redo.

## Palette

The palette is sourced from the shipping HD atlas and runtime roles, so the preview thumbnails use the same sprite data as the game. Categories are:

- Tiles — path, water, solid, clear.
- Blockers — authored blocker sprite variants with collision.
- Trees — large split tree families with matching wall/blocker authority.
- Decor — explicit static sprite decoration stored in `editor_decor`.
- Grass FX — authored moving GrassField/FoliageFX clumps with light/normal/dense/lush presets.
- Lamps — explicit mounted lamp placements.
- Robots — decorative/recruitable robot variants (new editor-painted robots default to decoration without a progression ID).

## Live preview

Every edit updates the in-memory `relay_moth_maps.json` structure, rebuilds the current `Room`, and invalidates/rebuilds the static background, water/GrassField descriptors, and FoliageFX descriptor. Gameplay simulation is suspended while edit mode owns the mouse, but the normal renderer continues to present the edited room.

## Save behavior

**SAVE TO PROJECT** uses the localhost Python launcher endpoint `POST /__editor/save_maps`. The server validates a Relay Moth maps JSON object, creates a timestamped backup in `editor_backups/`, and atomically replaces `relay_moth_maps.json`.

**DOWNLOAD JSON** remains available when the project-save endpoint is unavailable (for example if the HTML was not launched through `0Play.cmd`).

## Authoring-only fields introduced

`editor_decor` is an optional array of explicit sprite decorations:

```json
{"editor_id":"decor_1","x":320,"y":160,"sprite":"foliage_v401_ground_r0c0","scale":1.0,"flip":false}
```

`decor_exclusions` is an optional array of tile coordinates that suppresses automatically generated non-authoritative decoration on those tiles:

```json
[[12,8],[13,8]]
```

Both fields are optional; existing rooms require no migration.


## v4.11 input-layer fix

The editor UI stacking context is explicitly above the canvas interaction overlay. Palette/toolbar controls remain DOM-interactive while the canvas owns world editing. Pointer capture is released explicitly at the end of canvas gestures and is never acquired for clicks outside the editable play area.
