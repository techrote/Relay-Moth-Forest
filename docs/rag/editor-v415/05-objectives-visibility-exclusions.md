# Objectives, visibility and exclusion state

## Current objective deletion behavior

`removeRef(ref)` handles an objective by appending its ID to:

```text
object_fx_hidden
```

It does **not** remove:

- the story objective;
- the map `objects[object_id]` placement;
- the completion requirement.

Therefore progression remains intact.

## What object_fx_hidden actually hides

Current runtime consults `objectFxHidden` in both:

- live incomplete-objective rendering;
- static persistent/completed objective rendering.

So the field suppresses the **objective visual itself**, not merely a waypoint overlay.

Current documentation calling it only a “waypoint visual” is too narrow.

## Hidden objective recovery today

`collectItems()` still enumerates story/map objectives even if hidden, so OBJECT mode can still create a selection box for one.

Moving an objective currently clears its ID from `object_fx_hidden`, which accidentally acts as a restore mechanism.

That is not adequate UX.

## Target objective behavior

Objectives are protected gameplay objects.

Generic right-click decoration removal and ordinary Delete should not silently hide them.

Provide an explicit objective visual operation:

- SHOW VISUAL
- HIDE VISUAL

A hidden objective should remain visible **in editor overlay** as a ghost/dashed handle with a clear label such as:

```text
OBJ rivet_d [VISUAL HIDDEN]
```

Do not add generic objectives to the normal palette in this pass. Creating a real objective requires story + map changes and belongs to a later wizard/task.

## Current pattern exclusion behavior

`patternItems(r)` builds a hidden set from `pattern_exclusions` and simply does not return excluded objects.

Therefore once a pattern object is hidden, there is no editor item left to click to restore it.

Example:

```text
nest:swirl
```

## Current generated-decor exclusion behavior

`decor_exclusions` stores tile coordinates. Excluded generated decor disappears from rendering and ordinary editor targeting.

## Target suppressed-content UI

Add a mode/toggle such as:

```text
SHOW SUPPRESSED
```

When enabled, overlay ghost handles should represent:

- `decor_exclusions`
- `pattern_exclusions`
- `object_fx_hidden`

Each suppressed record must be restorable through UI.

## Convert procedural to authored

A useful v4.15 operation for a selected generated decoration is:

```text
CONVERT TO AUTHORED
```

Expected semantics:

1. suppress/exclude the generated original;
2. create equivalent `editor_decor` with the same sprite/position/scale/visual properties;
3. select the new authored item;
4. allow normal move/scale/rotation/copy/delete.

This provides a clean path from procedural generation to precise hand authoring.
