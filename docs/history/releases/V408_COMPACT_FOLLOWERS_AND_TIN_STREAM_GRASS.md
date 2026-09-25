# Relay Moth Forest v4.09 — Compact Followers and Tin Stream Grass Enrichment

## Followers
Followers now target a compact shared formation rather than a loose orbit. The formation keeps them at about the same trailing distance from the player while clustering them together where space allows. Recovery/teleport placement and room-entry placement also use the same compact formation, making it easier to get comparable example screenshots.

### Technical changes
- Added `formationSlot(...)` to `Followers` for shared compact slot placement.
- Replaced the older loose angle/radius orbit with precomputed compact formation targets.
- Reduced follower-follower repulsion and added mild cohesion so the group stays visually together more often.

## Tin Stream grass
Added extra authored grass clumps with higher density along the right bank of `tin_stream`, especially around the mid/right walkway, so the scene contains more intense grass layering for testing and screenshots.
