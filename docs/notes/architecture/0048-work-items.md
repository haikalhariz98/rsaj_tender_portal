# 0048 — Work items: one record, fixed types and statuses, numbered per contract

**Status:** Proposed, 2026-10-29. Written by the solution architect for Phase 3 stage 3a, from design note 0008 (amended
2026-10-29) and the product owner's rulings WS-1 to WS-24 (`docs/notes/plans/rulings/workspace-po-rulings.md`, binding). The
build plan is `docs/notes/plans/workspace-3a-build-plan.md`.

**Relation to other records.**
- **Builds beside ADR 0042** and replaces none of it. Project documents, their approvals, PW-4 (no numbers or overdue on
  documents) and the kick-off meeting are unchanged. A work item may link a project document; it never becomes one.
- **Uses ADR 0011** for files: one new attachment owner and one new purpose.
- **Uses ADR 0034** for actors, act slots and the audit actor, and **ADR 0037** for who may read a case.
- **ADR 0047 is unchanged.** `DefectItem` stays the legal defect line. The link from a Defect work item to a line is 3b's
  (closeout-plan §7 and the rulings' open line), not this record's.

## Context

Phase 3 adds the informal work around the formal acts: RFIs, site instructions, inspections, incidents, meeting actions, snags and
tasks (EX-03 to EX-07, CC-01, CC-02, PS-02). The founder wants it to work like Jira, ClickUp or Procore, with no sprints, no story
points and no custom workflows. Roadmap decision 7 and WS-24 fix the types and the status set as product defaults. These are the
choices a later stage cannot cheaply undo once rows exist.

## Decision

**D1. One table for every type.** `WorkItem` holds every item, with `type` as a closed enum of seven values: RFI,
SITE_INSTRUCTION, INSPECTION, SAFETY_INCIDENT, ACTION, DEFECT and TASK.
- A type's own facts are nullable columns on the same row: the answer and impact, the inspection result, the severity and when it
  happened, and the "From" document. Each is guarded by a CHECK so it is null outside its type.
- There is no per-type table and no entity-attribute store. The types are fixed (decision 7), and a filter such as
  "Non-conformances" (Inspection, Failed) stays one indexed query.
- A new type is a migration and a product release, never configuration.

**D2. One status set, with moves judged by one pure function.**
- The statuses are TO_DO, IN_PROGRESS, IN_REVIEW, DONE and CANCELLED.
- `moveFaults(item, actor, to)` in `src/lib/work/move.ts` is the only judge of a move. The list's select, the board's drag, the
  card's status menu and the panel's primary action all call the act that calls it.
- **Overdue is never stored** (WS-24). It is read from the due day, the status and the organisation's today. With no time zone it
  is not judged (WS-19).

**D3. Numbers per contract and type, taken under the contract lock** (WS-1).
- `number` is 1, 2, 3 … within (contract, type), with `@@unique([contractId, type, number])`.
- The act takes the contract's lock (`withLockedContract`) and writes max + 1. A cancelled item keeps its number, and numbers are
  never reused.
- The type is fixed at creation unless the product owner rules otherwise (plan OQ-3), so a number never changes.
- The short type word ("RFI", "SI", "Insp") comes from the labels map, never from the enum key.

**D4. The audience of a comment is stored when it is written.**
- `WorkItemComment.internal` is set at insert, and the row is append-only (trigger).
- In 3a every comment is internal, because nothing is shared (WS-14).
- When 3b shares an item, its earlier comments stay internal. Sharing never re-reads, and so never re-classifies, what was
  written before it.
- This is the one 3a column whose absence would leak in 3b.

**D5. Who an item is assigned to.**
- 3a assigns to an organisation `Person` or to nobody.
- WS-9's nullable per-account column (`assigneeSupplierAccountId`) is created now and written by nothing. A CHECK allows at most
  one assignee.
- `raisedByPersonId` is nullable, with a 3a CHECK that it is set. 3b replaces that CHECK with "exactly one raiser" when it adds a
  supplier-account raiser. `WorkItemComment.personId` follows the same pattern.
- The "{contractor}" company assignee and `sharedAt` (one-way sharing, §4.5) are 3b's columns. 3a has no column that could hold
  them, so no 3a act can set them.

**D6. No stored watchers** (WS-17). The recipients of a notice are derived from the raiser, the assignee and, from 3b, the lead.
There is no watcher table.

**D7. Every change is audited, and the activity feed reads the audit trail.**
- Each act writes `writeAudit` with before and after in its transaction.
- The panel's Activity merges the item's comments with its audit rows (WS-18). No second history table exists.

**D8. When items may change.** A new act-status row, `WORK_ITEM: executed(PC, MGC, FCI)`, allows acts from execution through
practical completion, making good and the final certificate. It refuses them before execution, when terminated, when cancelled and
when closed. Reading is never refused.
- This is deliberately narrower than `PROJECT_WORKSPACE`, which allows TERMINATED. Design note 0008 §5.8 makes a closed or
  terminated contract's Work read-only.

## Consequences

- **Easier:**
  - One list, one board and (in 3b) one My work query over one table.
  - 3b adds sharing, the company assignee and the team without reshaping 3a's rows.
  - A second customer needs no configuration to use work items.
- **Harder:**
  - Every type-specific field is a column and a CHECK, so a new field is a migration.
  - The contract lock serialises item writes per contract. That is acceptable at a project's volume, and it is the lock every
    contract act already takes.
- **Ruled out:**
  - Custom types, statuses, fields and workflows.
  - Stored overdue.
  - Watcher lists.
  - Renumbering.
  - Re-classifying a comment's audience after it is written.
