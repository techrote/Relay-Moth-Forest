# Relay Moth Forest v4.14 — Sprite rendering audit and corrections

## Outcome and scope

This release audits and corrects the actual v4.13 renderer, its derived art resources, and its renderer-facing editor paths. It is not an art-style replacement, a foliage clipping redesign, or a follower AI rewrite.

**Baseline:** `relay_moth_pretty_graphics_v4_13.zip`  
**Baseline SHA-256:** `f7a1cf3e239d479d985123cbc1d2e25dbfd55ae888ab1cf6275ad56212e01cac`

The v4.13 inherited self-test passed before changes. Additional tests nevertheless reproduced material, transparency, split-resource, cache-invalidation and shader defects. This is why the audit added executable image/geometry checks rather than treating existing “PASS” labels as proof of correct pixels.

The maps, story, LUT data, sprite definitions and effect definitions are byte-identical to v4.13. The recent closer/faster casual follower settings, individual stuck recovery, whole-sprite foliage transition approach, source-image silhouettes, and no-world-mouse gameplay rules remain intact. The colour changes are confined to repaired **derived split-tree resources**; original full tree/source sprites retain their artwork.

## Test methods

Four different kinds of evidence are distinguished:

1. **All-resource inspection.** All 544 atlas rectangles were checked for bounds/overlap and material coverage. Source alpha was compared exactly, per texel, with height/normal/specular alpha. Every tree family was reconstructed from its actual child resources, without using an average-image-error tolerance.
2. **Real GLES3 shader/pixel tests.** The test harness evaluates production JavaScript shader constructors, compiles the resulting GLSL in a surfaceless Mesa context, executes draws, and reads RGBA8 pixels back. It covers the complete 21-program shader census, not just the four HD material shaders. Baseline and fixed builds use the same fixtures and measurements.
3. **Native browser integration.** Actual Chromium WebGL2 runs through ANGLE/Mesa llvmpipe. JSON and images are injected into an offline blank document because navigation to URLs is restricted in this execution environment. The WebGL context, shaders, Canvas2D operations, actual application renderer and browser hit-testing are not mocked. Frames are stepped explicitly rather than running an uncontrolled animation loop.
4. **Behavioral/inherited regression tests.** Real renderer methods are exercised for queue ordering, connected fallback geometry, spatial candidates, dynamic uploads and failure isolation. The inherited 27-route, bridge, movement, input, AI, save and editor contracts are retained.

The separate early DOM-only experiment used GL call recording and is **not** presented as native-render evidence. The final native test supersedes that limitation. Browser evidence is from Linux software rendering; it does not certify Firefox/Windows driver behavior or a hardware 60-FPS target.

## Rendered-pixel measurements

Except for the explicitly labelled mean, values below are maximum absolute channel errors on the same test fixture in **0–255 RGBA8 units**. A zero means equality for that fixture, not a universal claim about every possible scene.

| Check | v4.13 | v4.14 | Allowed maximum |
| --- | ---: | ---: | ---: |
| Unlit material changes when the light moves | 14 | 0 | 0 |
| Unlit RGB differs from the source | 20 | 0 | 1 |
| Mirrored material versus equivalent baked reference | 64 | 1 | 2 |
| Rotated material versus equivalent baked reference | 51 | 1 | 2 |
| Native-resolution change, mean normal-response error | 0.662 | 0.262 | 1.5 |
| Static versus live material at identical coordinates | 57 | 0 | 2 |
| Static lower / foreground upper material seam | 35 | 0 | 2 |
| Whole-plant transition opacity drift | 36 | 0 | 2 |
| Pixel motion inside the rooted band | 0 | 0 | 0 |

Seven pixel contracts failed in v4.13 and pass after the corrections. The native-resolution check was already within its tolerance; its lower error is additional evidence, not counted as an independently reproduced baseline failure. The root-lock fixture passed before and after.

In addition, the baseline `SurfaceFX GrassField` program failed genuine GLSL compilation because `coherent` was used as a local variable. It is a reserved GLSL token on the tested driver. Renaming that local variable fixed compilation. All **21** production programs now compile and link in the census.

## Confirmed defects and editing pass

### A. Asset transparency and tree seams

