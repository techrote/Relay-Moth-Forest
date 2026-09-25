# Relay Moth Forest documentation

This directory describes the **current v4.14 architecture and authoring contract**.

Documentation is organised by subsystem. Version-specific implementation notes, old diagnostics, previous validation logs and superseded architecture descriptions were moved to [4.14 milestone archive](4.14%20milestone%20archive/README.md).

## Current documentation

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime modules, ownership boundaries, data flow and failure isolation |
| [GAMEPLAY_AND_SIMULATION.md](GAMEPLAY_AND_SIMULATION.md) | Movement, collision, progression, followers, mini robots, wildlife and moths |
| [RENDERING.md](RENDERING.md) | Frame order, sprite materials, shadows, sorting, tree splits and post-processing |
| [SURFACE_AND_FOLIAGE.md](SURFACE_AND_FOLIAGE.md) | WaterField, GrassField and FoliageFX contracts and budgets |
| [EDITOR.md](EDITOR.md) | F2 WYSIWYG editor, object layer, save behavior and authoring fields |
| [DATA_FORMATS.md](DATA_FORMATS.md) | JSON authorities, map fields and schema responsibilities |
| [ASSET_PIPELINE.md](ASSET_PIPELINE.md) | Sprite sheets, atlas generation, normal/specular derivation and tree splits |
| [TESTING.md](TESTING.md) | Automated tests, rendered-pixel validation, browser evidence and limits |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Setup, safe-change workflow, release process and repository layout |
| [DESIGN_HISTORY.md](DESIGN_HISTORY.md) | Major decisions through v4.14, including rejected approaches |

## Authority order

When documents disagree, use this order:

1. current runtime/data in the repository;
2. executable regression tests;
3. current documents in this directory;
4. \`CHANGELOG.txt\`;
5. the milestone archive.

The archive is retained as evidence of how the project evolved. It is **not** the current implementation contract.

## Current baseline

- milestone: **Pretty Graphics Edition 4.14**;
- logical render size: **640×360**;
- playable area: **640×304**;
- gameplay grid: **40×19 at 16 px per tile**;
- rooms: **9**;
- staged traversal routes exercised by the suite: **27**;
- primary runtime scripts: \`surfacefx.js\`, \`sprite_material.js\`, \`foliagefx.js\`, \`editor.js\`, \`game.js\`.

The project intentionally keeps gameplay authority separate from rendering subsystems. SurfaceFX, FoliageFX and sprite material code may consume visual descriptors and actor positions, but do not own story completion, collision or save progression.
