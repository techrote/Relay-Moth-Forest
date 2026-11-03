# Development and release workflow

## Setup

Runtime:

- Python 3;
- current WebGL2 browser.

Start the game:

```text
0Play.cmd
```

or:

```text
python relay_moth_server.py
```

Authoring/tests:

```text
python -m pip install -r tools/requirements-authoring.txt
```

Node is required for JavaScript regressions.

## Repository layout

```text
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
procedural_decor.js          shared generated-decor/reserved-surface policy
static_terrain.js            static authority snapshots + bounded native regions
editor_identity.js           persistent identity scan/allocation
editor_validation.js         shared semantic diagnostics and dirty snapshots
editor.js                    WYSIWYG editor
relay_moth_*.json            maps/story/LUTs/effects/sprite data
hd_remake_atlas.json         HD atlas/material metadata
self_test.py                 top-level regression entry point
```

## Safe change workflow

Before editing a subsystem:

1. identify its authority boundary;
2. find the relevant current regression tests;
3. reproduce the behavior or defect;
4. make the narrowest coherent change;
5. add or strengthen a regression that would have failed before;
6. run `python self_test.py`;
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

1. update `VERSION.txt` and visible runtime version strings;
2. regenerate derived assets when their source/recipe changed;
3. run full self-test;
4. run renderer/pixel/browser tests where relevant;
5. remove caches/temp files;
6. stage intended additions/removals, then run `python tools/source_manifest.py --write` and `python tools/source_manifest.py --check`;
7. make a versioned package;
8. extract it into a clean directory;
9. verify internal checksums;
10. run the self-test from the clean extraction;
11. verify checksums again;
12. update README/current docs and archive milestone-specific evidence when appropriate.

## Local editor data

The WYSIWYG editor can modify `relay_moth_maps.json`.

Do not delete or overwrite a user's:

- edited map;
- `editor_backups/`.

Automated save tests must use isolated temporary data.

## Documentation policy

The files directly under `docs/` describe the current contract.

The `docs/4.14 milestone archive/` directory is historical evidence. Do not update archived documents to describe newer behavior; replace/update the current docs instead.

## v4.15 consolidation and reproducible checksums

Release identity is in `VERSION.txt`, the HTML title/help heading, launcher/self-test banners and game diagnostics (including the F10 download filename). The editor file header follows the product milestone. Preserve the map/LUT/effect/story/atlas schema IDs, graphics/progression localStorage keys, internal SurfaceFX/FoliageFX material versions, descriptor compatibility signatures, historical test filenames and archived evidence.

The root `SHA256SUMS.txt` is the current source-package manifest, not the frozen v4.14 archive. [The source-manifest tool](../tools/source_manifest.py) enumerates Git's tracked index and hashes the current working-tree bytes. It includes new documents, tests, tools and durable workflows once they are staged. It never discovers untracked backups, bytecode or test output by walking the checkout.

Stage only the intended source additions and removals first. Then regenerate and verify the manifest:

```text
python tools/source_manifest.py --write
python tools/source_manifest.py --check
git add -- SHA256SUMS.txt
```

`--check` is read-only and reports changed hashes, missing or extra inventory entries, duplicate/malformed entries and noncanonical ordering. A missing tracked file is an error; restore it or stage its deliberate removal with `git rm`. Review the resulting diff before committing. The tool requires a Git checkout, Python 3.9 or later and regular tracked files; unsupported symbolic links, submodules and unresolved conflicts fail explicitly.

The manifest excludes itself and historical temporary `e415-<number>-{validation,evidence,prepare}.yml` / `perf-<number>[letter]-{validation,evidence,prepare}.yml` transports (also `.yaml`). Durable `validate.yml` and `publish-wiki.yml` are included. Preserve the frozen archive contents and their own historical manifests.

Create the versioned source package from the final tracked tree outside the checkout. A clean extraction need not contain `.git`: use `sha256sum -c SHA256SUMS.txt` there to verify the shipped bytes, run `python self_test.py` and the explicit v4.15 behavior/reservation/docs suites, then verify checksums again. Do not add local backups, caches or a package inside its own checksum set.

## Continuous validation

[The durable validation workflow](../.github/workflows/validate.yml) runs one Ubuntu 24.04 job for pull requests targeting `main`, pushes to `main` and manual dispatch. Feature-branch pushes do not start a second copy of a PR run; a newer run cancels the older run for the same PR/ref. PR validation checks out the exact submitted head, so reconcile with current `main` before accepting its result.

The job checks the source inventory, requires a genuine GLES3 context, runs the full deterministic/shader/pixel suite, exercises the native Chromium renderer/editor and captures bounded water performance evidence. It verifies the source manifest again after testing. Every run attempts to upload logs, source commit/tree identity, installed Python package versions, browser results/screenshots and raw timing JSON; artifacts are retained for 30 days. Archive evidence needed for long-term acceptance before that retention window expires.

See [Testing](TESTING.md) for the equivalent local commands and the limits of software-rendered evidence. The E415 release-consolidation issue does not itself require a GitHub Release/tag. The Wiki publisher continues to mirror version-controlled `wiki/` after merge. Preserve `docs/rag/editor-v415/` as implementation provenance and record concise validation under `docs/validation/v4.15/` or `docs/validation/performance/`. Historical branch-only validation workflows have been replaced by durable CI; retain their accepted run IDs and tested source commits in the evidence.
