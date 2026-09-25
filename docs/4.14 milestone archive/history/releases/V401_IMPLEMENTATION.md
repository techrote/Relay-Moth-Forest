# Relay Moth Forest v4.01 — Implementation Record

## Summary

This patch tunes the living-forest presentation after v4.0 by adding four new foliage source sheets, reorganizing them into explicit role families, and softening interaction behavior so player/robot contact reads as gentler brush-through rather than broad elastic distortion.

## Implemented

- Added source sheets to `assets/foliage_v401_sources/`.
- Extracted and packed new foliage regions into the runtime atlas and bump atlas.
- Added new role groups: `foliage_v401_meadow`, `foliage_v401_grove`, `foliage_v401_ground`, `foliage_v401_reed`, `foliage_v401_all`.
- Updated `FoliageRegistry.pool()` and the hero-grass fallback pool to use the new families.
- Reduced FoliageFX interaction radii to approximately 60% of v4.0.
- Reduced SurfaceFX GrassField and FoliageFX maximum distortion/stretch to approximately 50% of v4.0.
- Excluded pure flower sprites from the physical deformation pool and attenuated flower-heavy integrated foliage through metadata profiles.
- Updated package/version strings to Pretty Graphics Edition 4.02.

## Notes

This remains consistent with the v4.0 architecture: gameplay authority is unchanged, the FoliageFX module remains presentation-only, and the fallback CPU hero-grass path is still available when the GPU foliage system is unavailable.
