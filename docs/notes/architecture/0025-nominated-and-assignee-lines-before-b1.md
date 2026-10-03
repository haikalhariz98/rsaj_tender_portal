# 0025 — Nominated and assignee lines are recorded as totals before the annexes (B1)

**Status:** Accepted (product owner's go, 2026-10-01: `docs/notes/plans/phase3-6-rulings.md` §6.13, "B1 (OD-A8 A):
ContractParty/PartyLine totals only as printed; 'Payment annexes A1–A3 not available: totals only'; ADR 0025").
Written at 6.13 Part A step 0, 2026-10-03, before the first party is recorded. Plan:
`docs/notes/plans/6.13-post-award-lifecycle.md` A1 (B1), A2, OD-A8.

## Context

The interim certificate (CPD/B.INT(T)) and the final account carry three payment annexes: Lampiran A1 (nominated
sub-contractors), A2 (nominated suppliers) and A3 (approved assignees). FR-PAY-010 asks for them as child tables
whose totals feed the certificate's lines; FR-PAY-011 splits retention three ways; §8.4's payment waterfall pays the
nominated tier and the assignees before the main contractor. The annex schedules are not in the supplied file set.
They are cited by column number (4, 5, 6, 9 and 10), so each has at least ten columns we cannot see (spec §12
blocker B1). The spec warns that any schema built without them "will be wrong and will require data migration to
fix".

Waiting for B1 would stop the interim certificate itself: a certificate with no nominated or assignee lines
overpays the main contractor wherever a nominated party exists. The certificate prints totals for each party on
its own face, and those are known.

## Decision

1. **A party is a contract-level record.** `ContractParty`: kind NOMINATED_SUBCONTRACTOR | NOMINATED_SUPPLIER |
   ASSIGNEE, the party's name as written, the sub-contract (or assigned) sum where one is stated, and whether it is
   paid direct, each nullable and never defaulted (a direct-payment flag not answered reads "Not set" and blocks
   the act that depends on it). Recording, correcting and retiring a party is audited with before and after;
   a party a certificate has carried is never deleted. Part B's nominated-party module (FR-NSC) builds on this
   record and does not replace it.
2. **A certificate carries each party's totals, only as printed.** `PartyLine` (step 3, 4c): one row per party on a
   certificate, holding the totals the certificate's face prints for it (gross due, retention, previously
   certified, this payment), computed by the payment rules and frozen with the certificate's figures as decimal
   strings. No column of the annexes is invented: what A1–A3 hold beyond those totals is not modelled.
3. **The gap is said where it applies.** Every screen and print that would show an annex says "Payment annexes
   A1–A3 not available: totals only"; nothing renders a schedule layout it does not have.
4. **The annexes arrive as their own migration.** When B1 supplies the schedules, the columns are added beside the
   totals (a new table per annex, or columns on `PartyLine`), and the totals stay the certificate's figures.
   Certificates issued before then keep their totals and say they were issued without the annexes.

## Consequences

- The interim certificate, the retention split and the waterfall can be built and tested now (step 3), on parties
  that exist as data rather than as free text on a certificate.
- The migration risk the spec names is accepted and visible: B1 is a go-live condition (rulings, "Go-live
  conditions added"), and the founder's end-of-build list carries it (item 17).
- Rules out: guessing the annex columns, a party typed as free text on each certificate, and a nominated or assignee
  total keyed directly on a certificate rather than computed from its parties.

## Amendments

**Amendment 1 (2026-10-04, 6.13 Part B step 0 go with changes, BD-613-79, 80; written at Part B run 0, built in run 3).** Part B's nominated-party module builds beyond the totals without replacing them: prime cost sums reconciled to the baseline, the nominated package and its procurement as recorded (FR-NSC-003–005 partly met, OD-B11), the nomination and its letters, the objection and its determination, the sub-contract with its bond to the contractor, supply orders, the set-off ledger (categories 1 and 2 applied, 3 held, revisions linked) and protective direct payments. The direct-payment flag is frozen at 6.4's pack freeze; a contract whose pack predates it records it once, STATED from the tender documents, correctable once with a reason until a payment instruction or direct payment reads it (BD-613-80). Certificates still carry each party's totals only as printed (§2), and "Payment annexes A1–A3 not available: totals only" still stands until B1.
