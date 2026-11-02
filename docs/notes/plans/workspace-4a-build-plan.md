# Phase 4, stage 4a — The timeline: activities, dependencies, the frozen revision and a read-only Gantt: build plan

**Status:** Proposed, 2026-11-02. Written by the solution architect on `build-all-modules` at `9fd346e8`, after 3a and 3b were
accepted on the gates (decisions log, 2026-10-30).
- The product owner rules on §8 before step 2.
- A question left unanswered takes its stated default, and that default is logged.
- **The exception is OQ-A8,** which departs from the Appendix A sketch. It takes effect only on an explicit yes; without one, the
  sketch stands.

**Inputs:**
- Roadmap phase 4 (`plans/roadmap-2026-10-27.md`).
- Design note 0008 §3.2, §7.1, §7.2, §8 and §9 "4a".
- Rulings WS-6, WS-7, WS-12, WS-13, WS-19, WS-20, WS-21, WS-22 and WS-23 (`plans/rulings/workspace-po-rulings.md`, binding).
- The 3b plan's Appendix A.
- `src/lib/supervision/{programme,delay,delay-batch,load}.ts` and `src/lib/time/view.ts`.
- `src/lib/work/store.ts`, whose `link` core 4a extends.
- `src/app/projects/[id]/supervision-panels.tsx`, the Programme card in Site › Possession and progress.

**Record:** ADR 0050 (`docs/notes/architecture/0050-programme-activities-on-revisions.md`). It covers activities on revisions,
the stable key, the freeze, the decision trigger, and progress by key.

**Founder direction applied:**
- Simple and SaaS-grade (Procore's read-only schedule, ClickUp's Gantt as a view).
- English only, desktop only, minimal words (0005).
- Dropdowns over typing.
- One primary action per screen.
- No sprints, story points or custom workflows.

**The outcome.** Staff open **Timeline** and see the programme in force as a Gantt:
- bars, summaries, milestones, finish-to-start connectors;
- today, and the completion dates with their EOT;
- a count of the open work items on each activity.

They key a submitted revision's activities into a grid before it is scrutinised. Approval freezes them. Staff record progress per
activity through **Update progress**. The contractor sees the same Gantt, read-only, on its Programme tab. The In Delay reading
does not move.

## 0. What exists, and what 4a uses (grep at `9fd346e8`)

| Need | Where | 4a's use |
|---|---|---|
| Programme revisions | `WorkProgramme` (`revision`, `kind`, `submittedOn`, scrutiny columns, `decision` APPROVED/RETURNED, `decidedOn`); CHECK `WorkProgramme_approved_after_scrutiny`. **No trigger keeps a decision from changing.** | Activities hang off it (ADR 0050 D1). A trigger makes the decision immutable (D3). |
| The revision act | `submitProgramme`, `scrutiniseProgramme`, `decideProgramme` (`src/app/projects/[id]/supervision-actions.ts`), with pure `submitFaults`, `scrutinyFaults`, `decideFaults`, `programmeInForce` and `openRevision` (`src/lib/supervision/programme.ts`). Act-status row `SUPERVISION`. | Unchanged, except one added call: `activityFaults` beside `decideFaults` on approval (D-4). |
| Planned curve and legal progress | `ProgrammePoint`, `ProgressRecord`, `plannedOn`, `inDelay`, `delay-batch.ts` | **Not touched** (WS-20). They are pinned first (step 1). |
| Completion dates and EOT | `ContractBaseline` versions (ADR 0021, 0030); `completionVersionsOf` and `timeView` (`src/lib/time/view.ts`); `ExtensionOfTime` | Read for the Gantt's completion markers, never copied. No parallel baseline model. |
| Directions and the CNC | `ProgrammeDirection`; non-completion certificates | Read as markers. |
| Time tab | `CASE_TABS.project` holds `"time"`. `page.tsx` hard-codes it (lines 228, 230, 242). Stored `StaffNotice.href` rows carry `?tab=time`. | **The id stays `time`; the label becomes "Timeline"** (D-9). |
| Programme card | Site › `start` section ("Possession and progress"), `StartSection` in `supervision-panels.tsx` | Moves to Timeline. Possession and the Progress card (In Delay) stay on Site. |
| Work links | `WorkItemLink` (CHECK exactly one of `toWorkItemId` / `projectDocumentId`), core `link` / `unlink` in `src/lib/work/store.ts`, `linkOptions` in `load.ts`, slot `WorkItemLink.person` | Gains `activityKey` as a third target (D-7). |
| Shared UI | `side-panel.tsx` (non-modal), `drawer.tsx` (`xl` = 60rem), `Toggle`, `Select`, `DataList`, `EmptyState`, `Callout`, `KeyValues`, `Badge`/`Chip` | The activity panel, the grid editor (`xl`), the zoom toggle, the revision select. |
| Portal | `PROJECT_TABS` includes `programme`; `programmeTab` in `src/lib/portal/projects/workspace-store.ts` (revisions and the delay reading) | The in-force Gantt is drawn on top, read-only, with no work counts (D-8). |
| Next codes | Migrations up to `20261210001300_work_item_file_pin`; trigger codes up to PA057 | 4a takes the next free ones at build time (PA058 and PA059 if still free). |

## 1. Scope

| In 4a | Not in 4a (where it goes) |
|---|---|
| `ProgrammeActivity` and `ProgrammeDependency` on a revision, keyed by a stable key | MS Project / Primavera import (later; it fills the same grid) |
| The grid editor on the open, unscrutinised revision: add, indent, outdent, move, delete, Depends on, Milestone, "Copy from revision n" | Compare against Revision 1, "Fill planned curve from activities", the "Activities suggest n%" hint, virtualisation (cut, WS-20) |
| The freeze: lib at scrutiny, database at the decision; the decision made immutable | Payment amounts on milestones and the milestone payment route (4b, WS-4, WS-21) |
| A read-only Gantt: summaries that collapse, bars, progress fill, milestones, FS connectors, the today line, completion markers (original and extended), direction and CNC markers, the open-item count | Dragging bars, critical path, resource levelling, working calendars (0008 §12) |
| **Update progress** (staff only, WS-6): actual start, percent complete, actual finish and forecast finish per activity | Contractor progress edits (WS-6); a contractor submitting activities from the portal |
| The activity side panel: dates, variance, predecessors and successors, progress, linked items, "Link item" | PDF of the programme (4c is certificates and letters only) |
| Work items linked to an activity, from both ends | Notices about activities (none in 4a) |
| "Time" labelled "Timeline", the Programme card moved there, and the strip in WS-7's order (OQ-A3) | |
| The portal Programme tab: the in-force Gantt, read-only | |
| The In Delay pin, written before anything else | |

