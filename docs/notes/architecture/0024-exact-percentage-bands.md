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
