# Relay Moth Forest v4.02 — Implementation Record

v4.02 is a renderer-quality point release built on v4.01. It enlarges moving grass/foliage and implements the corrections identified by the sprite-order, clipping, tree-seam and lighting audit in `V402_RENDER_AUDIT.md`.

Implemented changes include stable bottom-Y sorting for ordinary HD world sprites, deterministic root-Y ordering for FoliageFX instances, single-submit tree trunks with foreground-only canopies, complementary static/foreground clipping for tall authored wall blockers, a flat HD foreground clip shader, edge-safe bump normal sampling, sub-pixel overlap for compatibility grass deformation bands, and category-aware foliage display scales that leave flowers unscaled.

No gameplay/collision/story/AI authority moved into the renderer. Existing v4.01 interaction-radius and deformation-strength reductions remain intact.
