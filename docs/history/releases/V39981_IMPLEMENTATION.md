# Relay Moth Forest v3.998.1 — rooted grass / Floater-FX pass

## Changes

- Copied the v3.998 floaty hero-grass presentation into **Floater-FX**.
- Floater-FX uses the same whole-element translation/rotation motion that made the prior grass look magical, but is recoloured through pink/purple `fx_magic` and `moth_wings` LUT ranges.
- Added `floaterFX` and `floaterStrength` graphics controls.
- Rebuilt hero grass from three chunkier silhouettes: `grassChunk`, `grassFrond`, and `grassBush`.
- Visible grass is opaque and non-additive: no glow and no translucent tip overlay.
- Added a three-band rooted deformation mesh. The bottom ~34% remains fixed; middle and upper bands progressively receive wind sway.
- Added a bounded 40 px spatial grid for moving actor depth tests.
- On vertical actor approaches, overlapping grass is promoted to the foreground regardless of up/down direction.
- On lateral/slow approaches, front/back ordering uses grass root Y against the actor sprite bottom Y.
- Added a dedicated foreground grass batch and a dedicated foreground-HD batch. Front grass is drawn after moving actors, while tall tree/scenery occluders remain above front grass.
- Retained the underlying instanced GPU GrassField as the fine background layer.
- Graphics settings migrate from `relayMothGraphics3998` to `relayMothGraphics39981`.
