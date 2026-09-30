# 0005 — A resolved route is persisted as an approval instance with steps

**Status:** accepted 2026-09-30 by the product owner (`docs/notes/decisions-log.md`, "· 6.1 ·" entries; plan
`docs/notes/plans/6.1-requisition.md`, OD-4, OD-7, OD-12, funder rule set)

## Context

`resolveApproval` returns a chain, but nothing records the chain a matter was sent down, who discharged each step, or which issue of the limits applied. Approvals have legal weight. FR-REQ-006/008/009 need the trail, including when a funder's rules superseded the organisation's own. 6.10 (built) records committee decisions against a matter through `matterKind` plus typed nullable foreign keys, and `decisionRecord()` is the only source that may cite one.

## Decision

- **`ApprovalInstance` is generic.** It records:
  - `matterKind` (6.10's `MatterKind`), plus one nullable typed FK per matter (`requisitionId` first)
  - the `authorityMatrixId` and `ruleKey` it resolved under
  - the boundary operator actually applied (`boundaryOperator`, null when no edge sat at the boundary)
  - `fundingOverrideApplied` and `overrideMatrixId`
  - the split check the approvers saw (`splitCheckId`)
  - `checkedAgainstMatrix` (false for a trail received from outside)
  - the warnings as JSON, and a status
- **Split state on the step.** An unset splitting check is stored as NOT_SET and shown to the approver on the step. It is never later shown as CLEAR.
- **`ApprovalStep` copies the resolved chain.** Each step records the named `Person` who discharged it, the date, the delegation used and the reason.
- **Recording without sign-in.** The Person is picked by the recording officer and shown as "recorded on behalf of, not signed". The holder or delegation check, the self-approval check and the conflict checks apply to that Person:
  - nobody decides their own requisition or one they endorsed
  - nobody discharges two steps of one instance
  - no decision is dated after the organisation's today

  The audit row stays `unattributed` until sign-in.
- **Committee steps.** A committee step links through `ApprovalStep.committeeDecisionId`. The requisition module adds `CommitteeDecision.requisitionId`, per 6.10's typed-FK rule. A step's state and its citation come only from `decisionRecord()`.
- **D3 is scoped per rule.** `AuthorityRule.followsBoundarySwitch`: existing rows are backfilled true. It must be decided on save wherever a rule edge equals `boundaryValue`. Requisition rules do not follow it, so RM300,000.00 routes to the Functional Director under either setting.
- **Funder rule sets.** A funder rule set is an `AuthorityMatrix` issue with `fundingRouteCode` set.
  - `issuedInForce()` defaults `fundingRouteCode` to null, so every existing reader excludes funder issues unchanged.
  - The issue lifecycle (`issueFault`/`predecessorOf`) is partitioned by route in the approval-matrix actions only.
  - The matrix screen labels funder issues.
  - The rule set ships empty (OQ-06).

## Consequences

- An instance is immutable once closed. Re-routing opens a new instance, and the old one stays on record.
- Maker-checker and authenticated actors attach later without changing the shape.
- Ruled out: storing only the final approver on the matter row, and a polymorphic `(type, id)` matter reference.
