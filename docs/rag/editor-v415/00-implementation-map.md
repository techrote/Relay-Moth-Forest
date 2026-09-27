# v4.15 implementation map

## Goal

Turn the current WYSIWYG editor from a capable prototype into a trustworthy primary authoring interface.

The v4.15 pass is **editor reliability + authoring ergonomics**. It is not a renderer rewrite, foliage tuning pass, gameplay redesign, or story-authoring wizard.

## Primary failure classes

The audit found five broad classes of editor risk:

1. **Ambiguous item ownership** — one flat `collectItems()` list is used for all tools; list order becomes implicit hit priority.
2. **Data-integrity hazards** — cross-room undo and identity loss/collision can silently corrupt authored state.
3. **Invisible state** — exclusions and hidden objective visuals disappear without an obvious recovery path.
4. **Weak authoring semantics** — selection/copy/move/paste do not consistently reflect logical objects or final snapped placement.
5. **Excessive rebuild scope** — small edits rebuild the room and reinitialise unrelated ambient simulations.

## Target editor layers

The target model should distinguish at least:

### TERRAIN
- path
- water
- walls/blockers
- large trees

### DECOR
- explicit `editor_decor`
- grass clumps
- lamps
- decorative robots
- generated procedural decor
- room-pattern ambient decor

### GAMEPLAY OBJECTS
- objectives
- relay moth pickups
- recruitable/persistent robots where applicable
- wildlife groups
- mini-robot groups

### STRUCTURAL / PROTECTED
- bridge cells / bridge island / bridge progression geometry
- transition/gate footprints
- any other gameplay geometry that generic random decoration should not occupy

An editor item should describe capabilities explicitly rather than relying on type checks scattered through handlers. Example conceptual shape:

```js
{
  layer: 'decor',
  type: 'procedural-decor',
  id: 'generated:tin_stream:40',
  bbox,
  selectable: true,
  movable: false,
  removable: true,
  copyable: false,
  properties: ...
}
```

The exact API is left to the implementation issue, but tool behavior must no longer be inferred from array order.

## Tool semantics target

### Right click
Decoration removal/suppression only. It must never hide/delete a gameplay object.

### SELECT
Ordinary authored terrain/decor selection.

### OBJECT
Gameplay-object selection.

### ERASE
Erase within the intended tool/layer policy, with explicit protection for structural/gameplay entities.

### MOVE
Move existing editable entities while preserving persistent identity.

## Key v4.15 user-visible outcomes

- Clicking/removing a bush over an objective removes/suppresses the bush, not the objective.
- Generated decor can be targeted as an actual editor item.
- Generated decor does not spawn on reserved bridge/objective surfaces.
- Hidden/suppressed content can be shown and restored from the editor UI.
- Objectives have explicit visible/hidden visual state rather than Delete pretending to remove them.
- One wildlife group is one editor object.
- Undo/redo cannot write one room snapshot into another room.
- Persistent IDs survive moves and copies receive safe new IDs where copying is permitted.
- A property inspector exposes the fields users currently have to edit in JSON.
- Move previews match committed placement.
- Save state is visible and semantic validation reports dangerous authoring mistakes.
- Continuous painting does not unnecessarily reinitialise unrelated ambient systems.

## Compatibility requirement

Existing maps must load without migration. New editor metadata should remain optional. Do not rewrite every room merely to add defaults.
