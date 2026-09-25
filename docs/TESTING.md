# Testing and validation

## Normal test command

From the repository root:

\`\`\`text
python self_test.py
\`\`\`

The runtime launcher itself uses only the Python standard library.

Authoring/test requirements:

\`\`\`text
python -m pip install -r tools/requirements-authoring.txt
\`\`\`

Current declared Python authoring dependencies are Pillow and NumPy. Node is also used by JavaScript regression tests.

## What the self-test covers

The suite includes, among other contracts:

- map/story/LUT/effect schema sanity;
- atlas bounds and roles;
- 27 staged objective/exit routes;
- Tin Stream bridge progression;
- movement/collision cases;
- keyboard jitter invariants;
- follower no-route recovery;
- mini-robot and wildlife boundaries;
- SurfaceFX/FoliageFX resource bounds;
- WYSIWYG editor behavior/save isolation;
- whole-sprite foliage depth behavior;
- tree split and rendering-order contracts;
- sprite material assets;
- production shader census.

The exact list lives in \`self_test.py\`.

## v4.14 sprite-render audit

v4.14 intentionally went beyond the inherited suite because source-level “PASS” tests had failed to expose real visual defects.

Key audit commands:

\`\`\`text
node tests/current/render_contracts_414.js
python tests/current/sprite_assets_regression_414.py
python tests/current/sprite_pixels_regression_414.py --out <evidence-directory>
\`\`\`

The pixel test evaluates production shader constructors, compiles resulting GLSL in a real GLES3 context when one is available, executes draws and reads RGBA pixels back.

It checks material states such as:

- unlit invariance;
- mirrored normal equivalence;
- rotated normal equivalence;
- static/live material agreement;
- split-material seams;
- whole-plant foliage opacity;
- rooted-band motion.

## Browser integration

Optional native browser test:

\`\`\`text
python tests/current/browser_render_regression_414.py --out <evidence-directory>
\`\`\`

This requires Playwright/Chromium.

The v4.14 audit environment successfully exercised Chromium WebGL2 through ANGLE/Mesa software rendering across all nine rooms plus settings/editor cases.

## Evidence and milestone artefacts

Current milestone release artefacts remain under:

\`\`\`text
milestones/v4.14/
\`\`\`

The original detailed v4.14 evidence bundle and validation documentation has been preserved in:

\`\`\`text
docs/4.14 milestone archive/
\`\`\`

## Important limits

The tests are strong evidence, not proof that every arbitrary edited map or every GPU driver is correct.

The v4.14 browser run was Linux software rendering. It does **not** certify:

- Windows/Firefox driver behavior;
- hardware frame-time/FPS targets;
- every user-authored map;
- every possible settings combination.

Performance claims should be measured on the target hardware/browser rather than inferred from the build container.

## Test-design policy

For rendering work, prefer direct evidence:

- exact alpha/material comparisons;
- pixel readback;
- shader compilation/link;
- browser integration;
- transform cases;
- failure-path state cleanup.

Do not rely only on:

- checking that a function name exists;
- averaged image error that can hide sparse seam pixels;
- an old validation log from a different renderer version.
