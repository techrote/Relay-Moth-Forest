# v4.15 release-consolidation validation

## Candidate provenance

Programme: E415 / #4; final child E415-11 / #15. Starting main: `d54898cdda5df0fc325a7ea8f9f97883e6b73281` (PR #25). No editor feature, map, sprite/material or compatibility migration is part of this consolidation.

This record is completed with the tested candidate and CI evidence before acceptance. The original PR #25 run `37079104325` is inherited evidence only, not a substitute for fresh candidate validation.

## Reproduction

Run from the candidate root and again from a clean source-package extraction:

```text
python self_test.py
node tests/current/editor_behavior_regression_415.js
node tests/current/procedural_decor_regression_415.js
node tests/current/render_contracts_414.js
python tests/current/sprite_assets_regression_414.py
python tests/current/sprite_pixels_regression_414.py --out /tmp/relay-v415-pixels
python tests/current/browser_render_regression_414.py --out /tmp/relay-v415-browser
python tests/current/release_docs_regression_415.py
sha256sum -c SHA256SUMS.txt
```

Install authoring requirements, Node and Playwright/Chromium as described in [Testing](../../TESTING.md). Native-browser execution is recorded separately from deterministic validation. Source-package checksums are verified before and after testing; transient logs/screenshots are not retained in this repository.

## Version classification and scope

Updated product identity: VERSION, HTML title/help, launcher/self-test banner, game header/diagnostics and F10 download filename, editor header, current documentation and Wiki baseline. Preserved: all JSON data, schemas (including HD atlas v4.14), browser keys, internal FoliageFX/SurfaceFX identifiers and descriptor signatures, material tooling, inherited test filenames, historical changelog sections, milestone packages and archived evidence. RAG stays in place with an index directing readers to the shipped contract.

## Limits

The local execution container cannot resolve GitHub for a direct clone; its exact pinned source snapshot was obtained through a bounded GitHub Actions artifact. This affects transport, not the production tests. Linux software-rendered Chromium/GLES is not certification of Windows/Firefox drivers or hardware performance. Documentation checks validate repository/Wiki references, not availability of external sites. CLEAN after export is the editor's issued-download baseline, not proof of browser download completion.
