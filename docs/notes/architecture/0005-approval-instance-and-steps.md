# 0005 — A resolved route is persisted as an approval instance with steps

**Status:** proposed (plan `docs/notes/plans/6.1-requisition.md`)

## Context

`resolveApproval` returns a chain, but nothing records the chain a matter was actually sent down, who discharged each step, or which issue of the limits applied. Approvals have legal weight, and FR-REQ-006/008/009 need the trail. That includes the case where a funder's rule set superseded the organisation's own. Every later module (exercises, awards, variations, certificates) needs the same thing.

## Decision

- `ApprovalInstance` is generic. It records:
  - `matterKind`, plus one nullable typed foreign key per matter (`requisitionId` first)
  - the `authorityMatrixId` and `ruleKey` it resolved under
  - `fundingOverrideApplied` and `overrideMatrixId`
  - the engine warnings as JSON
  - a status
- `ApprovalStep` rows copy the resolved chain: role, act, committee, non-delegable, source rule. Each step records the named `Person` who discharged it, the date, the delegation used, and the reason.
- A committee step links to 6.10's `CommitteeDecision` through `ApprovalStep.committeeDecisionId`, on this side, so neither module edits the other's table.
- Without sign-in, the decider is picked by the recording officer, exactly as `Vote.personId` is today. The audit row stays `unattributed`.
- A funder rule set is an `AuthorityMatrix` issue with `fundingRouteCode` set. `issuedInForce()` excludes such issues from ordinary routing.

## Consequences

- The instance is immutable once closed. Re-routing (after a value change, say) opens a new instance and leaves the old one on record.
- Maker-checker and real actor identity attach later without changing the shape.
- Ruled out: storing only the final approver on the matter row.