## 2. Decisions (D-1 to D-12)

**D-1. The revision in force is the baseline. No new baseline model** (ADR 0050 D1).
- Activities are rows of a `WorkProgramme` revision. The Gantt draws the revision chosen in the revision select; by default that is
  the revision in force (`programmeInForce`).
- `ContractBaseline` stays the legal record of dates. The Gantt reads the completion dates (`completionVersionsOf`) and EOTs from it
  and from `ExtensionOfTime`, and never writes them.
- Screens say "Revision 3", never "baseline".

**D-2. Editing an open revision's activities.**
- Activities are saved only while the revision is open (`decision` null) **and** not yet scrutinised (`scrutinisedOn` null)
  (OQ-A1).
- After scrutiny, a wrong grid is corrected by the existing path: the revision is returned and a new one recorded.
- The pure rule is `activityEditFaults(revision)` → `DECIDED | SCRUTINISED`.
- The database backstop (ADR 0050 D3):
  - **Trigger A** (`ProgrammeActivity`, `ProgrammeDependency`; next free code, PA059 if free): it refuses INSERT, UPDATE and DELETE
    when the parent revision's `decision IS NOT NULL`;
  - **Trigger B** (`WorkProgramme`; PA058 if free): **UPDATE only.** When `OLD.decision IS NOT NULL`, it refuses any change to
    `decision` or `decidedOn`. It covers nothing else (scrutiny columns, deletes), to keep the blast radius small on a table with
    legal weight whose organisation FK cascades. The demo's own write (`prisma/demo-supervision.ts:179`, null → APPROVED) is
    untouched by it.
  - Both are `ENABLE ALWAYS`.

**D-3. One Save replaces the grid.**
- The editor holds the rows in the browser and posts the whole grid as one JSON field. The server, in one transaction:
  1. locks the contract;
  2. locks the `WorkProgramme` row `FOR UPDATE`, as `lockedRevision` does;
  3. checks `expectedDigest`, the `gridDigest` of the rows the editor opened with; a mismatch answers 409 "Someone saved this
     programme a moment ago. Reload to see it.";
  4. runs the pure faults;
  5. deletes the revision's dependencies and then its activities;
  6. inserts the activities parents-first (`insertOrder`), then the dependencies;
  7. writes one audit row on `WorkProgramme` with `gridDiff`'s before and after.
- `gridDiff` names activities by name, never by key: added, removed, and a changed field as before → after.
- **"Copy from revision n" is not an act.** It fills the editor from the revision in force, keeping the keys, and Save writes the
  rows. It is offered only when the open revision has no activities and the revision in force has some (OQ-A5). Otherwise the
  editor starts empty.

**D-4. Activities are optional. Approval refuses only a broken grid.**
- `decideFaults` is unchanged. A points-only revision is approved as today, and `NO_POINTS` stays the legal gate.
- `decideProgramme` also calls `activityFaults(rows)` on approval. Where activities exist with a blocking fault, the decision is
  refused in the fault's words. Save already refuses those faults, so this guards against rules that change later.

**D-5. The rows.**
- **Fields:** Name (typed, at most 120 characters), Start and Finish (date pickers), Milestone (a checkbox), Depends on (a
  multi-select of the other leaf rows, labelled by row number and name).
- **Duration** is shown, and never entered. It is in calendar days, inclusive (OQ-A11).
- **Summary rows.** A row with children is a summary. Its dates are derived from its children (`rollUp`) and stored null.
  - A summary takes no dependencies, and none may point at it.
  - A summary shows no progress fill. Its percentage is never invented by weighting.
- **A milestone** is a leaf with `startOn = finishOn` (CHECK), drawn as a diamond. It may not have children.
- **Depth** is at most three levels; `MAX_ACTIVITIES` is 500 (bounds).
- **Blocking faults:** a missing name; missing dates on a leaf; finish before start; a cycle; depending on itself; a dependency on
  or from a summary; too deep; too many rows; an unknown or duplicate key.
- **Warnings:**
  - a successor that starts before its predecessor finishes;
  - a start before possession;
  - a finish after the current date for completion.

  These are shown on the row and saved anyway, because the programme is the contractor's.

**D-6. Progress by activity** (ADR 0050 D5; WS-6: staff only).
- **`ActivityProgress` is one current row per (contract, key).**
  - Fields: `actualStartOn?`, `percentComplete` (an integer 0 to 100), `actualFinishOn?`, `forecastFinishOn?`,
    `recordedByPersonId`, `recordedAt`.
  - Update progress upserts the row. One audit row per changed activity holds before → after, in the same transaction.
- **Only an activity of the revision in force** can be updated (`NOT_IN_FORCE`), and only a leaf (`SUMMARY_ROW`).
- **Percent complete** is a dropdown in steps of 5 (OQ-A9). Rules (pure `progressFaults`, mirrored by CHECKs):
  - above 0 needs an actual start;
  - 100 needs an actual finish, and an actual finish needs 100;
  - finish is on or after start;
  - an actual date cannot be after today;
  - a forecast finish only while not finished.
- **A milestone row** takes one date, "Achieved on". It writes start = finish = that day and 100%.
- **A new revision carries progress by key** with no copying. A key dropped from the revision keeps its row, and that row is read
  nowhere.
