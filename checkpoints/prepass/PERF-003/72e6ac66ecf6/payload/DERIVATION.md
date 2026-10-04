# PERF-003: bounded encoded-shore reconstruction

Assessed repository: `techrote/Relay-Moth-Forest` at `e4628f63fee57b7e4ccd32aff4bc331d7d06605b`.
This is an algorithm prepass, not a production implementation or performance acceptance. Source locators and retrieval limits are in `evidence/SOURCES.md`.

## Decision

**Use independent, two-halo rectangular recomputation from the final authoritative binary mask. Retain the full-rebuild reference.** Cache the quality-sized mask and complete RGBA bytes, not globally valid raw distances or nearest-shore identities. Run the existing Float32 two-pass transform in a larger source rectangle; encode and replace only its interior affected-output rectangle. Compare bytes there and pack bounded subimage rectangles.

The encoded field has a finite local dependency bound. The returned raw `dist` field does not have that same bound. Mixing these two representations would make a deletion-based incremental implementation incorrect.

## What the existing function actually computes

`surfacefx.js:buildShoreField` initializes dry samples to zero and wet samples to `1e6`. Its first raster scan uses W, N, NW and NE; its reverse raster scan uses E, S, SE and SW. Axial cost is 1 and diagonal cost is the literal `1.41421356`. Each pixel's selected value is stored in a `Float32Array` after the candidate minima, not after every addition. There is no outside-the-image dry border.

In ideal arithmetic this is the unobstructed eight-neighbour chamfer distance to dry samples, with octile cost

    rho(dx,dy) = max(|dx|,|dy|) + (1.41421356 - 1) min(|dx|,|dy|).

It is not an exact Euclidean distance transform and not a water-only geodesic/pathfinding problem. For byte equivalence, the authority is the existing scan recurrence, literal and Float32 store order—not a new analytic distance formula or a heap-based solver with different rounding.

At a wet sample, with `d = min(dist, M)`, the representation is

    R = 255
    G = Math.round(255 * d / M)
    B = Math.round(255 * clamp(1 - d / M, 0, 1))
    A = 255.

Dry samples are `[0,0,0,255]`; saturated wet samples are `[255,255,0,255]`. The shader currently consumes R and G, but PERF-003's oracle must preserve B as well. The shader's narrower visible foam interval is not the encoded-field dependency bound.

### Production quality parameters

| Quality | Field size at 640 x 360 | Saturation distance M | Certified integer padding H | H in logical x/y pixels |
|---|---|---:|---:|---:|
| 1 | 128 x 72 | 10 | 10 | 50 / 50 |
| 2 | 224 x 126 | 16 | 16 | 45.714286 / 45.714286 |
| 3 | 320 x 180 | 22 | 22 | 44 / 44 |
| 4 | 416 x 234 | 22 | 22 | 33.846154 / 33.846154 |

`buildShoreField`'s default 18 is not the distance used by `WaterField.rebuild`. Do not use a constant logical halo across qualities. For other logical aspect ratios, use the actual rounded field height and separate horizontal/vertical ratios. Quality 0 disables the field; changing quality invalidates dimensions, mask sampling and M and therefore takes the full path.

## A conservative bound proved for the actual recurrence

The prototype deliberately uses H = M for the supported integer M values (1 through 22, including the small-radius adversarial tests). This is a certified conservative bound, not a claim that its square is the smallest possible influence set.

Trace any unsaturated computed value backwards through the min-plus recurrence. It originates at a dry zero seed and follows positive-cost axial or diagonal edges, plus the unchanged-value carry from forward to backward scan. Carrying an existing Float32 value does not introduce additional rounding error. Each positive edge changes each coordinate by at most one and costs at least one before rounding.

While a value remains below 32, a Float32 store has absolute rounding error at most 2^-20. Thus a dependency chain containing M+1 positive edges cannot remain below M:

    (M + 1) * (1 - 2^-20) > M, for every integer 1 <= M <= 22.

Once a positive-cost chain has exceeded M it cannot later decrease along that chain. Taking a minimum with another chain simply chooses a different source/path. Consequently every dependency that can produce an unsaturated output has at most M positive edges, and lies within Chebyshev distance M of that output. The same argument bounds how far an added or removed zero seed can change an unsaturated output. A wet/dry change in R is local to the changed sample itself.

This proof is intentionally phrased in terms of the computational dependency graph. It does not require a separately rounded closed-form octile distance to equal the legacy floating-point recurrence. The sentinel 1e6 is already saturated and cannot create a spurious unsaturated value.

Quantization can make the actual influence slightly smaller: in ideal arithmetic the wet G/B pair has saturated beyond M * 509/510, with a tie caveat in the separately rounded blue channel. There is no benefit in making the first implementation depend on that tighter threshold. H = M safely includes ties and supported Float32 error. New distance weights, larger/noninteger M, nonlocal filters or a different encoding require a fresh bound or the full fallback.

## Output region and source region are different

Let Omega be the finite quality-sized grid, and let D be the **actual net changed mask samples**, comparing the last committed field mask with the final mask of the entire transaction. D is not a list of pointer events and is not just the destination of a moved tile.

A safe candidate output set is

    A = Omega intersect union over d in D of (d + [-H,H]^2).

Pixels outside A retain identical RGBA bytes. Within A some pixels may also be unchanged because another nearer shore wins or both old and new distances saturate. Those are identified by byte comparison, not predicted away.

For each rectangular output component A_j, the mask needed to rebuild it is

    S_j = Omega intersect expand(A_j, H).

For one dirty rectangle this is, conservatively, a source rectangle extending **2H beyond the original dirty rectangle**, with only the inner H-expanded rectangle written. Expanding D once and treating that same rectangle as both output and source is incorrect.

