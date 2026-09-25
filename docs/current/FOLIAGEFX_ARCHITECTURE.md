# FoliageFX — current v4.14 contract

The reusable subsystem owns registry metadata, static instance buffers, coherent wind,
bounded interaction sources, rooted deformation, spatial depth classification and
optional diagnostics/debug drawing. It owns no collision, story, navigation or save
progression.

Each instance has a fixed lower-centre/root position. Mesh rows include the category's
root cutoff, so all geometry below it is stationary. Whole-plant depth behavior from
v4.09 is retained: a conservative directional lower-edge relationship must hold for
all overlapping sources, with dwell and a smooth transition. There are no face masks,
actor-shaped cutouts or partially sliced plant profiles.

Both passes use the same source art and material, with complementary alphas. For source
alpha `a` and foreground weight `f`, foreground is `a*f`; background is
`a*(1-f)/(1-a*f)` with a safe opaque endpoint. Their composition equals original source
alpha when no actor intervenes. Root contact/shadows are drawn before physical foliage.

Instance layout remains deterministic and bounded (208-instance ceiling; 8 interaction
sources). Static geometry is uploaded on actual descriptor/quality changes. Fade changes
use an in-place flag update plus a bounded bufferSubData span, not a full repack/reallocation.
Spatial bins cover actual instance bounds, including wide/tall multi-tile sprites.

Materials use source-space normal/specular maps. Quality tiers retain restrained foliage
lighting and coherent deformation; bend=0 disables wind, push and flutter displacement.
Roots generated outside the playable area are rejected. Optional failures disable only
FoliageFX and restore safe VAO state; the connected-band compatibility renderer remains.

See `SPRITE_RENDER_AUDIT_414.md` for evidence, limitations and test details.
