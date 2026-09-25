# Development and release workflow

## Setup

Runtime:

- Python 3;
- current WebGL2 browser.

Start the game:

\`\`\`text
0Play.cmd
\`\`\`

or:

\`\`\`text
python relay_moth_server.py
\`\`\`

Authoring/tests:

\`\`\`text
python -m pip install -r tools/requirements-authoring.txt
\`\`\`

Node is required for JavaScript regressions.

## Repository layout

\`\`\`text
assets/                      runtime/source image assets
docs/                        current documentation + milestone archive
milestones/v4.14/            v4.14 release bundle/evidence
tests/current/               active regression suite
tests/support/               GPU/render test support
tests/history/               superseded test snapshots
tools/                       authoring/build utilities
game.js                      gameplay + renderer orchestration
surfacefx.js                 water/fine-grass subsystem
foliagefx.js                 physical foliage subsystem
sprite_material.js           shared sprite material
editor.js                    WYSIWYG editor
relay_moth_*.json            maps/story/LUTs/effects/sprite data
hd_remake_atlas.json         HD atlas/material metadata
self_test.py                 top-level regression entry point
\`\`\`

## Safe change workflow

Before editing a subsystem:

1. identify its authority boundary;
2. find the relevant current regression tests;
3. reproduce the behavior or defect;
4. make the narrowest coherent change;
5. add or strengthen a regression that would have failed before;
6. run \`python self_test.py\`;
7. run GPU/browser tests when the change affects shaders, compositing, editor rendering or ordering;
8. update current documentation if a contract changed.

## Rendering changes

When changing sprite materials/order:

- compare static and live paths;
- check flip and rotation;
- check source alpha exactly;
- check tree child/parent reconstruction;
- check lighting disabled;
- check split foreground/static paths;
- check WebGL state after optional failures.

When changing foliage:

- keep roots stationary;
- keep physical foliage non-additive;
- preserve whole-sprite depth transitions;
- avoid actor-shaped clipping;
- keep instance/source bounds explicit.

## Gameplay changes

Player movement/collision is critical-path code.

Avoid coupling optional actors/effects into the player update.

Follower changes should preserve:

- casual grouping instead of exact formation slots;
- independent recovery;
- no group-level wait on a stuck member.

Tin Stream changes must preserve staged bridge/water authority.

## Editor changes

The editor mutates the same map representation used by the game.

When changing editor placement:

- verify live preview;
- verify same-count geometry changes invalidate caches;
- verify palette ghost size/anchor against actual render placement;
- verify rotated selection bounds;
- verify Save to Project writes a backup first;
- keep save tests isolated from real user maps/backups.

## Release checklist

Before a release:

1. update \`VERSION.txt\` and visible runtime version strings;
2. regenerate derived assets when their source/recipe changed;
3. run full self-test;
4. run renderer/pixel/browser tests where relevant;
5. remove caches/temp files;
6. regenerate \`SHA256SUMS.txt\`;
7. make a versioned package;
8. extract it into a clean directory;
9. verify internal checksums;
10. run the self-test from the clean extraction;
11. verify checksums again;
12. update README/current docs and archive milestone-specific evidence when appropriate.

## Local editor data

The WYSIWYG editor can modify \`relay_moth_maps.json\`.

Do not delete or overwrite a user's:

- edited map;
- \`editor_backups/\`.

Automated save tests must use isolated temporary data.

## Documentation policy

The files directly under \`docs/\` describe the current contract.

The \`docs/4.14 milestone archive/\` directory is historical evidence. Do not update archived documents to describe newer behavior; replace/update the current docs instead.
