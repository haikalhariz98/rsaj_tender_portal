# 0050 — Programme activities hang off programme revisions, freeze with the decision, and carry progress by a stable key

**Status:** Proposed, 2026-11-02. Written by the solution architect for workspace stage 4a. The build plan is
`docs/notes/plans/workspace-4a-build-plan.md`. It holds the open questions. A default taken there is binding here until the
product owner rules otherwise.

**Relation to other records.**
- **Builds on** the programme revision act (FR-SUP-006, 012; `src/lib/supervision/programme.ts`) and keeps it.
- **Leaves ADR 0021 and ADR 0030 alone.** The contract baseline (`ContractBaseline`) stays the record of legal dates, and
  extensions of time keep writing its versions. The Gantt reads completion dates from it, and never copies them.
- **Extends ADR 0048** (work items): a link can now point at an activity.
- Bound by WS-6, WS-20 and WS-23, and by design note 0008 §7.1, §7.2 and §9 "4a".

## Context

Stage 4a gives the programme activities, dependencies and a read-only Gantt. These facts held when this was written:

- **There is no draft revision.** `submitProgramme` records a revision and its planned-curve points in one act. The revision then
  stays open until the Principal S.O. Representative approves or returns it (`decision`). Scrutiny comes before that decision.
- **The latest approved revision is the programme in force** (`programmeInForce`).
- **The In Delay reading** (FR-SUP-010) comes only from that revision's `ProgrammePoint` rows and `ProgressRecord`. It has legal
  weight, and WS-20 keeps it unchanged.
- **The word "baseline" is already taken.** `ContractBaseline` is the contract's versioned legal snapshot. EOT certificates write
  its versions.
- **Nothing in the database stops a decided revision from changing.** `decideProgramme` guards only with
  `updateMany where decision is null`.
- **An MS Project import comes later** (roadmap phase 4, 0008 §7.2). It fills the same grid, keyed on the file's own activity id.

## Decision

**D1. Activities belong to a revision.**
- `ProgrammeActivity` rows hang off `WorkProgramme`. Each row has a `key` that is unique within its revision.
- `ProgrammeDependency` (finish-to-start) and the parent of a row use composite foreign keys to `(programmeId, key)`. A link
  across revisions therefore cannot exist.
- There is no second programme model and no new baseline table.
- **"Baseline" in the timeline means the revision in force.** On the timeline screens it is called "Revision n" and never
  "baseline", so it cannot be confused with `ContractBaseline`.

**D2. The key is stable and opaque.**
- The client gives a new row a fresh UUID. "Copy from revision n" keeps the keys it copies, and a later import will store the
  file's id as the key.
- Progress and work-item links store the key, not the row id. That lets them carry across revisions with nothing re-pointed.
- A key never reaches a screen.

**D3. Editing ends at scrutiny, and the database freezes at the decision.**
- **In lib:** activities may be saved only while the revision has no scrutiny and no decision. Scrutiny judges the sequence, so
  what was scrutinised is what the decision is taken on.
- **In the database:** a trigger refuses any insert, update or delete of a revision's activities and dependencies once its
  `decision` is set, approved or returned. That keeps a returned revision readable and read-only.
- **A second trigger makes the decision itself immutable.** It is UPDATE-only: once `decision` is set, neither it nor
  `decidedOn` may change. The freeze rests on that. It deliberately covers nothing more (no scrutiny columns, no delete), to keep
  the change small on a table with legal weight whose organisation FK cascades.
- Both triggers are `ENABLE ALWAYS`, as PA055 is.

**D4. Activities are optional, and they never feed the legal reading.**
- A revision with no activities is approved exactly as today.
- Where activities exist, approval is refused if they carry a blocking fault (`activityFaults`, called beside `decideFaults`,
  which is unchanged).
- `ProgrammePoint`, `ProgressRecord`, `plannedOn`, `inDelay` and the batch reader import nothing from the timeline module, and a
  scan holds that.

**D5. Progress by activity is one current row per (contract, key).**
- Only Update progress writes it, and each change is audited with before and after in the same transaction.
- It is staff-only (WS-6).
- It is not the legal progress figure, and it is never summed into one.

## Consequences

- **Easy:**
  - a new revision carries progress and links by key;
  - a returned revision stays readable;
  - an import later is one more way to fill the open revision's grid.
- **Hard:**
  - the key is opaque, so two activities that should match must share it, which only Copy guarantees;
  - after scrutiny, correcting the grid means returning the revision and recording a new one (the existing path).
- **Ruled out:**
  - editing an approved plan;
  - dragging bars;
  - a planned curve derived from activities (WS-20);
  - comparing against Revision 1 (WS-20).
- **Demo data and test clean-up must not delete frozen rows.** They follow the PA055 pattern: the wipe never deletes them, and
  `db:reset` drops the volume.
