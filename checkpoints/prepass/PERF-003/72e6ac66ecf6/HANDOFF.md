# PERF-003 algorithm-prepass Git checkpoint

This is an **additive archival checkpoint** for `techrote/Relay-Moth-Forest` issue #33 / PERF-003. It preserves the completed algorithm prepass from the source conversation. It does **not** implement PERF-003, satisfy its acceptance criteria, change programme state, or apply the proposed patch to active source paths.

## Identity

- Repository: `techrote/Relay-Moth-Forest`
- Task: issue #33 / `PERF-003` — bounded SurfaceFX water-topology refresh
- Assessed source commit: `e4628f63fee57b7e4ccd32aff4bc331d7d06605b`
- Deterministic payload manifest SHA-256: `72e6ac66ecf6b07df36b17aa7441f04eb89d0738b744a93f171b25c00301e5b8`
- Short payload ID: `72e6ac66ecf6`
- Exact original handoff ZIP SHA-256: `24856be038a98fb4da62fe948f3460f122b12927b621aa37129086653e17c6a4`

## Preserved conclusion

The raw distance transform is not globally bounded, but the **encoded shore field has finite influence because encoding clamps at the quality-dependent distance cap**. The prepass derives the conservative exact update rule from the current recurrence:

- `H = M`, with current WaterField caps `M = 10, 16, 22, 22` field samples for quality 1–4;
- for net changed quality-mask samples `D`, candidate outputs are `A = expand(D,H) ∩ Ω`;
- the final-mask source region needed to recompute those outputs is `S = expand(A,H) ∩ Ω`;
- disjoint edits should remain unions of bounded rectangles;
- crop boundaries use real final-mask samples, not artificial dry cells.

The second halo is required when the nearest shoreline is removed: a replacement shore outside `A` can still determine an output inside `A`. Retain the quality mask plus encoded RGBA bytes rather than attempting local repair of the unbounded raw distance arrays. Preserve independent green/blue quantization and update both the legacy water-mask texture and SurfaceFX shore texture coherently.

## Actually executed prepass evidence

The retained comparator reports **19,486 complete encoded-field comparisons** covering **30,969,024 encoded bytes**, with zero mismatching bytes between bounded and full-rebuild results. Retained cases include wet→dry, dry→wet, bridge segment, interacting/disjoint edits, field edges, sequential updates and quality levels 1–4. Four invalid-input checks preserved state. Two deliberate one-halo defects failed as intended, including the reduced four-cell nearest-shore-removal counterexample.

These are retained historical outputs of the completed prepass. **They were not regenerated during checkpoint publication.** Publication verification only rechecks retained bytes/hashes/archive readability and the published Git objects.

## Preserved material

- `artifacts/Relay-Moth-Forest_PERF-003_prepass_e4628f6.zip` is the **exact** completed 98-entry prepass handoff, byte-for-byte. It is the canonical copy of all produced scripts, fixture data, complete encoded-field results, logs, proposed patch and reports.
- `verification/Relay-Moth-Forest_PERF-003_verification.json` is the retained prepass verification report.
- `payload/DERIVATION.md`, `payload/INTEGRATION.md` and `payload/evidence/SOURCES.md` are unpacked for direct review.
- `payload/proposed/perf003-prepass-tests.patch` is the proposed patch, preserved **inert** and not applied.
- `payload/SHA256SUMS` is the original packet manifest covering the full ZIP payload.

The large generated fixtures, 74 `.rgba` fields, executable prototype/comparator scripts, run logs and detailed comparison JSON are not duplicated outside the ZIP. Their exact bytes remain in the verified archive and are covered by the original packet manifest. This avoids inflating the additive checkpoint while retaining the useful derivation, integration map, source locators and inert patch unpacked.

## Limitations / unresolved questions

- Canvas2D regional mask-acquisition parity remains unverified; two retained probe attempts timed out without a browser result.
- Browser/WebGL `texSubImage2D` orientation, pixel-store state, context recovery and coherent dual-texture updates remain implementation checks.
- The suggested eight-rectangle / ~65% source-area fallback policy is a starting policy, not tuned performance evidence.
- CPU work-count reductions are algorithmic counts, not browser latency acceptance evidence.
- Real Tin Stream bridge transactions and editor coalescing/final-flush paths still require integration validation.

## Recommended next action

Implement mask acquisition and dirty-descriptor plumbing first; verify regional Canvas sampling against the current full mask path; then integrate the established `A`/`S` update and coherent texture subuploads. Keep deterministic full rebuilds for room entry, quality/context changes and ambiguous/large/fragmented edits, and retain split PERF-001A mask/distance/upload measurements before claiming performance acceptance.
