# Properties, selection, copy and move reference

## Current editable data shapes

### editor_decor

Common fields:

```text
editor_id
x / y                    logical pixels
sprite
scale
alpha
flip
rot
element                   optional semantic LUT element
tint_strength             optional
```

### grass_clumps

```text
x / y                    logical pixels
radius
density
seed
```

### decor_lamps

```text
tile [x,y]
lamp
base                      may exist in map data
```

### decor_robots

Common current fields include:

```text
id                        optional persistent identity
tile
variant
facing
name
```

### moth_pickups

```text
id
tile
variant
colour_index
```

### creature_groups

```text
id
kind
count
spawn
seed
```

### mini_robot_groups

```text
id
variant
count
spawn
seed
requires                  used by current content
```

### objectives

Story-owned:
- object_id
- kind
- label/text/progression definition

Map-owned:
- objects[object_id] = tile

Editor must not pretend those are one ordinary palette sprite.

## Current move preview mismatch

`renderOverlay()` previews MOVE using raw pointer pixel `dx/dy` for every selected item.

But `applyMove()` rounds tile-backed objects to:

```js
tdx=Math.round(dx/TILE)
tdy=Math.round(dy/TILE)
```

Therefore tile objects can visibly preview somewhere different from the committed location.

Target:
- pixel objects preview continuous movement;
- tile objects preview the exact snapped tile delta that commit will use.

## Current move visualization

Move preview outlines only bounding rectangles. A stronger UX is to ghost actual sprites/handles where practical.

## Current paste behavior

`pasteClipboard()` clears selection, creates copies, then leaves nothing selected.

Target: newly pasted items should become the current selection so the user can immediately move/delete/edit them.

## Objective copy inconsistency

`copySelectionData()` emits objective clipboard entries.

`pasteDataItem()` has no objective paste case.

Therefore an objective can appear copyable but paste silently does nothing.

Target for v4.15:
- mark objectives non-copyable in item capabilities;
- refuse/skip with explicit feedback;
- do not create partial objective definitions in this pass.

## Selection scope target

SELECT should focus on terrain/decor authoring.

OBJECT should focus on gameplay objects.

The two tools may share generic selection machinery but must not differ only by a loose boolean filter.

## Overlap cycling

After layer scoping, provide a deterministic way to select multiple eligible overlapping items, e.g.:

- Alt+click; or
- repeated click at same point.

Status can indicate:

```text
3 items under cursor · 1/3 · procedural decor foliage_mix_02
```

Do not make ordinary single-click unpredictably cycle.

## Property inspector target

When exactly one item is selected, expose the fields appropriate to that item type.

Inspector edits should:
- validate numeric ranges;
- preserve persistent IDs on move;
- create one undo transaction per committed property edit;
- rebuild only required subsystems;
- clearly mark read-only fields.

Recommended objective inspector:
- object_id read-only
- kind read-only
- story label read-only
- tile editable
- visual visible toggle
