# WYSIWYG editor — v4.15

Press **F2** to edit on the normal rendered game canvas. Gameplay simulation is suspended while the editor owns pointer input. There is no separate mini-map editor and no dimming/desaturation filter on the game view. Normal gameplay movement remains keyboard/gamepad-driven.

## Controls and layers

| Action | Control / scope |
| --- | --- |
| Brush | B; choose an atlas-backed palette entry, then paint with left click |
| Select / box select | S; authored terrain and decoration, including generated/pattern decor |
| Object / box select | O; objectives, relay moths, wildlife and mini-robot groups |
| Add/remove a selection member | Shift+click in the active selection scope |
| Cycle overlapping items | Alt+click repeatedly in SELECT or OBJECT; only eligible items participate |
| Move selection | V, or drag an already-selected movable item |
| Erase | E; terrain/decor only |
| Remove decoration | Right click; decor only, never objective/gameplay deletion or hiding |
| Remove selected removable items | Delete / Backspace; respects each item's capabilities |
| Copy / paste | Ctrl+C / Ctrl+V (also Command on supported platforms) |
| Undo / redo | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z; room-local history |
| Hide/show editor chrome | Tab or HIDE UI; Tab restores the toolbar/palette |
| Cancel current edit | Escape; cancels an active gesture or inspector edit before closing |
| Close editor | F2; Escape when no edit is active |

The item policy distinguishes **terrain**, **decor**, **gameplay** and **structural/protected** capabilities. Full-size decorative/recruitable robot placements are in SELECT's decor scope, even when they carry persistent IDs. OBJECT is not the tool for room-pattern art. Protected structural geometry is not a generic movable/copyable object; terrain painting is not a guarantee of safe bridge/gate editing, so validate layout changes.

The palette contains Tiles, Blockers, Trees, Decor, Grass FX, Lamps, Robots, Moths, Wildlife, Mini Robots and Ambient. There is deliberately **no objective-creation palette**: story definitions remain external data.

## Hidden and suppressed content

