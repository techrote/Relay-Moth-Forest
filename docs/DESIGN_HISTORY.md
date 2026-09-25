# Design history and retained decisions

This is a concise map of the decisions that matter to the current codebase. Detailed release-by-release notes through the v4.14 milestone are preserved in [4.14 milestone archive](4.14%20milestone%20archive/README.md).

## Original project direction

Relay Moth Forest is the original **cute exploration game**.

The later Steelmoth experiments—cyberpunk/horror styling and a separately evolving WebGPU renderer—are a different fork. Their direction should not be imported into this repository by default.

## Direct movement won

Earlier builds experimented with world-mouse pathfinding.

The current design uses direct keyboard/gamepad movement, with the system mouse reserved for menus and the editor. This reduced jitter, control ambiguity and pathfinding coupling.

## SurfaceFX became a presentation-only subsystem

Water and fine grass were separated from gameplay authority.

This made it possible to improve water/shoreline/grass visuals while retaining:

- map water authority;
- Tin Stream bridge behavior;
- collision;
- story state.

Fallback paths remain intentionally available.

## Physical foliage evolved through rejected clipping models

v4.0 established rooted GPU foliage with coherent wind and actor interaction.

Several later iterations attempted actor-local foreground clipping:

- whole plant pass switching;
- lower-body masks;
- directional actor silhouettes;
- stable plant-local cut profiles.

These approaches produced visible popping, moving cut lines or leaf/grass fragments across robot faces.

The accepted design from v4.09 onward is:

- keep the readable plant as a whole sprite;
- use conservative lower-edge depth classification;
- fade complete foreground/background copies;
- preserve source opacity during the transition.

Do not reintroduce actor-shaped clipping without explicit evidence that it solves these historical failures.

## Followers became casual rather than formation-bound

v4.08 intentionally grouped followers tightly to make overlap screenshots easier, but it behaved too much like a formation.

The retained behavior from v4.09/v4.13 is:

- broad comfort band;
- persistent personal targets;
- closer/faster catch-up;
- weak long-range cohesion;
- independent stuck recovery;
- no constant slot chasing.

The group should feel socially nearby, not mechanically constrained.

## Tin Stream became the stress room

Tin Stream received denser right-bank foliage and staged bridge/water behavior.

It is useful for checking:

- water masks;
- bridge progression;
- dense foliage overlap;
- multiple followers;
- static/live material continuity.

## Editor restarted as true WYSIWYG

The old separate mini-map editor was abandoned.

From v4.10 onward the normal game canvas is the authoring view. The editor owns pointer input only while active and uses the same map representation as the game.

v4.12 added the object layer for objectives, moths, wildlife, mini robots and ambient objects.

## Sprite materials converged

v4.13 added widespread bump/specular resources.

The v4.14 audit exposed defects that source-only regressions had missed:

- material alpha accumulation;
- sparse tree seams hidden by average metrics;
- transform-inconsistent normals;
- static/live shader divergence;
- lighting-off still reacting to lights.

The retained architecture uses source-space normal/specular maps plus one shared sprite material implementation.

## Validation became pixel-driven

The v4.14 audit established a stronger rule: renderer correctness requires direct evidence.

The project now retains exact alpha checks, tree reconstruction, real GLSL compilation, rendered-pixel fixtures and browser integration rather than relying only on source-string assertions.

This is the principal quality lesson of the v4.14 milestone.
