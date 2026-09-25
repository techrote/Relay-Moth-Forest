# Sprite material pipeline — v4.14

`sprite_material.js` owns the common material-state gate, source-normal transform and diffuse/specular lighting function used by static/live/split sprite paths. `foliagefx.js` uses the same normal transform with restrained foliage shading and its own whole-sprite opacity-preserving layer blend.

Authoritative colour art produces four coordinate-matched PNGs: colour, height, source-space normal and specular. GPU sprite paths upload colour/normal/specular; height remains on disk for tools and inspection. No extra fourth full-sized GPU atlas is allocated.

`StaticPainter` mirrors decorative draws into world normal/specular buffers using the same geometry, rotation, flip and source alpha as the colour draw. The static background material samples these vectors, rather than deriving normals from already-resampled world heights. Live sprites transform their source normals in the fragment shader. Split tree child resources inherit parent maps.

Render order is ground/water/fine grass and ground sprites → unified shadows/contact AO → physical background foliage → globally Y-sorted ordinary/tinted HD world sprites → whole-sprite foreground foliage → upper scenery/tree canopy occluders → guide/objective/top FX → existing post composition.

`tools/generate_material_maps_413.py` keeps its historical filename for compatibility but implements the v4.14 deterministic/staged builder. `tools/rebuild_runtime_atlas.py` preserves imported regions and calls the material builder after repacking editable category content. Run the strict asset and GPU tests after authoring changes.

See `SPRITE_RENDER_AUDIT_414.md` for measured before/after evidence and limitations.
