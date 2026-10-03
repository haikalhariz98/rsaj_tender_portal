# 0033 — The terminated account: §8.9's composition, its two switches, the rounding, the converse direction

**Status:** Accepted (product owner's go with changes, 2026-10-04: decisions log "6.13 Part B · step 0 go WITH CHANGES",
BD-613-84, 92; OD-B2, OD-B16; OQ-15). Written at 6.13 Part B run 0; built in run 4 (the rounding rule moved in run 0).
Plan: `docs/notes/plans/6.13-post-award-lifecycle.md` Part B, B2 (BD-613-47), B4 run 4, B5 `termination/account.ts`.

## Context

§8.9 sets out the account after a termination (the PMKD): the cost of completion (including a cost of loss for the days
lost, capped by a re-tender period) against the adjusted original contract price, less the securities called. The
sources leave open how the days lost are composed (OD-B2), the re-tender cap and the on-cost percentage, and what
happens when the account is owed to the contractor (OQ-15). Each of §8.9's two "± Rounding" terms is a rounding to the
ringgit, which Part A defined once for the damages line (BD-613-47).

## Decision

1. **Every component is frozen money** on `TerminatedAccount` (one per case and per certificate), with the days lost,
   the re-tender days, the cap and the composition read.
2. **Two switches, unset by default.** `PostAwardPolicy.lossDaysComposition` (both readings computed and shown; null
   refuses the account) and `retenderCapDays` (null refuses). The on-cost percentage comes from the baseline (null →
   NOT_SET). No figure from the spec computes anything; the spec's are fixtures (BD-613-102).
3. **One rounding rule.** `ladRoundingFaults`, moved to `src/lib/lad/rounding.ts` in run 0 and re-exported where Part A
   reads it: in the cost of completion beside the cost of loss (`costOfLoss + roundingLoss ≥ 0`), in the adjusted price
   beside the LAD imposed (`ladImposed + roundingLad ≥ 0`); each strictly between −RM1.00 and RM1.00; held by CHECKs on
   the table as on `ValuationDeduction`. The final account's LAD_ROUNDING line is the same rule.
4. **The direction is the balance's sign.** Owed to the employer: a demand. Owed to the contractor (OQ-15): a recorded
   manual decision with a reason, routed on `final_payment` with `cond` TERMINATED, shown ASSUMED; no demand clock.

## Consequences

- The account is reproducible from its frozen components; a later change to a policy never moves an issued PMKD.
- Rules out: a rounding outside ±RM1.00 or below nothing, a default cap or on-cost, and an automatic payment to a
  terminated contractor.