- **Who may** (OQ-A2): any staff member who may read the case and holds the TRANSACTION right, acting for themselves. That is
  work items' gate, with the slot `ActivityProgress.recordedBy`. The act-status row is `SUPERVISION`, the programme's own, which
  refuses after practical completion.
- **It is not the legal progress figure.** Nothing sums it into `ProgressRecord` or reads it for In Delay.

**D-7. Work items linked to an activity.**
- `WorkItemLink + activityKey String?`. The CHECK becomes `num_nonnulls("toWorkItemId", "projectDocumentId", "activityKey") = 1`,
  with a unique (`workItemId`, `activityKey`) and an index (`activityKey`).
- `link` gains the third target. It checks that the key exists in the revision in force of the item's own contract, and refuses
  "No approved programme yet." or "That activity is not in the programme in force.".
- The audit label is "Activity · {name}".
- If a later revision drops the key, the link stays. It reads "Not in revision n", the honest gap, and is never removed quietly.
- **Linking from the item:** the panel's existing link picker gains an "Activity" group, a dropdown of the leaf activities in
  force.
- **Linking from the activity:** "Link item" picks among the contract's open items. Both ends call one core.
- **The count** on a row is the number of linked items not Done or Cancelled (`openLinkCount`).

**D-8. The portal sees the Gantt and nothing about work.**
- `portalTimeline` returns the revision in force, its rows, progress and markers, and **no** link counts or linked items. A
  scan test in the style of `supplier-reach` holds that the portal reader never selects `WorkItemLink`.
- The portal's rows are not clickable (OQ-A10). Each row's text summary carries the facts.
- Drafts (open revisions) are not shown.

**D-9. Time is labelled Timeline. The id stays `time`.**
- Tab ids are configuration keys. Keeping `time` means every stored `StaffNotice.href` and `?stage=project&tab=time` lands with no
  alias. This departs from 0008 §3.2's alias mechanics only; what the user sees is the same.
- **The strip takes WS-7's order** (OQ-A3): `overview, work, time, payments, variations, site, submissions, team`, plus History.
  4b adds no tab, so the order is settled here.
- **Site keeps** Possession and the Progress card (In Delay), so `?tab=site&section=start` still lands. The Programme card leaves
  one line there for one release: "Programme moved to Timeline", with a link.

**D-10. The Timeline tab's addresses.**
- `?tab=time`, plus:
  - `&rev={n}` (the revision shown; the default is the one in force);
  - `&activity={key}` (the panel);
  - `&zoom=week|month|quarter` (the default is month; not remembered, WS-16).
- The key is in the address only, never on screen.

**D-11. Time zone.** "In force" is `programmeInForce(revisions, today)` everywhere, with no second reading. With no organisation
time zone (WS-19), there is no today and therefore no revision in force, exactly as on today's Site card and portal tab:
- **Staff:** the revision select still lists every revision, so any of them can be read as a plan. The default view, the
  progress fill, the dot and Update progress all say "Needs the organisation's time zone.".
- **Linking an item to an activity** is refused in the same words.
- **The portal** Gantt shows the same words in place of the chart.
- **The grid editor still works.** Editing needs only the revision's own state, and its warnings compare dates, not today.

**D-12. No notices and no new act-status row.**
- Saving activities and updating progress tell nobody. The programme acts already notify where they did.
- The grid save and progress use `SUPERVISION`; links keep `WORK_ITEM`.

## 3. Contracts (written in steps 2 and 3, before any act or screen)

### 3.1 Schema (additive; `organisationId` on every model; FKs Restrict; DATE-only days; CHECKs and triggers by hand)

**Gate.** Step 2 starts only once `git status` shows `prisma/` and `src/lib/contract/case-tabs.ts` clean. Each migration folder sorts
after the newest folder on disk **at build time**.

**Migration `programme_activities`:**

| Model / change | Fields | Guards |
|---|---|---|
| `ProgrammeActivity` | `id`, `organisationId` (FK Organisation, Restrict), `programmeId` (FK WorkProgramme), `key` (String), `name`, `parentKey String?`, `startOn Date?`, `finishOn Date?`, `milestone Boolean @default(false)`, `sortOrder Int` | Unique (`programmeId`, `key`), which is also the target of the composite FKs. Composite FK (`programmeId`, `parentKey`) → (`programmeId`, `key`). Unique (`programmeId`, `sortOrder`). CHECK `key ~ '^[A-Za-z0-9-]{1,64}$'`. CHECK `char_length(name) BETWEEN 1 AND 120`. CHECK `milestone → startOn = finishOn AND startOn IS NOT NULL`. CHECK `finishOn >= startOn` when both are set. CHECK `parentKey <> key`. Trigger A. |
| `ProgrammeDependency` | `id`, `organisationId`, `programmeId`, `predecessorKey`, `successorKey` | Composite FKs (`programmeId`, `predecessorKey`) and (`programmeId`, `successorKey`) → (`programmeId`, `key`). Unique (`programmeId`, `predecessorKey`, `successorKey`). CHECK `predecessorKey <> successorKey`. Trigger A. (Cycles and summary rules are pure, D-5.) |
| `ActivityProgress` | `id`, `organisationId`, `contractId` (FK Contract), `activityKey`, `actualStartOn Date?`, `percentComplete Int`, `actualFinishOn Date?`, `forecastFinishOn Date?`, `recordedByPersonId` (FK Person), `recordedAt`, `updatedAt` | Unique (`contractId`, `activityKey`). CHECK `percentComplete BETWEEN 0 AND 100`. CHECK `percentComplete > 0 → actualStartOn IS NOT NULL`. CHECK `(actualFinishOn IS NOT NULL) = (percentComplete = 100)`. CHECK `actualFinishOn >= actualStartOn`. CHECK `actualFinishOn IS NULL OR forecastFinishOn IS NULL`. No FK to an activity, because the key spans revisions (ADR 0050 D2). |
| `WorkItemLink + activityKey String?` | | Drop the two-target CHECK; add `num_nonnulls(...) = 1` over three. Unique (`workItemId`, `activityKey`). Index (`activityKey`). |
| `WorkProgramme` | (no columns) | Trigger B (D-2). |

