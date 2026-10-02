# 0021 — The contract baseline is a versioned snapshot; later facts are events

**Status:** Accepted (product owner's go, 2026-10-01: `docs/notes/plans/phase3-6-rulings.md` §6.12, OD-1 A, OD-2 A, OD-5 A and
conditions; written at 6.12 step 1, 2026-10-03). Plan: `docs/notes/plans/6.12-contract-formation.md`.

## Context

FR-CON-014 asks for a contract baseline "on execution" that every post-award calculation reads and none re-keys: the contract
sum, Contract Date, possession, date for completion, the defects liability period, LAD rate and unit, retention and its cap,
prime cost and provisional sums, the builders' works value, sections, and the interim-certificate minimums. FR-PAY-014 lets
interim certificates 1 to 3 be issued before the Contract Document is signed, so a certificate can need a baseline before
execution. The baseline's values come from several places that do not agree on precedence by themselves: the Letter of
Acceptance's terms on the award (6.11, which may differ from the tender with a reason, 6.4 Q-1 B), the frozen tender Appendix
(6.4), the bill of quantities pinned to the approved pack (6.2), the exercise's frozen terms band (6.3) and the tender documents'
policy (§8.3 interim minimum). Exercises sourced before 6.4 have no Appendix at all.

Three things go wrong with a mutable baseline: a certificate issued on Monday is re-derived on Tuesday from a corrected figure and
no longer matches what was paid; a configuration change (a policy floor, a band) silently moves a running contract; and a value
nobody stated reads as zero.

## Decision

1. **A draft, then versions that are never updated.** `ContractBaseline` holds one draft per contract (version null; a partial
   unique index) built when preparation starts, and numbered versions written once: CONFIRMED (before the first valuation, once
   the FR-PAY-014 conditions hold, OD-2 A), EXECUTED (at the RSAJ signature, the confirmed version with only the Contract Date
   added; or built from the draft where none was confirmed), POSSESSION (6.13's act) and CORRECTION (anything else, with a
   reason: CHECK). Sections are copied with each version. A version records the server's instant and the organisation's day.
2. **Every value says where it came from.** Each field that can come from more than one place carries a `…Source`: AWARD (the
   Letter of Acceptance's terms), APPENDIX (the frozen tender Appendix), BQ (the pack's pinned bill), DERIVED (computed from other
   baseline values under a policy recorded in the snapshot) or ENTERED (keyed at baseline by an officer, OD-5 A, labelled "entered
   at baseline, not from a tender Appendix", with the provenance the officer chose and no default). Precedence is the award over
   the Appendix over the bill; a value with no source is null and reads "Not set", never 0. The policy values it was built under
   (the band's retention and DLP answers, the type's behaviours, the Appendix's pack version, the interim-minimum floor and
   percentage) are frozen in `snapshot` with their provenance.
3. **Read through one accessor.** `baselineFor(versions, day)` returns the version in force on a day; 6.13, 6.14, 6.16 and 6.17
   read the baseline only through it and pin the version a certificate read. A correction after a certificate has pinned a
   version never rewrites that certificate.
4. **Later facts are events, not edits.** Possession, extensions of time and adjustments to the sum are 6.13's records; where they
   change a baseline value they write a new version, and the earlier one stays as it was. The Contract Date is not a form field:
   it is the organisation's day of the recorded RSAJ signature act (OD-1 A); a correction to an earlier day is audited, with a
   reason, never in the future and never before the day the contract was first ready to sign, and the screen says "corrected
   from …".
5. **Formation freezes what it judged.** Starting preparation snapshots the contract policy, the basis's checks and the document
   parts (`formationSnapshot`); the RSAJ signature snapshots everything it was judged under (`executedSnapshot`). Screens render
   from the snapshots, never from live configuration.

## Consequences

- A certificate can be issued before execution on a confirmed version and say so; execution adds only the Contract Date.
- Pre-6.4 contracts work: their values are ENTERED with a chosen provenance, shown as such.
- Nothing silently moves a running contract; a changed policy affects only contracts whose preparation starts after it.
- Rules out: editing a baseline version in place, reading the award, the Appendix or configuration live from a post-award
  calculation, and a keyed Contract Date.
