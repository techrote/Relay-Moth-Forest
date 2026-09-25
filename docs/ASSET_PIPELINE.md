# Sprite and material asset pipeline

## Authoritative input

Authoritative sprite appearance begins with source colour art and atlas metadata.

Use the clean source/category sheets described by \`sprite_sheet_manifest.json\`. Reference/edit-grid images are guides, not runtime authority.

Imported foliage that does not have a standard editable category sheet is preserved by the runtime-atlas rebuild tooling.

## Runtime/derived atlases

The HD material set is coordinate-matched:

\`\`\`text
assets/sprite_runtime_atlas.png   colour + source alpha
assets/sprite_bumpmap.png         derived broad height (authoring/debug)
assets/sprite_normalmap.png       source-space normals + exact source alpha
assets/sprite_specularmap.png     reflectivity + exact source alpha
\`\`\`

At runtime the sprite material GPU paths upload:

- colour;
- normal;
- specular.

The height atlas stays available for authoring and inspection. It is not an extra full-sized GPU material texture.

## Normal encoding

Normal RGB encodes source-space xyz approximately as:

\`\`\`text
encoded = round(normal * 127 + 128)
\`\`\`

Flat normal is approximately:

\`\`\`text
(128, 128, 255)
\`\`\`

Y is up in source material space.

Runtime code transforms source normals for sprite flip/rotation.

Do not premultiply material RGB by alpha. Alpha is carried separately and used by compositing.

## Material generation

Install authoring/test dependencies:

\`\`\`text
python -m pip install -r tools/requirements-authoring.txt
\`\`\`

Rebuild:

\`\`\`text
python tools/rebuild_runtime_atlas.py
python self_test.py
\`\`\`

The rebuild path invokes the deterministic material generator.

The generator derives broad, low-frequency height/normal/specular response from authoritative source art. Physical foliage is intentionally low-specular; stone/wood remain restrained; metal/lamps/orbs/robots can carry stronger broad highlights.

Generated PNGs are staged/verified before replacing live outputs.

## Tree splits

Large-tree child resources are derived from the authoritative parent.

Do not independently edit derived trunk/canopy material maps.

v4.14 validates:

- exact parent colour/alpha reconstruction;
- exact child source alpha;
- child height/normal/spec inheritance from the corresponding parent rectangle;
- both historical split representations.

This prevents a colour seam or material seam from being introduced at the split.

## Static material placement

StaticPainter places colour and transformed normal/specular data with matching geometry.

Flip, rotation, alpha and crop/subrect behavior must be applied consistently to every aligned material target.

This is how a decoration can move between static/live/clipped paths without changing its lighting response.

## After changing art

Run at minimum:

\`\`\`text
python tools/rebuild_runtime_atlas.py
python self_test.py
python tests/current/sprite_assets_regression_414.py
\`\`\`

For material/shader-sensitive changes, also run the rendered-pixel suite described in [TESTING.md](TESTING.md).

## Do not

- edit generated runtime normal/specular atlases as the primary source;
- hand-patch tree child material resources independently;
- infer collision from sprite alpha;
- use bright source colour as an excuse to make physical foliage additive/emissive;
- overwrite a newer atlas/material set when carrying only map edits between versions.
