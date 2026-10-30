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
  - **One item number on both sides (WSEC-3, 2026-10-30).** Item numbers run per contract and type over all items (WS-1), shared or
    not, and the contractor sees the same number the staff quote. From the gaps in the numbers it sees, the contractor can infer how
    many unshared items of a shared type exist and how fast they are raised; their content stays hidden. Accepted: one number that both
    sides quote is what makes a site record traceable, and two numbers for one RFI would be a correctness risk in a dispute. No separate
    portal sequence is built (backlog row: revisit it if a customer treats internal item volume as sensitive). Every screen shows the type
    word and the number ("Incident 3"), never the address form of the reference ("Incident-3"), which stays in addresses and route values.
  - **The Project team's names reach the contractor (WSEC-8).** The portal names a team member only where they act on or hold a shared
    item (`portalStaffLabel`, WS-11); it never lists the card. The purpose of that disclosure, on the product's side, is to tell the
    contractor whom to deal with on the contract. The Team card tells staff so ("{contractor} may see these names on shared items.").
    Whether the customer's employee privacy notice covers it is the customer's call as data controller: a go-live and RSAJ question, not
    product wording (backlog: the PDPA data map; `rsaj-questions.md`).
  - **A post is judged against the share state the page saw (WSEC-1).** A comment or a file attach carries `expectedShared`; when the
    locked row differs the act is refused 409, and a comment with no audience is internal on the server. Sharing cannot be undone, so a
    missing value never resolves to the more public audience.
  - **The contractor posts on open items only (WSEC-5).** Files cannot be removed from a shared item, and nobody watches a closed one, so a
    reply, a file or an answer on a Done or Cancelled item is refused; the contractor raises a new item, or staff reopen it.
  - **The throttle is the company's (WSEC-7).** Raises and replies are bounded per supplier per contract across all of its accounts, counted
    under the contract lock; an edit of an RFI's answer counts as a reply; staging for a work item counts the company's window.
- **Ruled out:**
  - Unsharing.
  - Sharing derived from the type.
  - Naming a contractor contact on a staff surface or in a notice body.
  - Removing a file from a shared item.
  - Team roles as authority.