- **Insert order for Save:** the composite parent FK is checked per row, so parents are inserted before children (`insertOrder`).
  Do not make it deferrable.
- **The demo wipe and test clean-up never delete frozen rows** (the PA055 pattern). The builder confirms how `prisma/demo.ts` and
  `src/lib/documents/demo-wipe-plan.ts` treat PA055 rows, and copies that. `db:reset` drops the volume.

**Code that changes with the schema** (the schema-wide scans fail otherwise):
- `src/lib/auth/act-slots.ts`:
  - `slot("ActivityProgress", "recordedBy", "Recorded by")`;
  - `WorkItemLink.person` is unchanged.
- `src/lib/auth/act-wiring-scan.test.ts`: `NOT_BUILT` for `ActivityProgress.recordedBy` until step 4 wires it.
- `src/lib/audit/entity-labels.ts`: "Programme activities" (the grid's audit rows sit on `WorkProgramme`, labelled
  "programme revision n activities"), and "Activity progress".
- `src/lib/suppliers/data-export-fields.ts`: if its scan classifies every model, the three models are classified as not the
  supplier's data, each with a reason. None holds a supplier column.
- `src/lib/sulit-fields.ts`: nothing. Activity names are the contractor's own programme, so they are Internal.
- The demo wipe order (D-2 note), and `owner-check.test.ts` if it lists models.

**Bounds** (technical constants, not policy; in `src/lib/timeline/bounds.ts`, each with its reason):
- `MAX_ACTIVITIES` 500 (no virtualisation, WS-20);
- `MAX_DEPTH` 3;
- `MAX_PREDECESSORS` 20;
- `NAME_MAX` 120;
- `COLLAPSE_ABOVE` 50 (summaries start collapsed above this many rows, 0008 §7.1);
- `PROGRESS_LOOKAHEAD_DAYS` 14 (Update progress lists what is in progress and what starts within this window);
- `PERCENT_STEP` 5.

### 3.2 Types: `src/lib/timeline/types.ts` (new)

```ts
import type { Day } from "@/lib/supervision/types"; // "YYYY-MM-DD", the organisation's day

/** One row as the editor posts it. Array order is display order. */
export interface ActivityIn {
  key: string;                 // opaque, stable (ADR 0050 D2); never on screen
  name: string;
  parentKey: string | null;
  startOn: Day | null;         // null on a summary (derived)
  finishOn: Day | null;
  milestone: boolean;
  dependsOn: readonly string[]; // predecessor keys, finish-to-start
}

/** A row as read: summary dates rolled up, depth and row number filled in. */
export interface Activity extends ActivityIn {
  row: number;                 // 1-based, for words ("row 4")
  depth: number;               // 0..MAX_DEPTH-1
  summary: boolean;
  span: { startOn: Day; finishOn: Day } | null; // own dates, or the rolled-up span; null: an empty summary
}

export type GridFault =
  | { code: "TOO_MANY_ROWS" }
  | { code: "BAD_KEY" | "DUPLICATE_KEY" | "NAME_REQUIRED" | "NAME_TOO_LONG" | "DATES_REQUIRED" | "FINISH_BEFORE_START"
        | "TOO_DEEP" | "PARENT_NOT_ABOVE" | "MILESTONE_HAS_CHILDREN" | "DEPENDS_ON_ITSELF" | "DEPENDS_ON_SUMMARY"
        | "SUMMARY_DEPENDS" | "UNKNOWN_PREDECESSOR" | "TOO_MANY_PREDECESSORS"; row: number }
  | { code: "CYCLE"; rows: readonly number[] };

export type GridWarning =
  | { code: "STARTS_BEFORE_PREDECESSOR"; row: number; predecessorRow: number }
  | { code: "BEFORE_POSSESSION"; row: number; possessionOn: Day }
  | { code: "AFTER_COMPLETION"; row: number; dateForCompletion: Day };

export type EditFault = "DECIDED" | "SCRUTINISED" | "CHANGED"; // CHANGED: expectedDigest differs (409)

export interface ProgressIn {
  key: string;
  actualStartOn: Day | null;
  percentComplete: number;     // 0..100, a multiple of PERCENT_STEP
  actualFinishOn: Day | null;
  forecastFinishOn: Day | null;
}

export type ProgressFault =
  | { code: "NOT_IN_FORCE" | "SUMMARY_ROW" | "NOT_A_STEP" | "START_NEEDED" | "FINISH_NEEDS_100" | "HUNDRED_NEEDS_FINISH"
        | "FINISH_BEFORE_START" | "ACTUAL_IN_FUTURE" | "FORECAST_WHEN_FINISHED" | "MILESTONE_ONE_DATE"; key: string };

export type Zoom = "WEEK" | "MONTH" | "QUARTER";

export interface GanttMarker {
  kind: "TODAY" | "COMPLETION" | "EXTENDED_COMPLETION" | "DIRECTION" | "NON_COMPLETION";
  on: Day;
  label: string;               // words, never a code
}
```

### 3.3 Pure rules (`src/lib/timeline/`; tests beside each; table tests for the fault lists)

