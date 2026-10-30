# 0049 — Sharing work items with the contractor: stored one-way sharing, the company as party, file audience, the team, the defect write-through

**Status:** Proposed, 2026-10-30. Written by the solution architect for Phase 3 stage 3b. The build plan is
`docs/notes/plans/workspace-3b-build-plan.md`, which holds the open questions; a default taken there is binding here until the
product owner rules otherwise.

**Relation to other records.**
- **Extends ADR 0048** (work items) and keeps all of it. D4 (a comment's audience is stored when it is written) and D5 (the
  per-account assignee column, unwritten) stand.
- **Uses ADR 0042** (PA047, project files kept) and **ADR 0047** (defect lines).
- Bound by WS-1 to WS-24, chiefly WS-3, WS-9, WS-10, WS-11, WS-14 and WS-17.

## Context

3b lets the contractor see and act on work items. Approvals and instructions here carry legal weight, and sharing is one-way, so
a leak cannot be taken back. Contractor contact names are SULIT to staff (WS-10, open with the founder). 3a built every item and
file as staff-only, with no audience on files.

## Decision

**D1. Sharing is a stored instant, never derived from the type.**
- `WorkItem.sharedAt` is written by the act that shares, and audited.
- A trigger makes it one-way: once set, it never changes.
- The migration does not backfill it, so every 3a item stays unshared (WS-14).
- Type defaults only preset a toggle on the New item drawer.
- An item the contractor raised or holds is shared, by CHECK.

**D2. The contractor is a party, as the company.**
- **Assignee:** `assignedToContractor` (a boolean). The awardee is fixed per contract, so no supplier FK is needed.
- **Raiser:** `raisedBySupplierAccountId`. **Writer:** `WorkItemComment.supplierAccountId`.
- **CHECKs:** exactly one raiser, exactly one writer, and at most one assignee form. A contractor's comment is never internal.
- The account columns are records, not signatures.
- Staff surfaces render every contractor actor as the awardee's name; a contact's name is never read for them. If WS-10 is
  answered yes later, that changes one label function, not the schema.
- `assigneeSupplierAccountId` stays unwritten.

**D3. A file's audience is read from when it was attached.** The portal lists a shared item's file only if the contractor
uploaded it or it was attached at or after `sharedAt`. No audience column is added.
- Every live work-item file is kept from withdrawal (PA047 widened to `WORK_ITEM_FILE`, unconditionally).
- A file on an unshared item may be detached with a reason. A file on a shared item never is.

**D4. The Project team is one table of four fixed roles.**
- `ProjectTeamMember` (contract, role, person) holds at most one Project manager per contract (partial unique).
- Removal is an audited delete with a reason.
- Roles route work and notices and never carry authority: no approval, certificate or document act reads the table.
- The lead is the Project manager, else the S.O. holders on the organisation's day.
- The team has its own act-status row, `PROJECT_TEAM`.

**D5. A Defect item linked to a defect line has its status written through by the defect acts.**
- `WorkItem.defectItemId` is unique and set on the DEFECT type only.
- The line stays the legal record (ADR 0047). Each defect act updates the linked item's status in the same transaction, so that
  list queries stay single-table.
- Item moves on a linked item call the defect acts.
- The lock order is contract → `WorkItem` → `DefectItem`, everywhere.

## Consequences

- **Easier:**
  - The portal readers filter by two columns (`sharedAt`, `internal`), which source scans can pin.
  - A later per-person contractor assignee or a WS-10 ruling needs no reshaping.
- **Harder:**
  - Status on a linked defect is held in two places, kept equal by transaction. A defect act that forgets the write-through
    drifts, so a db test per act holds it.
  - Files attached before sharing can never be shown to the contractor except by attaching them again.
- **Ruled out:**
  - Unsharing.
  - Sharing derived from the type.
  - Naming a contractor contact on a staff surface or in a notice body.
  - Removing a file from a shared item.
  - Team roles as authority.
