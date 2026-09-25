# Relay Moth Forest v3.995.3 implementation notes

Implemented fixes for the reported regressions and missing checklist items:

- Large trees now render as proper trunk + canopy split layers using dedicated `tree_trunks` and `tree_canopies` roles, fixing the broken detached canopy look.
- Tree/follower contact shadows are pushed to begin below sprite feet/bases instead of reading over the art.
- Tin Stream bridge visuals were repainted as wooden bridge tiles and kept four tiles wide.
- Water FX visibility was substantially increased (defaults, shader mix/alpha/highlights, ripple strength, splash strength).
- Grass generation density/coverage/caps were increased; blade height/width/alpha/highlights strengthened.
- Water splashes were enlarged, brightened, and moved to the top FX layer for readability.
- Mini robots now spawn pre-grouped in groups of up to 3 after Pip, maintain stronger completed-room wandering, and full groups perform circle -> scatter -> resume encounters more reliably.
- Wildlife path avoidance was strengthened.
- Wildlife render scale increased further.
- Cats wander/chase faster and lose interest sooner.
- Squirrels now trigger their escape jump on any edge tile, not only corners.
- Mushroom pixies now cluster and swirl around a shared local center, optionally blended toward nearby gnomes.
- Exit gate closed state is now greyed out rather than blue.
- Display/Post controls already contained brightness / contrast / gamma and remain available in the graphics panel.

Note: this patch focused on direct fixes in `game.js`, `surfacefx.js`, and bridge atlas assets.
