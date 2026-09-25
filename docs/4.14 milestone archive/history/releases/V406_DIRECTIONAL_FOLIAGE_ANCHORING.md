# Relay Moth Forest v4.07 — Directional Lower-Edge Foliage Anchoring

## Intent
The remaining foliage-order artifacts were caused by treating actor contact and occlusion too much like a centered blob. This patch changes the model to align with sprite staging more naturally: use the center point of the lower edge as the occlusion/interactions origin, bias the local overlay in the direction of motion, and handle wide / multi-tile sprites as grouped lower-edge regions instead of a single point.

## Implemented
- `foliageInteractionSources()` now emits bottom-edge-centered actor anchors and lower-body extents.
- `DepthClassifier` CPU overlap/classification now uses the lower-edge anchored source box.
- Foreground foliage overlay is directionally biased using source velocity.
- Wider sprites are handled as 1–3 grouped lower-edge lobes derived from the source span.
- The face-safe lower-body restriction from v4.05 is preserved; the new grouped lobes remain constrained to the lower-body band.

## Result
Ground foliage should now stage more naturally around the player and robot followers: around feet/lower body instead of face/torso, with better behavior when passing through wider or visually multi-tile sprites and less ambiguous clipping on the wrong side of the body.
