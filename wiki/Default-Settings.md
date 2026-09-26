# Changing Default Settings

Most presentation defaults are defined in `game.js` in:

```js
const GRAPHICS_DEFAULTS = { ... }
```

## Why changing the code may appear to do nothing

Graphics settings are persisted in browser `localStorage`.

The current primary key is:

```text
relayMothGraphics400
```

When that key exists, its saved values override the defaults from `game.js`.

After changing defaults, use the in-game **RESET DEFAULTS** button or clear the saved graphics state while testing.

The loader also understands older graphics keys for migration. Do not delete that compatibility logic unless you intentionally plan a settings migration.

## Current v4.14 defaults

### Display and post

| Setting | Default |
| --- | ---: |
| `maxFPS` | 60 |
| `bloom` | true |
| `bloomIntensity` | 0.28 |
| `bloomThreshold` | 0.74 |
| `saturation` | 1.05 |
| `gradeMix` | 0.03 |
| `vignette` | 0.065 |
| `grain` | 0.0006 |
| `exposure` | 1.00 |
| `brightness` | 0 |
| `contrast` | 1 |
| `gamma` | 1 |
| `gradeTemperature` | 0 |
| `gradeTint` | 0 |
| `shadowLift` | 0 |
| `highlightGain` | 0 |

### Lighting and sprite material

| Setting | Default |
| --- | ---: |
| `lighting` | true |
| `ambientInitial` | 0.68 |
| `ambientComplete` | 0.94 |
| `forceCompleteLight` | false |
| `emissive` | 1.00 |
| `lightRadius` | 1.78 |
| `shadows` | true |
| `shadowStrength` | 0.20 |
| `shadowLength` | 0.92 |
| `shadowSoftness` | 1.05 |
| `shadowWidthRobots` | 0.96 |
| `shadowWidthLargeDecor` | 1.12 |
| `shadowWidthSmallDecor` | 0.80 |
| `ao` | true |
| `aoStrength` | 0.16 |
| `bump` | true |
| `bumpStrength` | 1.15 |
| `specular` | 0.28 |

### Water

| Setting | Default |
| --- | ---: |
| `waterFX` | true |
| `waterStrength` | 1.05 |
| `surfaceFX` | true |
| `waterQuality` | 3 |
| `waterWaveScale` | 1.0 |
| `waterWaveSpeed` | 0.90 |
| `shoreFoamStrength` | 1.08 |
| `waterRippleStrength` | 1.18 |
| `waterRippleBudget` | 10 |
| `waterNormalStrength` | 1.34 |
| `waterDetailStrength` | 1.12 |
| `waterHighlightStrength` | 1.42 |
| `waterEdgeStrength` | 1.18 |
| `waterRefractionStrength` | 1.05 |

### Fine GrassField

| Setting | Default |
| --- | ---: |
| `grassFX` | true |
| `grassFineFX` | false |
| `grassQuality` | 3 |
| `grassDensity` | 2.15 |
| `grassWindStrength` | 0.82 |
| `grassWindSpeed` | 0.82 |
| `grassPushStrength` | 0.95 |
| `grassHeroStrength` | 1.0 |

### FoliageFX

| Setting | Default |
| --- | ---: |
| `foliageFX` | true |
| `foliageQuality` | 3 |
| `foliageWindStrength` | 0.78 |
| `foliageWindSpeed` | 0.82 |
| `foliageInteractionStrength` | 1.0 |
| `foliageShadingStrength` | 0.90 |
| `foliageBendAmount` | 1.0 |
| `foliageShowRoots` | false |
| `foliageShowInteractionRadii` | false |
| `foliageFreezeWind` | false |
| `foliageCategoryView` | false |

### Other effects / flock

| Setting | Default |
| --- | ---: |
| `floaterFX` | false |
| `floaterStrength` | 1.0 |
| `magicFX` | true |
| `fxIntensity` | 0.92 |
| `portalFX` | true |
| `mothOrbitSpeed` | 1.0 |
| `mothOrbitDistance` | 1.0 |
| `mothChaos` | 0.55 |

## Example: lower default bloom

Change:

```js
bloomIntensity:.28
```

to:

```js
bloomIntensity:.16
```

Then reset the saved graphics settings in the browser.

## Example: make the default forest calmer

For less movement:

```js
grassWindStrength:.55,
foliageWindStrength:.50,
foliageInteractionStrength:.75
```

Do not confuse:

- **GrassField** = fine low-level blades;
- **FoliageFX** = readable sprite plants.

## Follower behavior is not a graphics setting

Persistent follower steering constants live in `game.js`, not `GRAPHICS_DEFAULTS`.

Current design intent:

- casual, not rigid formation;
- approximate comfort band 46–104 logical px;
- stronger catch-up outside that band;
- independent stuck recovery.

If changing follower distance/speed, preserve those behavioral principles unless you intentionally want a different design.
