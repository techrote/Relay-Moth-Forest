# Relay Moth Forest v4.13 — Decoration bump/specular material pipeline

## Scope
All HD decoration vocabulary now has coordinate-matched bump and specular data. This includes procedural/static plants, blockers, lamps, gates, ambient pattern art, editor decor, completed objectives, bridge pieces, and the existing large-tree families.

## Generation
`tools/generate_material_maps_413.py` regenerates the master RGBA bump atlas and dedicated specular atlas from `sprite_runtime_atlas.png`. Decoration bump data uses the same broad, low-frequency alpha/luminance height construction used for the large trees. Specular intensity is material-aware: foliage is damped, wood/stone are restrained, and metal/lamp/orb vocabulary receives stronger broad highlights.

## Runtime
StaticPainter mirrors every static HD sprite draw into aligned world-space bump and specular buffers. `GLRenderer.bgMaterialProg` shades the resulting static room canvas dynamically with the same alpha-safe normal sampling, diffuse/AO and broad specular model used by the live HD tree material. Live HD, tinted HD, and tall foreground-clipped HD sprites sample `sprite_specularmap.png` directly.

This avoids converting the static room into hundreds of additional live draw calls while still giving decoration sprites proper material response.
