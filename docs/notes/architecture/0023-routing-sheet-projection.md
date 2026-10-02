# 0023 — The routing sheet is a projection over the approval route plus internal checks

**Status:** Accepted (product owner's go, 2026-10-01: `docs/notes/plans/phase3-6-rulings.md` §6.14, OD-3 A, OD-4 A and
the pre-award sheet condition; written at 6.14 increment 1, 2026-10-03). Plan: `docs/notes/plans/6.14-certificates.md`.

## Context

Nine of the forms library's thirty instruments are CPD/DFA/* routing sheets: not certificates but approval wrappers,
each with the same skeleton (date received, checked by, verified by, recommended by, approved by, each with a name, a
date and a resubmission column) and an ICC column holding the service-level target (FR-CRT-007). FR-CRT-008 asks for
DATE (1) and DATE (2) and the elapsed time against the printed target; FR-CRT-009 for each resubmission side by side.
FR-CTE-014 (6.11) already reads the pre-award sheet's committee and approver blocks from the appointment route. The
recommending and approving steps are the approval matrix's (ADR 0005), and a resubmission is a successor route
(ADR 0009).

## Decision

1. **One entity, typed by configuration.** `RoutingSheetType` (code, labels, subject CERTIFICATE or AWARD, the
   certificate kind it serves or any, the printed sheet), its `RoutingCheckDef` rows (order, Checked / Verified /
   Endorsed, the office that records it, its printed days) and its `RoutingTarget` rows (target days, optionally a
   percentage band). A tenth sheet is a row. All ship empty.
2. **A projection, never a copy (OD-4 A).** The sheet is read from the route itself (`ApprovalInstance.certificateId`,
   or the award's appointment route) and its steps, plus `RoutingCheck` rows for the internal steps the matrix does
   not hold. No column copies a decision the route records.
3. **Frozen when it starts.** The type, its checks and its targets are frozen into the certificate (`routingSnapshot`)
   or the award's sheet header (`AwardRoutingSheet.typeSnapshot`) when the sheet starts; later configuration never
   moves a running sheet.
4. **DATE (1) is entered; DATE (2) is the approving step's day.** DATE (1) is the day received, never in the future,
   audited. DATE (2) is the day the approving step of the latest route decided. Elapsed time is calendar days
   (OD-3 A: assumed, shown, a question to the customer). No target reads "Target not set", never "met".
5. **Iterations are routes.** Each route opened for the document (a refusal followed by a resubmission, ADR 0009) is an
   iteration with its own received day, checks and decision, rendered side by side.
6. **Bands on the exact ratio (ADR 0024).** A banded target is chosen on the exact ratio of two amounts handed in with
   the figures, with the type's own switch for which side of an edge counts.
7. **The pre-award sheet (rulings condition).** CPD/DFA/PRE T-QUO is a type with subject AWARD over the award's
   appointment route; its checks and DATE (1) are recorded on the award. 6.11's committee and approver blocks stay as
   they were: award tests unchanged (a logged departure from the plan's Phase 2 placement, §13.4).

## Consequences

- One screen and one set of rules serve every sheet; a printed total that differs from the sum of its parts (OQ-17)
  shows both.
- A sheet can never disagree with the route it describes.
- Rules out: a `RoutingSheet` table copying decisions, a working-day count before the organisation's calendar is ruled
  for it, and a target assumed where none is configured.
