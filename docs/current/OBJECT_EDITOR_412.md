# Relay Moth Forest v4.12 — Object-layer editor

## Object Select
Press **O** or click **OBJECT** in the F2 editor. This mode ignores ordinary terrain/grass hit targets and prioritizes gameplay/ambient objects:

- objective waypoint visuals
- relay moth pickups
- wildlife spawn groups
- mini-robot groups
- procedural ambient/pattern decorations

Drag a selected objective, moth, wildlife group or mini-robot group with MOVE exactly like other editor items. Delete/right-click removes moths/wildlife/minis. Deleting an objective editor item hides its waypoint visual while leaving the objective trigger/story definition intact.

## Moon / stars in Quiet Nest
The large transparent crescent-and-stars layer is the procedural `swirl_large` used by the `nest` pattern. It now appears to OBJECT select as **Moon / star swirl** (`nest:swirl`). Select it and press Delete, or right-click it in the editor. The map stores this in `pattern_exclusions`, so it remains removed after **SAVE TO PROJECT**.

You can also add explicit Moon, Moon + star wave, or Star swirl artwork from the **AMBIENT** palette; those are normal authored editor decorations and can be moved/copied/deleted.
