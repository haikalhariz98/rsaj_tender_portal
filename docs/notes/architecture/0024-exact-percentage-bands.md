# 0024 — Percentage bands are judged on exact ratios

**Status:** Accepted (product owner's go, 2026-10-01: `docs/notes/plans/phase3-6-rulings.md`, ADR numbers; 6.14
condition "routing-target bands use the exact-ratio helper"; 6.13 "exact percentage bands — must-fix as the
precondition to the first production caller"). Written at 6.14 increment 1, 2026-10-03, which introduces the helper.
The approval engine's adoption is 6.13 Part A step 1 and is recorded here when it lands.

## Context

Percentages decide things in this product: a quotation variation's routing target is 2 weeks up to 20% and 6 weeks
above (FR-CRT-008); a variation's approving authority turns on 5%, 10%, 15% or 30% of the contract sum; a waiver on a
percentage of damages. Each such percentage is a ratio of two amounts of money. The approval engine's `inPercentBand`
compares a float (`pct: number`): 0.07 × 100 is 7.000000000000001 and 0.29 × 100 is 28.999999999999996, so a value
exactly on an edge can land on the wrong side of it, and a figure rounded to two places for display (20.004% shows
as 20.00%) can be judged inside a band it is above. Which side of an edge a value exactly on it falls is also a
customer's decision, not the code's.

## Decision

1. **A ratio is two amounts.** `ExactRatio { num: Sen, den: Sen }` (`src/lib/percent-band.ts`); an edge is its
   Decimal(9,4) string. The comparison is in integers: `num × 1,000,000` against `edge in ten-thousandths × den`.
   No float, no rounding before judging; `ratioPercentText` rounds for display only.
2. **The side of an edge is configuration.** `inPercentBandExact(r, min, max, upperInclusive)` reads a band as
   (min, max] or [min, max) as the caller is configured. With the side not decided, a ratio exactly on an edge has no
   band (`EDGE_UNDECIDED`), and every other ratio still has one; overlapping bands are a configuration fault, never
   resolved by order.
3. **First caller: routing targets (6.14).** `RoutingSheetType.upperEdgeInclusive` (nullable) is the switch; the
   rulings' test "20.00% → 2 weeks, 20.01% → 6 weeks" holds with it true and the other side is tested with it false.
4. **Engine adoption (6.13 Part A step 1).** The engine's float `pct` retires from the production query type in favour
   of `pctRatio`, `pctMin`/`pctMax` are loaded as decimal strings, and the edge tests (7,000.00 / 100,000.00 at 7%;
   29,000.00 / 100,000.00 at 29%; 21,000.00 / 300,000.00 at 7%) are pinned. Worked examples 7–14 change input shape
   only.

## Consequences

- A value one sen either side of an edge lands where the edge says; a value on it lands where the customer said.
- The engine's existing float path stays for its existing callers until 6.13 Part A step 1; no new caller may use it.
- Rules out: `Number()` on a percentage that decides anything, and rounding before judging.

## Amendment 1 (2026-10-03, 6.13 Part A step 1: the engine's adoption, decision 4)

Recorded here, as the run plan ruled, rather than as a new ADR. The approval engine now judges every percentage
band on the exact ratio:

- `ResolveQuery.pct` (a float) is removed from the query type; a percentage-banded matter passes `pctRatio`, the
  `ExactRatio` of its two amounts (a variation's sum over the contract sum, a waiver over the damages). The routing
  simulator's typed percentage is read as the ratio it states (`ratioOfPercent`: 12.5% is 125,000 / 1,000,000).
- `Rule.pctMin` / `pctMax` are the Decimal(9,4) strings as stored, loaded without `num()`; a band is judged with
  `inPercentBandExact`, and two rules tie only where their bands share a value compared exactly (ten-thousandths
  of a percent; money in sen).
- **The side of a percentage edge is the issue's boundary switch**, `AuthorityMatrix.boundaryInclusive`: true
  reads a band as (min, max] (a value exactly on an edge falls in the band the edge closes), false as [min, max).
  Read as not decided (null), a ratio exactly on an edge is in no band there and the route warns
  `EDGE_UNDECIDED` as an error; every other ratio keeps its band. The column itself is not nullable today
  (default true), so an issue cannot yet be "not decided" (BD-613-5, for ruling). The Approval matrix screen
  says which side a percentage edge falls and writes each band with that side ("≤ 10%" / "< 10%").
- The rulings' edge tests are pinned, each one a float gets wrong: RM7,000.00 / RM100,000.00 at a 7% edge,
  RM29,000.00 / RM100,000.00 at 29%, RM21,000.00 / RM300,000.00 at 7%, and a sen either side of each.
- §6.9.3 worked examples 7, 8, 9 and 12 change their input shape only (12% as 90,000.00 / 750,000.00,
  288,000.00 / 2,400,000.00 and 21,600.00 / 180,000.00; a 40% and a 25% waiver as 3,232.56 and 2,020.35 of
  8,081.40); examples 10, 11, 13 and 14 carry no percentage. Every expectation is unchanged.

Consequence: the float path is gone, not kept for existing callers (plan §0.3's "the float pct stays" overridden
by the rulings); no production caller passed one but the simulator.