**32 robot regions had material alpha that did not match their colour alpha.** The maximum discrepancy was 64/255. The previous material update composited revised robot tiles over the old atlas rather than replacing them, accumulating alpha at translucent edges. The new builder writes derived pixels directly into their coordinate-matched rectangles and copies source alpha exactly.

**Tree split tests were hiding real edge errors.** The original purple tree had a maximum split alpha error of 185/255. Each of the eight remixed tree families had a maximum error of 64/255 from overlapping alpha in the child resources. The original green tree reconstructed exactly. Global average-difference tests obscured these sparse but visually important seam pixels.

The builder now derives both child colour resources from their unmodified parent. Cropped trunk families remain cropped; full-canvas trunk families keep their canvas and have zero alpha above the canopy boundary. Their heights and anchors are not reinterpreted. All ten families reconstruct the parent colour/alpha exactly at visible pixels.

**Split material maps were generated independently.** Their gradients/reflectivity differed from the parent at the join even when the colour join happened to look acceptable. Child height, normal and specular maps now inherit the corresponding parent rectangle, with child source alpha. This prevents a new artificial normal/lighting boundary at the split.

**Repeated material generation was not idempotent.** The old builder used the previous height output as part of the next input. The replacement derives height, reflectivity and normals from authoritative source colour/alpha alone. Two consecutive full-atlas rebuilds produced identical SHA-256 hashes for all four PNGs; those hashes are retained with the evidence. New PNGs are encoded and verified in a temporary staging directory before replacing live files. This last change is interruption hardening, not a claim that the supplied v4.13 archive contained truncated images.

### B. A shared sprite material instead of divergent shader copies

**Disabling lighting/bump did not fully disable sprite-local lighting.** Zeroing the normal slope left light-position-dependent diffuse shading active. A shared material-state gate now makes the unlit path return the source/tinted colour without diffuse/specular response.

**Flipped and rotated sprites had wrongly oriented highlights.** Sampling a mirrored UV changes which normal texel is read but does not, by itself, mirror that vector. The live material transforms source-space normals through the actual UV/world derivative basis. Static Canvas2D material construction applies the corresponding flip/rotation to normal vectors before placement. This works for the same art drawn mirrored or rotated rather than requiring a separate authored material.

**Static, foreground-clipped and live materials used different equations.** A lower part baked into the room and an upper part drawn live could have different diffuse/specular response even with perfectly matching textures. `sprite_material.js` is the shared source of the lighting function, normal decode and state gate. Static world material buffers contain transformed source normals rather than a height field differentiated after scaling. The static and live test fixture now agrees exactly, including the split-material fixture.

The height PNG remains an authoring/debug asset. Runtime GPU uploads use colour + normal + specular, replacing colour + height + specular; the new normal atlas is **not** an extra fourth full-size runtime GPU atlas. Foliage also consumes the normal/specular atlas, with its restrained vegetation-specific strength. No emissive foliage path was added.

### C. Whole-sprite foliage compositing and geometry

**The same plant gained opacity during a foreground transition.** v4.13 drew a full-alpha background plant and a second foreground copy, so its edges and partly transparent art became denser as the fade increased. That was measurable even without an actor between the layers.

For source alpha `a` and whole-plant blend `f`, v4.14 uses:

```text
foreground alpha = a * f
background alpha = a * (1 - f) / (1 - a * f)
```

The fully opaque endpoint is handled safely. This preserves the original combined opacity when nothing intervenes. The entire sprite still participates as one unit: there are no actor-shaped cuts, face bands, moving cutoff contours, or leaf-fragment overlays. The existing conservative “in front of every overlapping actor” decision and its dwell/fade are retained. Root contact/shadows are composited before the physical foliage, so the two material copies do not receive different baked shadow darkening.

**Opaque and tinted HD actors were sorted in separate queues.** Each queue could be internally correct while one type still incorrectly overpainted the other. Their complete quads now share a stable bottom-Y sort, with consecutive compatible materials batched into draw runs. Special top-level guide/objective FX and explicit tree-canopy precedence are unchanged.

**Fallback grass used disconnected translated bands.** Adding overlap to separate rectangles could hide some cracks but could not guarantee continuous geometry. The fallback now shares exact edge positions and UVs between adjacent strips. Its root position remains fixed.

