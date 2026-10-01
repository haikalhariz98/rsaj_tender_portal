# 0009 — A rejection goes to a destination snapshotted at open; a return to a step opens a successor route

**Status:** accepted 2026-10-01 by the product owner (`docs/notes/decisions-log.md`, close-out rulings CO-3, CO-4,
CO-5, C1, C3; plan `docs/notes/plans/phase1-closeout.md`)

## Context

FR-APR-016 needs every rejection to go somewhere — back to the originator, back to a named earlier step, or nowhere —
configured per matter type. The corpus defines no rework path at eight gates (B4), so the destination is customer
policy and ships unset. Before this, a rejected requisition waited for the officer to pick Reopen or Close (6.1 BD-5),
a committee's not-carried decision could move a requisition from Pending straight to Draft (a bypass of the state
machine), and a refused appointment always went back to Draft.

## Decision

- **`RejectionDestination`** per organisation and matter type (an approval domain: requisition, name approval,
  appointment), effective-dated, with provenance. Kinds: `RETURN_TO_ORIGINATOR`, `RETURN_TO_STEP` (naming an office),
  `TERMINATE`. A new row ends the one it replaces on the day it takes effect.
- **Snapshot at open (CO-4).** Each route stores the destination in force when it opened (`rejectionSnapshotAt`,
  kind, office, provenance). Older routes keep `rejectionSnapshotAt` null and read "not recorded". The pending step
  shows "If rejected: …" from the snapshot.
- **Who governs (CO-3).** A committee step follows the committee's own not-carried outcome as snapshotted with its
  decision: a loop returns to the originator, a terminal outcome terminates. A person step follows the snapshot.
- **Unset, or not applicable (CO-5).** Rejection is never refused. Where the snapshot is unset, names a step not on the
  route before the rejecting one, or names a destination the matter cannot take, the route records the kinds offered
  (`rejectionChoices`, `rejectionChoiceWhy`) and the officer chooses. The choice is stored as `OFFICER_CHOICE` with the
  Person it is recorded on behalf of and a reason, never as policy.
- **Successor routes.** A return to a step closes the rejected route and opens a new instance (`supersedesInstanceId`)
  with the same rule, matrix, checks and rejection snapshot. Steps before the target are carried with their decisions
  (`carriedFromStepId`); a carried committee step points at the step it was decided on and never re-cites the decision
  (C3). Steps from the target onward are pending. The chain is never shortened (FR-APR-004).
- **Every requisition status write goes through `moveRequisition`** (C1), which asks `transitionFault`. Rejected →
  Pending approval exists only with a successor route.
- What each matter does with a destination is its own: a requisition moves to Draft, Closed, or Pending approval on
  the successor; a refused name may be asked again, continues on a successor, or ends the exercise (not while an award
  stands on it); a refused appointment returns the award to Draft, continues on a successor, or cancels the award.

## Consequences

- No state without an exit: the awaiting-choice state always offers its choices.
- A configuration edit never changes what an approver was shown.
- Ruled out: re-resolving the route on a return (it could shorten the chain or change the approver mid-matter), and
  a default destination shipped with the product.
