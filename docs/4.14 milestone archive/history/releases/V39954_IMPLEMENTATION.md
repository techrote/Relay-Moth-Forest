# Relay Moth Forest 3.995.4 implementation

This pass implements the requested idle-water, grass-authoring, ecology, bridge, occlusion and
vegetation refinements on top of v3.995.3.

## Water architecture
The old repeated finite-difference analytical water was replaced with a lower-pass-count
pseudo-spectrum. Ten bounded directional wave modes are partitioned qualitatively into long,
medium and short bands. Each mode uses `sqrt(g*k)` deep-water dispersion and contributes height
and gradient analytically in one evaluation. Quality tiers select 4 / 7 / 10 modes. This borrows
the useful spectral/dispersion ideas from FFT oceans without importing FFT butterfly passes,
large float render targets, physics foam accumulation, SSR or other expensive 3D-ocean stages.

## Interactions
Existing bounded ripple sources remain. Wildlife, robots and now the moving player can create
shoreline splashes/ripples. Projected shadows sample the authoritative water mask and discard
fragments over exposed water.

## Ground cover / flora
Every map has explicit `grass_clumps`; GrassField consumes those first and falls back to a
deterministic derived descriptor only for older maps. Dense parallel vegetation bands receive
interstitial half-row sprites. Legacy flower sprites are reduced in world scale, while six new
128x128 flower/foliage sprites are available from `assets/sprites_foliage_hd.png`.

## Actors
Wildlife scale was halved from v3.995.3. Mini robots are slightly larger. Full followers use a
17 px stationary dead-zone and slower idle replanning/response. Cats target rabbits or squirrels
and occasionally visit water edges. Rabbits share squirrel edge-escape behavior. Large-tree
foreground occlusion re-renders both trunk and canopy after actors.

## Tin Stream
Collision/progression remains the four-row staged crossing. The completed state renders a single
512x256 coherent wood bridge source at 128x64 logical size. `append_v39954_assets.py` makes the
complete bridge and HD flora reproducible after atlas rebuilds.

See `VALIDATION_LOG_39954.txt` for the complete regression run.
