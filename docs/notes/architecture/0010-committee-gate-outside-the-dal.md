# 0010 — The committee gate sits outside the approval matrix, between approval and the first exercise

**Status:** accepted 2026-10-01 by the product owner (`docs/notes/decisions-log.md`, close-out rulings CO-1, CO-2, C2;
plan `docs/notes/plans/phase1-closeout.md`)

## Context

FR-REQ-012 routes project proposals and technical working papers to a committee whose decision (Perlu / Tidak Perlu /
Tidak lulus) gates the project, and a Tidak lulus loops back to proposal preparation. The spec says the gate "sits outside
every DAL matrix". Committee steps inside an approval route already exist, but they are part of the DAL chain; a gate
is not. Where it sits relative to approval is not stated (ASSUMED here, CO-1), and what Tidak Perlu means is RSAJ's
call (CO-2).

## Decision

- **Per funding route.** `FundingRoute.committeeGateRequired` is three-state with provenance: null blocks opening an
  exercise and names the setting, false means no gate, true applies the route's `CommitteeGateRule`s (committee, act,
  "strictly above" value, effective-dated, provenance). The product ships none.
- **After approval, before the first exercise (CO-1).** The gates are determined as the route closes approved, and
  stored per requisition (`RequisitionGate`) as the rules read then. A requisition approved earlier, or while the
  setting was unset, is undetermined and offers "Check committee gates". Undetermined is never a pass (C2).
- **State from the sitting only.** A gate matter is tabled as a requisition matter under the domain `committee_gate`
  and cited against the gate (`CommitteeDecision.requisitionGateId`). The gate's state is read from `decisionRecord()`
  of its matters: carried passes; not carried with a loop returns it for revision, and only a later decision moves
  it; not carried with a terminal outcome ends it; not carried with no outcome snapshot blocks. A decision serves one
  gate or one route step, never both.
- **Outcome words are the committee's (CO-2).** `Committee.carriedLabelEn/Ms` names a carried decision ("Perlu"); a
  not-carried decision is named by its `NotApprovedOutcome`. No second carried outcome and no waiver are built.
- **Ending.** An ended gate offers "Close without sourcing": Approved → Closed with a reason, releasing the commitment
  on the ledger (kept, marked released). Other abandonment stays with RSAJ.

## Consequences

- A loop re-tables the paper without unmaking the DAL approval or its commitment.
- Opening an exercise and moving one into preparation both read the gate under the requisition's lock.
- Ruled out: a gate before submission (it would sit inside the DAL chain), and a default gate rule.