| File | Functions | Key tests |
|---|---|---|
| `grid.ts` | `gridFaults(rows, bounds)`, `gridWarnings(rows, { possessionOn, dateForCompletion })`, `rollUp(rows) → Activity[]`, `insertOrder(rows)`, `gridDigest(rows)`, `gridDiff(before, after)`, `activityEditFaults(rev)`, `activityFaults(rows)` (the approval guard, = blocking `gridFaults`) | Every fault code, one row each. A three-node cycle names its rows. A summary depending, or depended on, is refused. A milestone with children is refused. Depth 4 is refused. `rollUp` is the min start and max finish over the descendants, nested. `insertOrder` puts every parent before its children. `gridDigest` is equal for equal grids and changes on any field or order change. `gridDiff` names by name and holds no key (a test greps the output for the keys). `activityEditFaults` gives open → none, scrutinised → SCRUTINISED, decided → DECIDED. |
| `progress.ts` | `progressFaults(input, activity, { today, inForceKeys })`, `milestoneProgress(day)`, `varianceDays(plannedFinish, actualFinish, forecastFinish)`, `progressDue(activities, progress, today, lookahead)` (the Update progress list) | The full fault table. A milestone writes start = finish, 100%. Variance: actual first, then forecast, then null (never 0). The lookahead window's edges at today + 14. With no `today`, `progressDue` is not called (D-11). |
| `gantt.ts` | `ganttRange(activities, markers)`, `scale(range, zoom)` → columns and labels, `barOf(activity, scale)` → left and width in percent, `fillOf(progress)`, `visibleRows(activities, collapsed)`, `defaultCollapsed(activities)`, `connectors(activities, visible, scale)` (FS elbows between visible leaves only), `markersOf({ today, versions, directions, nonCompletions })` | Week, month and quarter column counts across a year boundary. A bar's start and finish are inclusive. A collapsed summary hides its descendants' bars and connectors. Above `COLLAPSE_ABOVE` rows, every summary starts collapsed. Markers: the original and extended completion from `completionVersionsOf`'s shape; no today marker with a null today. |
| `input.ts` | `parseActivityGrid(raw: unknown) → { rows } \| { errors }`, `parseProgressUpdate(form) → { rows } \| { errors }` | Hand validation, since no schema library is installed: wrong types, unknown fields, over-long arrays, non-`YYYY-MM-DD` days and non-step percentages are all refused before the pure faults run. |
| `labels.ts` | words for every fault, warning, marker and zoom; `rowSummary(activity, progress)` (the text a screen reader and the portal row read) | Every code has words; no key and no code in any output (scan). |
| `bounds.ts` | §3.1 | — |