Why S_j suffices: all dependency chains capable of affecting an unsaturated output in A_j fit inside its H-neighbourhood. An omitted sample beyond S_j needs at least H+1 coordinate steps to reach any affected boundary pixel, so cannot supply such a value. Cropping preserves the relative order of every retained raster operation. Omitting farther dependencies may change large raw distances, but only where their encoding is already saturated.

In implementation, an artificial crop edge has **no extra dry neighbour**: run the reference recurrence with its ordinary bounds checks on the crop. The crop is a truncated source domain, not a new physical shoreline. At actual room/field edges use the same rule as the full reference. The bottom UI band is part of the 640 x 360 source and is legitimately dry; do not silently change the field domain to 640 x 304.

## Removal, interactions and edge cases

Removing a nearest dry sample can increase raw distances across an entire wet region. However, a byte can only change when the removed source was within the bounded old dependency, or the pixel itself changes wetness. To recompute a newly farther but still unsaturated replacement shore, S_j must include unchanged sources outside A_j. If every remaining shore is farther than M, the correct result is saturated, regardless of which very distant shore is now nearest.

All edits are applied to the final mask **before any** source crop is copied. Otherwise one crop can be computed using a shoreline that a later edit removes. Overlapping/touching output rectangles are merged transitively. Output-disjoint rectangles remain separate even when their source rectangles overlap; this is correct and often saves a large empty bounding box. The implementation counts repeated work in overlapping source crops, rather than reporting their union as if the duplicate work were free.

A move contributes both old and new footprints; multiple writes to one sample are last-write-wins and are compared with committed state. A removed-and-readded sample with no net change causes no distance work. Far-apart edits do not require one room-wide bounding rectangle. Quality/room/context changes do require a new full baseline.

## A minimized failure that rejects a one-halo implementation

The reducer exhaustively searched increasing one-dimensional widths, M and masks, toggling dry to wet. The first failure of “output rectangle is also the source rectangle” was width 4, after 118 candidate checks:

    M = 2
    before: dry wet wet dry
    after:  wet wet wet dry
             ^ edited

The candidate output rectangle for the first sample is x = 0..2. If recomputed only from that rectangle, it sees no dry seed. At x=2 it produces `[255,255,0,255]`. The full reference sees the unchanged dry sample at x=3 and produces `[255,128,128,255]`. The second source halo fixes this.

The analogous actual quality-1-distance example uses width 12, M=10, dry samples at x=0 and x=11, and removes the former. The defective one-halo path differs at nine cells / eighteen bytes. Both cases, complete expected/actual bytes and the small exhaustive reducer are retained in `results/counterexamples.json` and `scripts/compare.cjs`.

## Representation problems to resolve explicitly

1. **Do not use B = 255 - G.** At M=10 and d=1, the reference stores G=26 and B=230, not 229. The separate round operations must remain.
2. **Do not retain a supposedly exact global raw-distance cache after local updates.** In the retained width-80 example, removing x=0 changes x=79's raw distance from 79 to 1e6, while its RGBA stays identical. Cache mask/RGBA only; crop distances are disposable scratch.
3. **Min-only relaxation cannot implement source deletion.** The `[wet,dry,wet]` to all-wet example needs distances to increase. Reset and recompute the entire source crop, not just the edited seed.
4. **Do not manufacture dry cells outside a crop or the real field.** A one-pixel all-wet field is saturated, not distance one from an invented exterior shore.
5. **Do not reconstruct distances from G.** Quantization has discarded information and cannot seed an exact transform after removal or interaction.

## Executed oracle and work counts

The retained JavaScript reference functions are source excerpts transcribed from the assessed connector read. They preserve the original scan and encoding; this packet does not pretend to contain a downloaded full repository. `verify-reference.cjs` verifies a separately available complete `surfacefx.js` against the recorded complete-file SHA-256 and checks the two exported functions. The comparator can directly load that file through `PERF003_REFERENCE`.

Executed with Node v22.16.0 / V8 12.4.254.21-node.26 on Linux x64:

- 74 named fixtures, including qualities 1–4 at their actual field dimensions, thin fields, wet/dry changes, synthetic bridge, interactions, field edges and deterministic fallbacks;
- 18,432 exhaustive 3 x 3 single-toggle comparisons over every binary mask at M=1..4;
- 800 seeded mixed batches at sparse and dense shore distributions;
- 180 sequential updates from the previous committed cache;
- four invalid-input cases which leave mask/RGBA unchanged;
- two expected failing one-halo controls, including the reduced case above.

**19,486 complete RGBA comparisons, 30,969,024 compared bytes, zero mismatched bytes.** Named and random/exhaustive cases also reconstruct an entire destination from the proposed packed upload patches and compare it to the full reference. These are CPU data-layout checks, not GPU upload tests.

The exhaustive 3 x 3 cases often include the whole domain in a source crop; the larger named/random cases provide the meaningful local-boundary tests. The bridge fixture is a synthetic 16 x 2 field-sample segment through a wet strip, not a captured Tin Stream gameplay transaction. The logical 16-pixel tile fixture uses explicitly labelled ideal centre sampling; it is not evidence of browser acquisition parity.

For a single changed field sample, distance work is 1,681 / 4,225 / 7,921 / 7,921 source cells for qualities 1–4, versus 9,216 / 28,224 / 57,600 / 97,344 full cells. These are two-pass source areas, not elapsed-time speedups. `results/counts.csv` separately records source area, encoded output area, actually changed cells and packed upload bytes. The baseline/full oracle setup is test-only work, not hidden work in the bounded update.
