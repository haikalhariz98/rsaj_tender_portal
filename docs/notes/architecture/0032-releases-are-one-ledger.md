# 0032 — Releases are one ledger, reconciled once

**Status:** Accepted (product owner's go with changes, 2026-10-04: decisions log "6.13 Part B · step 0 go WITH CHANGES",
BD-613-76, 90; OD-B8). Written at 6.13 Part B run 0; built in run 2. Plan:
`docs/notes/plans/6.13-post-award-lifecycle.md` Part B, B2 (BD-613-51), B3 OD-B8, B4 run 2, B5 `completion/release.ts`.

## Context

Part A releases the first half of retention (`RetentionRelease`, RELEASED_FIRST) and refuses the balance
(MAKING_GOOD_NOT_ISSUED). Part B releases the retention balance, the performance bond and, years later, the design
guarantee bond. The sources disagree on when: SK009 §7.7.4 at the Certificate of Making Good Defects; DAL item 17, SK014
and FR-FIN-012 on final payment; OM/P/007 the balance after the final defects inspection. A contract may also have been
completed, or a release made, before the system (BD-613-51).

## Decision

1. **Two switches, unset by default.** `PostAwardPolicy.performanceBondReleaseAt` and `retentionBalanceReleaseAt`,
   MAKING_GOOD | FINAL_PAYMENT, null. Unset refuses the release, naming the setting; it never guesses.
2. **One ledger.** `SecurityRelease` (one per security, `securityId @unique`) beside `RetentionRelease` (one per contract
   and kind): a release is recorded once, never twice; a second is refused and the reconciliation shows the first.
3. **The balance needs both events.** The retention balance needs the CMGD and a FINAL_DEFECTS joint inspection
   (FR-CMP-018); a cash or banker's-draft bond's refund needs its official receipt.
4. **The design guarantee bond survives.** It is released only from practical completion plus the configured years, after
   the CMGD and after closure.
5. **Before the system.** `CompletionOpening` records what was released, and any CMGD, before the system: a CMGD must be
   STATED (reference and day); an ASSUMED figure warns on every later certificate. The ledger counts it as released.
6. **The final account reconciles once** what the ledger holds against what it carries.

## Consequences

- Whichever event the customer chooses, there is one place a release is recorded and one reconciliation.
- Rules out: a release twice, a release at an event the customer has not chosen, and an assumed CMGD opening the final
  account.
