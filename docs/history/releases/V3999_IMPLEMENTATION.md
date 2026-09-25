# Relay Moth Forest 3.999 — implementation notes

## Grass art integration
The v3.998.1 rooted-grass mechanics were retained, but the visible geometry was replaced. `renderHeroGrass()` now selects directly from the forest's existing HD foliage/decor vocabulary (`foliage_v391`, `grass_patch`, `leaf_plant`, `foliage_hd_fern`, `foliage_hd_moss`, `foliage_hd_spiral`). Each selected HD sprite is split into four horizontal bands by `addHDRootedGrass()`:

- bottom 38%: zero displacement,
- lower middle: 14% of sway,
- upper middle: 46% of sway,
- top: 82% of sway.

This keeps roots planted while preserving actual painted sprite silhouettes and texture. HD grass is batched separately below or above actors using the existing bounded 40 px actor grid. Foreground trees still occlude both actor and grass layers.

The old fine instanced GrassField remains reusable but `grassFineFX=false` by default. Floater-FX remains available but migrates to OFF.

## Unified shadows
A half-resolution `shadowMask` framebuffer was added. All shadow/spot/AO geometry writes an intensity mask with WebGL2 `MAX` blending. The mask is then alpha-composited once over the scene. This approximates a pseudo depth/intensity buffer for shadows and prevents overlap regions from becoming progressively darker merely because several shadow quads intersect.

Contact spots are stronger and their inner horizontal radius is exactly the projected shadow half-width. The projected body begins with a short tapered neck. Caster origins are moved from the exact lower edge toward the lower-center footprint. Water pixels are still discarded by the shadow-mask shader.

## Launcher
`0Play.cmd` replaces `-Play.cmd`.
