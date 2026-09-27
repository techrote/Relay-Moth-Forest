# v4.15 Editor Reliability + Authoring RAG

This directory is the reference corpus for the v4.15 editor implementation issues.

It records the **current v4.14 behavior, exact reproductions, data shapes, accepted design constraints, test coverage, and release gates**. Implementation agents should read the RAG files named in their issue before changing code.

The issue body is the implementation prompt. These files are reference context; they should not be treated as a substitute for the acceptance criteria in the issue.

Baseline reviewed for this corpus:

```text
repository: techrote/Relay-Moth-Forest
main commit: bd9ed186061fe464835d9911f461884f002d5939
milestone baseline: Pretty Graphics Edition 4.14
```

## Documents

| File | Reference scope |
| --- | --- |
| [00-implementation-map.md](00-implementation-map.md) | work-package DAG, target state, ownership boundaries |
| [01-current-editor-contract.md](01-current-editor-contract.md) | current editor tools, item enumeration, input and data model |
| [02-hit-testing-procedural-decor.md](02-hit-testing-procedural-decor.md) | overlap bug, Tin Stream reproduction, generated-decor authority |
| [03-transactions-input-save.md](03-transactions-input-save.md) | undo/redo, pointer lifecycle, save endpoint and dirty-state gaps |
| [04-persistent-identities-groups.md](04-persistent-identities-groups.md) | robot/moth/group IDs and current move/copy hazards |
| [05-objectives-visibility-exclusions.md](05-objectives-visibility-exclusions.md) | objective visuals, exclusions, hidden-state recovery |
| [06-properties-selection-copy-move.md](06-properties-selection-copy-move.md) | editable field shapes and current selection/copy/move behavior |
| [07-validation-data-authority.md](07-validation-data-authority.md) | map/story authority and semantic validation requirements |
| [08-rebuild-performance.md](08-rebuild-performance.md) | current full rebuild path and subsystem invalidation opportunities |
| [09-test-matrix-release-gates.md](09-test-matrix-release-gates.md) | current tests plus required v4.15 behavioral/browser coverage |
| [10-design-invariants-out-of-scope.md](10-design-invariants-out-of-scope.md) | project decisions that this editor pass must preserve |

## Intended landing order

The editor is concentrated in `editor.js`, so the safest landing order is mostly serial even where conceptual work can be reasoned about independently.

```text
E415-01  item model + tool-scoped hit testing
   |
   +--> E415-02 procedural decor enumeration + reserved surfaces
   +--> E415-03 transaction/input correctness
   +--> E415-04 persistent identities + group normalization
              |
              +--> E415-05 hidden/suppressed recovery + objective UX
              +--> E415-06 property inspector
                        |
                        +--> E415-07 move/copy/paste + overlap-selection polish

E415-02 + E415-04 + E415-05 + E415-06
   +--> E415-08 semantic validation + save/dirty state

E415-01 + E415-02
   +--> E415-09 incremental rebuild/coalescing

E415-01..09
   +--> E415-10 behavioral/browser regression expansion
                |
                +--> E415-11 documentation/wiki/release consolidation
```

Do not merge later tasks by implementing their UI opportunistically in earlier issues. The point of the split is to keep each agent turn bounded and reviewable.