**Scans** (in `src/lib/timeline/timeline-scan.test.ts`, except the first):
- **The In Delay scan** (step 1's own file, `src/lib/supervision/delay-isolation.test.ts`).
  `src/lib/supervision/{delay,delay-batch,programme}.ts` and `supervision/load.ts` import nothing from `@/lib/timeline`, and
  name neither `programmeActivity` nor `activityProgress`.
- **The one-writer scan.** `activityProgress.create`, `.update` and `.upsert` appear only in `src/lib/timeline/store.ts`'s
  `updateProgress`.
- **The pure scan.** No `db` import outside `store.ts` and `load.ts` (copy `work/pure-scan.test.ts`).
- **The portal scan.** `portalTimeline` and the portal Programme panel never select `WorkItemLink` or `WorkItem`.

## 4. The screens

**Staff, Timeline tab** (label "Timeline", id `time`; 0008 §7.1):

```
 [PageHeader as today]
 Timeline      [Revision 3 · In force ▾]   [Week | Month | Quarter]                       (Update progress)
 ┌ Callout (only when an open revision exists): "Revision 4 is not approved yet."  View › ─────────────────┐
 ┌ Card: Gantt ───────────────────────────────────────────────────────────────────────────────────────────┐
 │ Activity                  Start   Finish │ Sep     Oct     Nov     Dec     Jan     Feb                  │
 │ ▾ Substructure            02 Sep  18 Oct │ █████████▌                │today                           │
 │    Piling                 02 Sep  27 Sep │ ██████▒▒                                                   │
 │    Pile caps          ●2  30 Sep  18 Oct │        ███▒▒▒                                              │
 │ ◆ Practical completion    28 Feb         │                                    ◆ ┊ +30 days ┊           │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Extension of time        (Phase 2's Time content, unchanged)
 Programme revisions      (the Programme card from Site, unchanged acts; gains "Edit activities" on the open revision)
```

- **The revision select** is a dropdown, not a typed number. It lists "Revision n · In force", "· Not approved" and "· Returned".
  Viewing a revision that is not in force shows its plan with no progress fill (progress belongs to the revision in force).
- **Rows** are buttons: Enter opens the panel. A summary has a disclosure button (`aria-expanded`). Bars and connectors are
  `aria-hidden`, and each row carries `rowSummary` as visually hidden text (WS-12: Tab and Enter, no single-letter keys).
- **The ●n dot** is the number of open linked items, with a popover "2 open work items". Staff only.
- **The activity panel** (`side-panel.tsx`, non-modal, `&activity=`). It holds:
  - Planned (Revision n): start, finish, duration;
  - Actual: start, finish; % complete; forecast finish;
  - Variance: "3 days late", "2 days early", "On plan" or "—";
  - Depends on and Followed by: names, each a link to that activity;
  - Linked items: reference · title · status, each opening the item's panel on Work, and "Link item" (a dropdown of open items).
  The one primary action is **Update progress**, which opens the drawer on this activity. It shows only on the revision in force,
  for staff who may.
- **Update progress** (a drawer, `lg`) is one form in a `DataList`-styled grid, listing the activities in progress and those due
  to start within 14 days (`progressDue`), plus "Add an activity" (a dropdown of the other leaves).
  - Columns: Activity, Actual start, % (dropdown 0–100 in 5s), Actual finish, Forecast finish.
  - A milestone row shows only "Achieved on".
  - One Save. A refusal names the row.
- **Edit activities** (a drawer, `xl`) opens from the open revision's row in Programme revisions, before scrutiny only. Otherwise
  it is `Blocked` with "Scrutinised: return it and record a new revision to change it." or "Decided.".
  - Columns: #, Activity, Start, Finish (hidden on a milestone), Days (read only), Depends on (multi-select), Milestone.
  - Each row has icon buttons, each with a label: Indent, Outdent, Move up, Move down, Delete.
  - A summary row's dates show read-only.
  - "Add row" is at the foot. "Copy from revision n" shows only per D-3.
  - Faults show on the field. Warnings show as warn chips on the row, with popover words.
  - **Save** is the one primary.
- **States:**
  - **No revision:** EmptyState "No programme yet", with the existing **Record programme** drawer (OQ-A12).
  - **A revision with no activities:** EmptyState "No activities" (plus Edit activities where allowed).
  - **An open revision:** the Callout above.
  - **No time zone:** "Needs the organisation's time zone." beside the zoom; no today line.
  - **A closed contract:** read-only, with no Update progress (the act-status blocker).
  - **A large programme:** collapsed (D-5).
- **Site › Possession and progress:** the Programme card is replaced by one line, "Programme moved to Timeline ›".

**Work item panel:** the link picker gains an "Activity" group. A linked activity row reads "Activity · Pile caps" and opens
`?tab=time&activity=`. A key that is not in force reads "Activity · Pile caps · Not in revision 4".

**Portal, Programme tab:** the in-force Gantt above today's revisions list. The zoom toggle is there; there is no revision select,
no dot, no panel, and no Update progress. With no revision in force: "No programme yet", plus the existing "Send your programme in
Documents" link.

**New UI pieces** (0008 §8):
- `src/components/ui/gantt.tsx`, a client component that draws what `gantt.ts` lays out. It is CSS grid with percent-positioned
  bars and one SVG overlay for connectors and markers, with no chart library.
- The icons `diamond` and `gantt` go in `src/components/icons.tsx`.
- Nothing else is new. `Toggle`, `Select`, `side-panel`, `drawer` and `DataList` are reused.

**Words:** 0008 §13's budgets. No codes, keys or enum names on screen (`text-snapshot`).

## 5. Build steps (one heavy builder; a light builder in parallel where marked; each step ends shippable)

**Rules for every step**, as in 3b §5:
- Two builders at most, never two heavy ones. The dev server stays off during heavy gates.
- The builder reads `node_modules/next/dist/docs/` for any Next API it touches.
- Each step ends with `npm run typecheck`, `npm run lint` and its own tests. The full `npm test` runs at step 8.
- A changed existing test is listed in its commit and flagged stricter or faithful.
- **Lock order:** the contract, then the `WorkProgramme` row (grid Save and decide), then the `WorkItem` row (links), then
  `ActivityProgress` rows in key order.
- **Every act, in order, in one transaction:**
  1. the act-status row;
  2. who may act;
  3. the pure faults on the locked rows;
  4. the guarded write;
  5. `writeAudit` with before and after;
  6. `act.write` for the slot.

### Step 1 — test-engineer (light): pin the In Delay reading, before any 4a code

- **Owns:**
  - `src/lib/supervision/delay-pin.db.test.ts`: one contract per reading state, built with the existing supervision db-test
    fixtures (LAPSED, BEHIND, exactly on the line, ON_TRACK, NOT_SET, each NOT_JUDGED reason). It reads both through the single
    reader (`supervision/load`) and the batch (`delay-batch`), and asserts recorded values;
  - `src/lib/supervision/delay-isolation.test.ts`, the In Delay scan of §3.3. It is step 1's own file, ahead of the module it
    names, and it passes vacuously until `src/lib/timeline` exists.
- **Done when:** it is committed **alone, first**, and green on the tree at `9fd346e8`.
- **Tests:** the two files above.
- **Step 4 adds the "after" block, as twin contracts.** An approved revision cannot gain activities (Trigger A), and the
  NO_PROGRAMME contract has no revision. So, for each pinned state that has a programme:
  - a twin contract is built with the same points and progress;
  - its revision gets activities through Save before scrutiny and approval;
  - `ActivityProgress` rows are written on those keys (0%, 50%, 100%, and an achieved milestone);
  - the test asserts that the twin's readings, single and batch, equal the original's.

### Step 2 — data-modeler: schema, triggers and the scans that move with them

- **Owns:**
  - `prisma/schema.prisma`, the migration (§3.1), and both triggers;
  - `src/lib/timeline/{types,bounds}.ts`;
  - every file in §3.1 "Code that changes with the schema".
- **Done when:**
  - the migration applies to a scratch database, and `prisma migrate diff` is empty;
  - `npx prisma generate` and `npm run db:roles` have been run;
  - **trigger B holds on existing data:** the migration applies to a copy of the dev database (a `pg_dump` restored to a scratch
    database, never the live one while the founder demos), and the existing supervision, time and close-out db tests pass
    unchanged.
- **Tests:** `src/lib/timeline/schema.db.test.ts`:
  - each CHECK refuses its bad row;
  - a cross-revision dependency or parent cannot be written (composite FK);
  - Trigger A refuses an insert, update and delete on an approved **and** on a returned revision, and allows all three on an open
    one;
  - Trigger B refuses changing a decision, un-deciding, and changing `decidedOn` once decided, and allows deciding an open
    revision;
  - a three-target `WorkItemLink` and a two-target one are refused.

  These pass unweakened: `act-slots.test.ts`, `act-wiring-scan.test.ts`, `data-export.test.ts`, `owner-check.test.ts`, and the
  supervision and time db tests (Trigger B must not trip `decideProgramme` or the EOT acts).

### Step 3 — domain-engineer (light; may run beside step 2): the pure rules

- **Owns:** `src/lib/timeline/{grid,progress,gantt,input,labels}.ts`, their tests, and `timeline-scan.test.ts` (§3.3).
- **Done when:** every row of §3.3 has its test, and the pure scan holds.
- **Tests:** §3.3, all of them.

### Step 4 — api-engineer: the store, the readers, the acts, the link, the approval guard

- **Owns:**
  - `src/lib/timeline/store.ts`: `saveActivities(c, who, { programmeId, rows, expectedDigest })` (D-3) and
    `updateProgress(c, who, { rows })` (D-6);
  - `src/lib/timeline/load.ts`: `loadTimeline(l, { rev, today })` → revisions for the select, the shown revision's `Activity[]`,
    progress by key (in-force only), markers, the open-link counts, and the `mayEdit`/`mayUpdate` blockers with words;
    `loadActivity(l, key)`; `activityLinkOptions(l)`; `portalTimeline(actor, contractId)`;
  - `src/app/projects/[id]/timeline-actions.ts`: `saveActivitiesAction` and `updateProgressAction` (server actions, hand-parsed
    by `input.ts`; `staffForAct("TRANSACTION")`, `inContract(..., "SUPERVISION")`; `beginAct(actor, data,
    "ActivityProgress.recordedBy")` for progress);
  - in `src/lib/work/store.ts`, `link` gains `activityKey` (D-7); `load.ts`'s `linkOptions` gains the Activity group, and the
    link view gains the "Not in revision n" state;
  - in `supervision-actions.ts`, `decideProgramme` calls `activityFaults` on approval (D-4). This is one added check, and the
    existing tests stay unchanged;
  - `src/lib/contract/case-tabs.ts`: the strip order (D-9, OQ-A3), with `case-tabs.test.ts` and `case-view.test.ts` updated for
    the order only.
- **Done when:**
  - **Progress by activity saves only through Update progress** (the one-writer scan, plus a db test that a direct grid Save
    leaves `ActivityProgress` untouched);
  - an approved revision's activities refuse every edit through the store (refused in words) and directly (Trigger A);
  - a second revision copied by key shows the first's progress and links;
  - the step 1 pin's "after" block is green;
  - `?tab=time`, `?stage=project&tab=time` and `?tab=site&section=start` all land.
- **Tests:** `src/lib/timeline/timeline.db.test.ts`:
  - Save: create, replace, a stale digest gives 409, after scrutiny it is refused, the audit diff names names;
  - progress: every fault through the action, a milestone, NOT_IN_FORCE, the audit before and after;
  - links: link and unlink from both ends, a key not in force refused, the dropped-key state;
  - approval refused on a broken grid (seeded by SQL on an open revision).

  Plus `work-flow.db.test.ts` extended for the third link target, and `act-wiring-scan.test.ts` with `NOT_BUILT` removed.

### L1 — light builder (beside steps 2 to 4)

- **Owns:**
  - the `diamond` and `gantt` icons;
  - `docs/notes/prototype-differences.md`: Timeline as a new screen with no prototype, reason 0008;
  - the words in `timeline/labels.ts`, reviewed against 0005.
- **Done when:** `check-ui.mjs` passes.
- **Tests:** `npm run lint` (which runs `check-ui.mjs`), and `labels.test.ts` once step 3 lands.

### Step 5 — frontend-engineer: the Gantt and the Timeline tab (reading)

- **Owns:**
  - `src/components/ui/gantt.tsx`;
  - `src/app/projects/[id]/timeline-panel.tsx`: the header row, the revision select, zoom, the Gantt card, and the EOT content
    moved in unchanged;
  - `timeline-activity-panel.tsx`;
  - the Programme card moved out of `supervision-panels.tsx`, with the one-line pointer left behind;
  - the label "Timeline";
  - the portal Programme tab's Gantt (`src/app/supplier/projects/[id]/panels.tsx`).
- **Done when:**
  - every §4 state renders;
  - a keyboard-only walk opens a row's panel, collapses a summary and closes with Esc;
  - the 1280 and 1600 walks show no clipped column;
  - `text-snapshot` of Site and the old Time tab, diffed against the new Site and Timeline, shows every field moved and none
    dropped.
- **Tests:**
  - `timeline-screen.test.ts`: the states, no key or code in the markup, no today line with a null today, and no dot or link on
    the portal;
  - the `act-status-screens` entry for the panel (`GATED_BY_PARENT`).

### Step 6 — frontend-engineer: the grid editor, Update progress and linking

- **Owns:**
  - `timeline-editors.tsx`: the Edit activities drawer, the Update progress drawer, and "Link item" in the activity panel;
  - the Activity group in `work-item-panel.tsx`'s picker.
- **Done when:**
  - a staff member keys a 30-row programme with two summaries, dependencies and a milestone, saves, sees faults on the field and
    warnings as chips, and copies from the revision in force into a new open revision;
  - every row control works by keyboard;
  - Update progress records a start, a finish and a milestone;
  - an item is linked from both ends.
- **Tests:** `timeline-editors.test.ts` (the editor's state transitions as pure reducers, if the frontend engineer extracts
  them, with the posted JSON shape matched against `parseActivityGrid`).

### Step 7 — data-modeler: the demo (WS-22)

- **Owns:** `prisma/demo-timeline.ts`, wired into `demo:load` as its own round (additive; it writes nothing where the round is
  already there, and says so).
- **What it writes, all through the cores:**
  - on demo_con3, about 25 activities on a new revision taken through submit, Save, scrutiny and approval, with its points
    copied unchanged from the revision in force, so the planned curve and In Delay do not move. An approved demo revision cannot
    gain activities (Trigger A);
  - three summaries, finish-to-start dependencies and two milestones;
  - progress on six activities, including one milestone achieved;
  - two work items linked;
  - a second revision left open, with its grid copied from the first and one date changed;
  - one other active demo contract left points-only, to show "No activities".
- **When it cannot run, it skips.** If demo_con3 already has an open revision (`submitFaults` gives `OPEN_REVISION`), or any core
  refuses, the round writes nothing for that contract and prints the reason, as 3b's `linkingSkipped` did.
- **Done when** `checkTimelineDemo` holds:
  - it reads **every demo contract's In Delay reading** through the screens' readers before writing and after, and exits 1 on any
    difference;
  - it reads the Gantt back through `loadTimeline`.
- **Tests:** `checkTimelineDemo` itself, run by `demo:load`, plus a fresh migrate, seed and `demo:load` on a throwaway database
  (never the founder's live one), as 3b step 12 did.

### Step 8 — test-engineer, then code-reviewer and security-auditor, then ui-guidelines-reviewer: acceptance

- **Done when:**
  - the full `npm test`, typecheck and lint are green;
  - the sibling-screen check is done: Timeline against Work, Site and Payments for the header, tabs, spacing and lists, and the
    portal Programme against the portal Work tab;
  - the browser walk is done at 1280 and 1600 (staff and the public copy);
  - the 4a lines are written in `docs/notes/decisions-log.md`, and ADR 0050 is marked accepted.
- **Tests:** the full suite, and the `text-snapshot` diffs.
- **Review focus:**
  - the triggers and lock order;
  - In Delay untouched;
  - the portal never seeing work data;
  - the hand validation of the posted grid (size, types, unknown fields);
  - no key or code on screen.

## 6. Checks before acceptance (WS-22)

- [ ] The demo through `demo:load` (step 7).
- [ ] `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] The sibling-screen check, with `text-snapshot` diffs of Site, Timeline and the portal Programme tab.
- [ ] The lines in `docs/notes/decisions-log.md`.

## 7. Deliberately not done in 4a

- **MS Project and Primavera import.** The key is ready for it (ADR 0050 D2). The import adds dependency kinds and lag as columns
  with defaults, unless OQ-A8 is answered otherwise.
- **Compare, the planned curve filled from activities, and the "n%" hint** (WS-20).
- **Payment amounts, the milestone payment route, and "Achieved" as a payment fact.** These are 4b's, which may read
  `ActivityProgress.actualFinishOn` for a milestone or record its own fact.
- **Contractor progress edits** (WS-6), and submitting a programme from the portal.
- **Summary-row progress by weighting,** critical path, working calendars, dragging bars, and resource levelling.
- **Notices about activities and "late activity" lists.** My work stays items-only.
- **A Timeline tab in the Close-out strip.** EOT stays where Phase 2 put it.
- **A PDF of the Gantt.**

## 8. Open questions for the product owner (each with the default 4a builds on if unanswered)

| # | Question | Default |
|---|---|---|
| OQ-A1 | Until when may a revision's activities be edited? | **Until scrutiny.** Scrutiny judges the sequence, so the decision is taken on what was scrutinised. After it, return the revision and record a new one. The database freezes at the decision either way. |
| OQ-A2 | Who may update activity progress? | **Any staff member who may read the case and holds the TRANSACTION right**, as with work items. It is not the legal progress figure. The alternative is the holders of the PROGRESS capacity (the S.O. and delegates), which is stricter and slower on site. |
| OQ-A3 | Put the strip in WS-7's order now (Overview · Work · Timeline · Payments · Variations · Site · Documents · Team · History)? | **Yes, in 4a.** 4b adds no tab, so this is where the order lands. |
| OQ-A4 | Are a returned revision's activities readable? | **Yes, read-only**, in the revision select. |
| OQ-A5 | What does "Copy from revision n" do when the revision in force has no activities? | **It is not offered.** The grid starts empty. |
| OQ-A6 | Must a revision have activities to be approved? | **No.** Points stay the legal input. Older revisions have none. Only a broken grid blocks approval (D-4). |
| OQ-A7 | 0008 §7.1's "baseline dates" in the panel | **The revision in force's planned dates.** Showing Revision 1's dates beside them is Compare, which WS-20 cut. |
| OQ-A8 | **Departure from the Appendix A sketch: needs an explicit yes.** Finish-to-start only, with **no lag**, in 4a? | **Recommended: yes.** A lag needs a number per dependency inside a multi-select, which is the hardest cell in the grid. The import adds kind and lag later with defaults. **If unanswered, the sketch stands:** FS with an optional lag in days (-365 to 365), entered beside each chosen predecessor, drawn the same and shown in the panel. |
| OQ-A9 | Percent complete granularity | **A dropdown in steps of 5.** |
| OQ-A10 | Can the contractor open an activity on the portal? | **No.** Its rows carry their facts as text, and there is no panel. Revisit after 0008 §14 test 5. |
| OQ-A11 | Duration in calendar or working days? | **Calendar days, inclusive.** A working calendar is customer policy, and none is configured. It would be a column if asked for. |
| OQ-A12 | 0008's empty state offers "Add activities", but activities hang off a recorded revision | **The button is the existing Record programme.** Edit activities then appears on that revision. |

No question reverses a founder decision. There is no founder question.

## 9. The rulings and where each lands in 4a

| Ruling | Where |
|---|---|
| WS-6 | D-6: staff only; the portal is read-only (D-8) |
| WS-7 | D-9, OQ-A3: the strip order; Payments' label untouched |
| WS-12 | §4: Tab and Enter on rows, a disclosure button, Esc; no single-letter keys |
| WS-13 | §4 portal: no panel, list-like rows (OQ-A10) |
| WS-16 | D-10: the zoom is not remembered |
| WS-19 | D-11: no today line; Update progress refused with no time zone |
| WS-20 | §1 and §7: the cuts; D-4 and the step 1 pin keep In Delay unchanged |
| WS-21 | §7: no PDF in 4a |
| WS-22 | Steps 7 and 8; §6 |
| WS-23 | 4a after 3b-ii (accepted 2026-10-30); 4b follows |
| WS-4 | §7: payment amounts are 4b's; no column is left for them |

## 10. Risks

- **Trigger B touches an existing table with legal weight.** It is stricter than today's `updateMany` guard. Step 2 runs the
  supervision, time and close-out db tests unchanged, and step 2's "Done when" checks a migrated copy of the dev data.
- **The demo wipe against frozen rows.** If the wipe deletes per organisation, Trigger A breaks `demo:load` and test clean-up.
  Step 2 copies the PA055 handling, and a test proves it.
- **The grid editor is the largest client component yet** (rows, a tree and a multi-select). Keep its state transitions in a pure
  reducer so they are testable. Size it to `xl` (60rem) and check it at 1280. If seven columns do not fit, Days is the column
  that goes.
- **500 rows without virtualisation.** The Gantt is CSS, with one SVG, and starts collapsed above 50 rows. Measure render time on
  the demo with 500 synthetic rows in step 5. If it is slow, raise it with the product owner; do not virtualise quietly (WS-20).
- **"Baseline" means two things.** ADR 0050 D1 and the screens' words ("Revision n") keep the programme's revision apart from
  `ContractBaseline`. Reviewers grep the new screens for "baseline".
- **The key is client-made.** A crafted key could "match" another activity's progress. It is staff-only, audited, and validated
  by format and uniqueness. That is accepted, and the security auditor names it.
- **The Programme card moves.** The `text-snapshot` diff in step 5 proves that nothing on Site was lost.
