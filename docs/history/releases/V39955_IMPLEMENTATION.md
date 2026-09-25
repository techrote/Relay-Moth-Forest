# Relay Moth Forest — Pretty Graphics Edition 3.995.5

## Goal
Address three immediate presentation issues:
1. raise the maximum inputtable water-FX parameter values,
2. ensure grass FX are visibly present, and
3. add soft-edged spot shadows to hide the black seam at the start of projected shadows.

## Code changes

### `index.html`
- Raised water-control maxima in the graphics panel.
- Raised grass-control maxima so the new stronger tuning can be explored at runtime.
- Updated the SurfaceFX help note to reflect the new stronger visibility profile.

### `surfacefx.js`
- Bumped SurfaceFX version to `3.995.5`.
- Raised `MAX_RIPPLES` from 8 to 12.
- Raised `GRASS_HARD_CAP` from 2200 to 4600.
- Extended `fieldResolutionForQuality()` and `WaterField.setQuality()` to accept quality level 4.
- Added two additional high-frequency analytical wave bands for quality 4 water.
- Increased deterministic grass instance counts, blade size, sway amplitude, and interaction push response.
- Extended grass generation / rebuild clamps to support quality 4 and density up to 4.0.

### `game.js`
- Bumped runtime version text and diagnostics export filename to `3.995.5`.
- Added graphics-settings migration from `relayMothGraphics39954` into new `relayMothGraphics39955`.
- Raised default grass values (`grassDensity`, `grassWindStrength`, `grassWindSpeed`, `grassPushStrength`) so the effect is visible without requiring manual tuning.
- Brightened the runtime grass material palette and widened interaction radii slightly.
- Added soft spot-shadow fans at sprite contact points inside `renderShadowOverlay()`. These fans blend into the existing projected shadow quads and continue to discard over water via the existing water-mask logic.
- Updated grass descriptor seeds/signatures to the 3.995.5 revision.

## Validation
- `node --check game.js`
- `node --check surfacefx.js`
- `node surfacefx_regression.js`
- `python self_test.py`
- `python visual_behavior_regression_39955.py`

All checks passed in the packaged build.
