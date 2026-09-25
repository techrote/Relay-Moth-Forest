# Relay Moth Forest v4.09 — Whole-sprite Foliage Depth and Casual Followers

## Foliage compositing
The partial foliage compositor has been removed. No grass/foliage sprite is cut into actor-local fragments. The complete plant remains in the background pass at all times. A complete foreground copy fades in only when the plant root is clearly in front of **every** overlapping actor, using the lower-edge actor origin, directional Y bias, a dwell period and a smooth blend. This specifically eliminates isolated leaf/grass chunks appearing on robot faces or bodies.

## Followers
Followers no longer chase exact formation slots. Each robot keeps a persistent casual target in a broad 52–118 px comfort zone around the player, retargeting mainly when too close, too far, isolated or substantially left behind. Cohesion is weak and only activates beyond a broad separation threshold; one stuck robot does not constrain the rest.

## Package cleanup
Historical implementation notes, validation logs, regressions and authoring utilities are organized under `docs/`, `tests/` and `tools/`. The release root is reserved for runtime entry points and current user-facing files.
