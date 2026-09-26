# Water, Grass and Foliage

There are two different vegetation systems plus the water renderer.

## Water

Map water authority comes from:

```json
"water": [[x,y], ...]
```

Water affects both:

- collision/walkability;
- SurfaceFX water rendering.

SurfaceFX does **not** decide whether a tile is water.

Tin Stream is special because opened bridge cells are removed from exposed-water behavior.

## Water presentation settings

Important defaults include:

- `waterQuality`
- `waterStrength`
- `waterWaveScale`
- `waterWaveSpeed`
- `shoreFoamStrength`
- `waterRippleStrength`
- `waterRippleBudget`
- `waterNormalStrength`
- `waterDetailStrength`
- `waterHighlightStrength`
- `waterEdgeStrength`
- `waterRefractionStrength`

See [Changing Default Settings](Default-Settings).

## Fine GrassField

GrassField is the low-level fine blade/detail layer.

Map authoring uses `grass_clumps`.

Example:

```json
{
  "x": 343.35,
  "y": 151.75,
  "radius": 25,
  "density": 1.26,
  "seed": 1704180432
}
```

### Fields

- `x`, `y` — logical-pixel clump centre;
- `radius` — spread area;
- `density` — local density multiplier;
- `seed` — deterministic placement seed.

Use F2 -> **GRASS FX** for normal authoring.

### Current hard caps

Fine-grass quality caps are currently:

| Quality | Max instances |
| ---: | ---: |
| 0 | 0 |
| 1 | 480 |
| 2 | 1500 |
| 3 | 3000 |
| 4 | 4600 |

## FoliageFX

FoliageFX is the readable sprite-plant layer.

Typical categories:

- ground moss;
- short grass;
- fern;
- broad leaf;
- flower cluster;
- bush.

These plants are rooted, dynamically shaded and can bend around nearby actors.

## Authored grass vs generated foliage instances

You normally author the **clump**.

The runtime derives a bounded deterministic set of fine grass and/or readable foliage placements from map/atlas metadata.

Do not manually author hundreds of runtime foliage instances.

## Making a room more lush

Preferred methods:

1. use F2 -> GRASS FX to add/move clumps;
2. increase clump `density`;
3. add more clumps in visually useful locations;
4. adjust `foliage_density` only if you understand the room's procedural decor behavior.

Avoid simply raising global graphics density until every room becomes noisy.

## Whole-sprite depth behavior

Readable plants intentionally remain whole sprites around actors.

Do not “fix” overlap by reintroducing:

- actor-shaped plant cutouts;
- face masks;
- sliced lower-body foliage;
- moving clip lines.

Those approaches were tried and rejected because they produced flicker and leaf/grass fragments across robots.

## Floater-FX

`floater_clumps` is a separate magical/experimental effect family.

It is not ordinary physical grass and is hidden by default.