**Objectives:** use OBJECT, select the objective, then **HIDE VISUAL** or **SHOW VISUAL** (also the inspector's visual-visible checkbox). A hidden visual retains a labelled editor ghost/handle and the same map placement, ID and story authority. Delete does not hide or remove an objective; Copy does not duplicate one. Showing it never requires moving it.

**Generated decor:** use SELECT or right click to target the actual generated item. Removal records a tile exclusion instead of deleting a story object. Its inspector offers **HIDE** and **CONVERT TO AUTHORED**. Conversion suppresses the generated source and adds one explicit `editor_decor` record that can be moved/copied/edited; it is undoable. Restoring that source later does not delete the authored copy, so check for overlap.

**Suppressed generated/pattern art:** enable **SHOW SUPPRESSED**, use SELECT on the ghost/handle, then **RESTORE**. Tile-exclusion handles remain available even when no generated descriptor currently occupies the tile. Restoration removes the exclusion; normal reservation/generation rules still apply, so restoring an empty/reserved tile does not promise a new plant.

**Quiet Nest moon/stars:** the named pattern is `nest:swirl` (Moon / star swirl). Use F2 → SELECT → select the pattern → Delete (or right click). To recover it, SHOW SUPPRESSED → SELECT its ghost → RESTORE. Patterns cannot be moved or copied; the Ambient palette adds separate authored artwork when free placement is needed.

Generic procedural decoration avoids bridge cells, bridge islands, exact objective tiles and reserved transition footprints. This is shared editor/static-painter generation policy, not a change to Tin Stream water, bridge progression or collision authority. It does not automatically remove explicitly authored decoration.

## Move, copy and identity

Tile-backed objects use the same snapped/clamped movement plan for the ghost and the committed tile. Free-position decor and grass retain logical-pixel coordinates. Group movement preserves relative offsets within the applicable bounds. A selection containing an immovable item refuses the entire move rather than silently moving a subset.

Copy reports unsupported/skipped types. Objectives, generated decor and room patterns are not copyable; convert generated decor first. Paste selects the newly created items. It never creates a second story objective as a side effect.

Persistent robot IDs survive moves, as do their other authored fields. New/copy IDs for persistent robots, moths, wildlife and mini-robot groups are allocated against all rooms and persistent types. One wildlife/mini-robot group is one editor item, regardless of its actor count; copying it creates one logical group. Legacy entries without IDs are not rewritten merely by opening or selecting the editor.

## Property inspector

Select one supported item to see typed controls. Multiple selection shows a summary rather than misleading single-item fields.

| Item | Editable properties |
| --- | --- |
| Authored decor | sprite, pixel x/y, scale, rotation in radians, flip, alpha, semantic element, tint strength |
| Grass clump | pixel x/y, radius, density, seed |
| Lamp | tile x/y, lamp sprite; base only when that field already exists |
| Full-size robot | tile x/y, variant, facing, name; persistent ID is read-only |
| Relay moth | tile x/y, variant, colour index; ID is read-only |
| Wildlife group | spawn tile, kind, count, seed; ID is read-only |
| Mini-robot group | spawn tile, variant, count, seed, requires; ID is read-only |
| Objective | map tile and visual visibility; story ID/kind/label are read-only |
| Generated/suppressed content | source/identity information and explicit hide/convert/restore actions |

Terrain/blocker/tree items do not gain arbitrary property fields. Numeric input is bounded, but field bounds alone are not semantic validation: for example, a zero-count group or an unknown sprite/variant still needs correction in **VALIDATE**.

Field input previews live. Enter or leaving the field commits the transaction; Escape restores the pre-edit value. A sequence of input events in one field is one undo step. Text-entry keys do not trigger canvas tools.

## Transactions and live updates

History is keyed by room, with up to 48 undo entries per room. Room changes cancel an unfinished gesture in its owning room and clear selection/pointer context; Undo in the new room cannot apply the old room's snapshot. Pointer cancellation and Escape restore the pre-gesture room data and release pointer capture. Closing the editor cancels an unfinished edit rather than committing it accidentally.

Mutations update the same in-memory map used by gameplay. Invalidation is coalesced per animation frame and flushed at transaction, room-change and persistence boundaries. Static decor, foliage, wildlife, mini robots, objects and terrain have separate refresh scopes. Terrain changes refresh dependent static/water/foliage geometry; unrelated edits do not restart unrelated ambient simulations. Same-count water/grass edits still invalidate geometry-sensitive caches.

## Validation and dirty state

**VALIDATE** opens deterministic errors/warnings with codes, room and item references. The shared validator checks duplicate persistent IDs, story/map objective joins and approachability, coordinates, sprite/variant references, malformed groups, bridge/gate integrity and stale hidden/suppressed metadata. It is not a complete route/GPU proof; also run the repository tests.

The toolbar shows **CLEAN**, **DIRTY PROJECT**, or **DIRTY PROJECT/ROOM**, plus error/warning counts. Clean means map data matches the loaded/saved/exported baseline, not that the map has no validation errors. Undo back to the baseline becomes clean; Redo away from it becomes dirty. Switching rooms does not mark changes saved. The browser receives a before-unload warning request when the project is dirty.

## Save and export

**SAVE TO PROJECT** sends the complete maps object to `POST /__editor/save_maps`. The localhost server bounds the payload, checks the map schema/room shape, backs up the old file to `editor_backups/relay_moth_maps-<timestamp>.json`, writes a temporary file and atomically replaces `relay_moth_maps.json`. The Python endpoint performs structural checks; semantic diagnostics are the editor/shared-JavaScript validator's responsibility.

Errors stop the first Save/Download attempt and expose **SAVE ANYWAY** or **DOWNLOAD ANYWAY** for explicit recovery. That acknowledgement belongs to the unchanged map fingerprint and action; editing again invalidates it. Warnings are shown without blocking. Prefer fixing errors to overriding them. A failed save leaves the dirty baseline unchanged and offers Download JSON; it does not silently export or claim success.

**DOWNLOAD JSON** is the explicit fallback for a hosted/static build. The editor marks an issued download as its clean exported baseline, but cannot verify the browser's eventual download destination or completion. Downloading does **not** write the project file: keep the file and replace the local map deliberately. Successful project saves establish the saved baseline. Active pointer gestures are cancelled and field edits are committed before validation/persistence.

## Optional metadata and compatibility

`editor_decor`, `decor_exclusions`, `pattern_exclusions` and `object_fx_hidden` remain optional. Existing v4.14 maps load without migration. Map schema/storage/material version numbers are not release labels; see [Data formats](DATA_FORMATS.md). The audited starting point and implementation provenance remain in [editor-v415 RAG](rag/editor-v415/README.md); this page describes the shipped implementation.