**Spatial lookup had fixed size assumptions.** Very wide/tall sprites could overlap an actor without their bin being searched. Each instance is registered over its complete bounds plus conservative deformation margin. The regression compares returned candidates with brute-force overlap across hundreds of probe positions, including a 620-logical-pixel-wide fixture.

**Dynamic fade updates recreated static instance data.** Only the changing flag values now update the existing packed array; a bounded dirty range uses `bufferSubData`. Static shape/UV/category data is neither repacked nor reallocated for ordinary blend changes. This is a verified allocation/upload change, not an FPS claim.

**Root deformation and bounds were incomplete at extremes.** Mesh row positions now include the actual category root cutoff. The bend control scales wind, interaction and flutter together, zero means zero deformation, displacement is bounded, and generated roots outside the playable area are excluded. The root-band pixel fixture remains identical through strong wind phases.

### D. Driver/state and editor-facing corrections

The new complete shader census caught the `coherent` compile error in the optional fine-grass shader. Its normal draw path and injected-failure path now use a dedicated VAO with guaranteed unbinding. Regular non-instanced quad/sprite attributes reset divisors and skip optimized-out locations. Foliage rendering also restores its VAO on upload/draw failure, so an optional surface effect cannot poison the main sprite batch's state. Shader objects are deleted after linking or failure rather than accumulated.

**Same-count room edits could leave old geometry on screen.** Grass and water cache identities now include geometry, not just room/stage or item count. Moving a clump or replacing a water cell without changing the count invalidates the relevant descriptors. This was tested through an actual native-browser editor rebuild.

**Editor mode altered the game image with a CSS filter.** That dimming/desaturation has been removed; editor chrome overlays the normal renderer without changing the underlying image's colour. Palette controls remain clickable after selecting an item, and Tab restores hidden UI in browser hit-testing.

**Some palette ghosts used the wrong size/origin.** Moths, wildlife, minis and authored ambient art now use their actual base rendering scale and anchor. Legacy flower scaling is shared with the static painter. Tree/blocker ghosts include their actual ground offset, lamp previews include the mounted assembly placement, and rotated authored-decor selection bounds account for rotation. The native Canvas2D ghost/reference comparison produces identical pixels for the tested static preview cases; it does not imply that wildlife spawn-group scatter or live animation is frozen to its ghost.

A separate test-harness defect was also corrected: the inherited save-endpoint regression deleted the project's existing `editor_backups` directory. It now runs the actual handler against an isolated temporary project, checks preservation of an existing backup sentinel, and never changes the user's maps/backups.

## Validation boundaries and retained behavior

The release keeps the same gameplay map/story/effects/LUT payloads and closer/faster casual follower settings. Tests continue to cover 30,296 movement cases, 10,820 keyboard-jitter cases, independent follower recovery, 27 staged routes, the bridge's staged water authority, tree split modes, bounded foliage counts and current editor operations.

Native browser integration covers all nine rooms, material-off and bump-off states, foliage qualities 0–3, optional fine grass, an extreme-wind configuration, resize, same-count grass/water edits, palette reuse and UI restoration. A scripted three-robot overlap sweep checks repeated frames without GL errors. Evidence is saved under `docs/validation/v4.14/`.

The tests do not prove every possible user-edited map is correct. Static translucent layers still share a composited world-material representation, a deliberate approximation rather than a full per-object deferred scene. The audit does not claim Windows/Firefox acceptance or a measured hardware performance uplift. Those are the remaining environmental/coverage boundaries, not hidden “all bugs are impossible” assurances.

## Reproduction

From the extracted versioned project directory:

```text
python self_test.py
node tests/current/render_contracts_414.js
python tests/current/sprite_assets_regression_414.py
python tests/current/sprite_pixels_regression_414.py --out <evidence-directory>
python tests/current/browser_render_regression_414.py --out <browser-evidence-directory>
```

The normal self-test includes the first three new test families. Native browser integration is separate because it requires Playwright/Chromium. GLES-dependent tests explicitly report a skip if no suitable context exists; shader failures in a valid context fail the test. The shipped validation log records the tests that actually ran here.

Final packaging uses a versioned inner folder, keeps the top-level directory small, excludes Python caches, regenerates the internal SHA manifest, extracts the ZIP into a fresh directory, then runs the complete self-test and verifies checksums before and after.
