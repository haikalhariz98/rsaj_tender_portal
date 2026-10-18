# 0037 — The case page is keyed by the award until a contract exists

**Status:** Proposed (2026-10-18, wave C step C0). **Not accepted.** Acceptance is the product owner's act, for the founder, and is owed
before step C2 (design note 0004 §7). The decisions it records are already ruled: AC-17, AC-18, AC-19 and AC-23 in design note 0004 §4.
The contracts in design note 0004 §6.1 and §6.2 were reviewed against the code after wave G (latest `2537beaf`) and frozen on
2026-10-18. The freeze adds eleven points the rulings do not cover (F0-1 to F0-11 below). Each is the most conservative reading. Each is
logged in the decisions log as a product-owner question, and each is built to its default unless ruled otherwise.

**Relation to earlier ADRs.**
- **ADR 0007 is unchanged; this ADR complements it.** `issueAward` stays the only creator of a Contract row, and the registers stay on
  the Contract. Where a gate is shown is a screen fact, not a 0007 decision.
- **Builds on ADR 0034 D14** (restricted exercises, FR-MTD-007). It records which surface shows what for a restricted case.
- Nothing is superseded.

## Context

Award and Contract Requirements v2, Part 1 (C-1 to C-6), asks for one case from "Start the award" to "On site". Today there are two
screens:
- the award at `/awards/[id]`: 10 tabs, `exerciseIsHidden`, and the award SULIT gates (`sulitExerciseGate`);
- the contract at `/projects/[id]`: 10 tabs, which needs a Contract row, has no hidden-exercise check, and uses `sulitGate` 'contract'.

An Award is 1:1 with its Contract (`Contract.awardId` is unique), and a Contract exists only once the award is issued (ADR 0007). For
most of the awarding stage, then, there is no contract id to key a page by. `StaffNotice.href` rows are immutable apart from `readAt`.
They hold `/awards/...` and `/projects/{contractId}?tab=...` links permanently, so both URL families must keep resolving.

A restricted exercise (FR-MTD-007) is hidden from anyone not named on it. Today the award page refuses such a reader **before and after
issue**, while the contract page shows the contract to them. AC-18 keeps that split exactly, as one reversible rule. Whether a contract
formed from a restricted exercise is itself restricted is RSAJ's question (R-2).

## Decision

1. **The case is the Award. There is no Case table** (AC-1: no schema change). A case is one Award row, with its Contract once there is
   one. Lists join `Award` LEFT JOIN `Contract`.
2. **One URL, `/projects/[id]`, takes a contract id or an award id.**
   - A contract id renders the case.
   - An award id with no contract renders the case keyed by the award. Only the Award stage has readers, and no contract-only reader runs.
   - An award id whose contract exists **redirects** (`redirect()`, temporary) to the contract id, keeping the query. This applies only
     when the reader sees the case WHOLE (F0-3).
   - The sub-routes stay keyed by contract id (`/projects/[contractId]/certificates/...`, `/variations/...`).
   - `/projects/new?exercise=` holds the start form.
3. **Where a case stands is one pure rule, `caseStage`** (`src/lib/contract/case-stage.ts`, built in G3). Its database twin is
   `CASE_STAGE_WHERE`. The case list, its counts and the dashboard's Contracts card all read it, so each case is counted in exactly one
   place.
4. **Who may see a restricted case is one pure rule, `caseVisibility`** (`src/lib/contract/case-visibility.ts`, built in G3), with
   `caseVisibilityWhere` for lists and counts. It answers WHOLE, CONTRACT_STAGES_ONLY or HIDDEN. Each surface applies the answer as the
   table below says. No surface restates the rule.

   | Surface | WHOLE | CONTRACT_STAGES_ONLY | HIDDEN |
   | --- | --- | --- | --- |
   | `listCases` row and counts | full row | listed, with only the columns `listContracts` shows today; no award chips or award facts | absent |
   | `/projects/[id]` by contract id | every stage | Award stage refused and logged; contract stages render | — (a hidden case has no contract) |
   | `/projects/[id]` by award id | renders, or redirects once a contract exists | 404, logged (F0-3) | 404, logged |
   | Before signing › conditions | rendered, acts offered | not rendered; the restricted note is shown (F0-4) | — |
   | Before signing › securities | the award's register with its lodge and verify drawers, plus the contract's wages check | the contract's register exactly as its Securities tab shows it today, wages check included; no lodge or verify (F0-4) | — |
   | Case-level History | award and contract rows | contract rows only; `awardHistory` rows dropped | — |
   | `/awards/**` redirects | redirect | 404, logged (today's award page refuses before and after issue) | 404, logged |
   | Dashboard Contracts card | counted | counted, as Contracts are today | not counted |

   The restricted-exercise check runs before any redirect and before anything renders. An act that moves to the case page keeps its
   own refusal: every award act still runs through `withLockedAwardFor`.
5. **The step bar is parallel.** It has five steps: Award, Before signing, Signing, Project and Close-out. Each step has its own state
   (done, in progress, waiting or parked), derived from the existing gates. Several steps may be in progress at once (FR-CON-008:
   preparation may continue while the gate is red). Close-out is parked ("Parked until after go-live"), with no button (F-3). The bar is
   the shared `Stepper`, extended (design note 0004 §6.2); no one-off bar is drawn.
6. **Addresses are `?stage=&tab=&section=`, built only by `caseHref`** (`src/lib/contract/links.ts`). History is case-level, at
   `?tab=history` with no stage. A stage-less `?tab=` resolves by `caseTabToStep` (F0-5). Award tab ids map by `awardTabToCase`, and
   `notices` goes to the exercise (AC-22).
7. **`/awards`, `/awards/[id]` and `/awards/new` become guarded server redirects, kept permanently** because of `StaffNotice` rows. Each
   runs, in order: `requireStaff`; the organisation lookup; `caseVisibility` (404 unless WHOLE); then `redirect()`. The print views keep
   their URLs. `/configuration/awards` is untouched.
8. **The acts do not move** (AC-21, mapper's option b). The award acts stay in `src/app/awards/actions.ts` and the contract acts stay in
   `src/app/projects/[id]/*-actions.ts`. Only their drawers move. That keeps the lock order, `act-slots.ts` and `record-operations.ts`
   unchanged.

### What the C0 freeze adds (F0-1 to F0-11)

Every point below is in the frozen contracts in design note 0004 §6.1 and §6.2.

- **F0-1. Types are the code's names.** The award's kind is `InstrumentKind` (`src/lib/award/types`). Faults are `Finding` (re-exported
  by `src/lib/award/types`). The readiness gate is `ReturnType<typeof readinessGate>`. The start faults are `Finding<StartFault>[]`.
  `CaseFacts` takes the outputs the two pages already compute (`AwardEvaluation`, the panels' conditions). It does not take `AwardFacts`,
  which is an input.
- **F0-2. A main button is offered exactly where today's screen offers its drawer.** `caseSteps` decides only the order and the words;
  it never adds a gate (AC-20). The page computes each `*Offered` and `blocker` fact from the condition today's page uses, at the line
  cited in §6.1. An act that today shows `Blocked` gives `action: null`, and the block's words become the step's `next`. In particular,
  `RECORD_COMMENCEMENT` is offered when the award is ISSUED or ACCEPTED, is not a Letter of Acceptance, and has no `commencedOn`
  (`awards/[id]/page.tsx:303`). It is not narrowed to `commencementState` NOT_DUE or LATE, because that would hide the button where the
  start date or the grace period is unset. "Due" in AC-19 and in C1's test means this condition. The button sits on the **Project**
  step, because an indent goes on site when commencement is recorded (AC-17 rule 4).
- **F0-3. Under CONTRACT_STAGES_ONLY, an award id is 404 and logged on `/projects/[id]` too.** It is not redirected. That matches
  `/awards/**`, and keeps an award id from working as a key for a reader who is refused its award. The contract id works as today.
- **F0-4. Before signing under CONTRACT_STAGES_ONLY.**
  - **Securities** renders the contract's register exactly as the contract's Securities tab does today
    (`projects/[id]/page.tsx:299`), with `recordWcCheck` still offered. That act is a contract act under `staffForAct`, not
    `withLockedAwardFor`, and AC-18 keeps today's split exactly.
  - **Conditions** has no contract-side reader (it reads `LoadedAward`), so it is not rendered. The restricted note is shown in its place.
  - No `LODGE_SECURITY` or `VERIFY_SECURITY` is offered.
- **F0-5. A stage-less `?tab=` resolves by tab alone.** Persisted links need this: `src/lib/inbox/notices.ts:184` (`?tab=submissions`, in
  StaffNotice rows), `src/lib/documents/targets.ts:86` (`?tab=formation`) and `src/app/projects/securities-view.tsx` (`?tab=securities`).
  The resolution:
  - `overview` → Project › overview on a contract (F-1); Award › overview on an award-only case;
  - `securities` → Before signing › securities, on either id;
  - `history` → case-level;
  - any other tab → the one stage that lists it;
  - an unknown tab, or none → the default step.
  - A `stage` given without its tab opens that stage's first tab. A contract stage on an award-only case shows only the step's words.
- **F0-6. The default step of an ended case** is where it ended:
  - cancelled before issue → Award;
  - contract cancelled → Signing;
  - terminated → Project.
  No step of an ended case offers an action. `defaultCaseStep` therefore takes the standing as well as the steps.
- **F0-7. The visibility check stays in the app layer.** `src/lib` never imports `src/app`, and the refusal log is written by
  `exerciseIsHidden` (`src/app/_auth/sulit.ts`). So the work splits:
  - `src/lib/contract/case-load.ts` holds `resolveCase` (database only, no logging) and `listCases` (given `hidden` by its caller, as
    `casePipelineWhere` is);
  - `loadCase(actor, id)` lives in `src/app/_auth/case.ts`. It composes `resolveCase`, `exerciseIsHidden` and `caseVisibility`.
- **F0-8. The securities and submissions views stay their own readers.** `/projects?view=securities` and `view=submissions` keep wave G's
  `SecuritiesView` and `SubmissionsView`, with their own visibility rules as built. `listCases` pages only the other views
  (`CaseRowView`). `parseCaseListView` maps an unknown view to "all".
- **F0-9. `DERIVE_CAP` (In Delay's derivation cap) moves** from `src/app/projects/page.tsx:33` to `src/lib/contract/load.ts`, exported, so
  that `listCases` and the page share one cap. The In Delay and Commenced-pending-approval sets are judged over contracts as today, then
  mapped to award ids.
- **F0-10. `Stepper.selected` is optional, and its absence is today's behaviour.**
  - Without `selected`, `aria-current="step"` stays on every `current` step, so the five existing users render unchanged (C2).
  - With `selected`, only the selected step carries it.
  - `parked` is drawn dashed and greyed, and is read as "parked".
- **F0-11. Signing's actions follow the contract's status**, one act per status:

  | Status | Action | Offered when (today's page) |
  | --- | --- | --- |
  | NUMBER_ALLOCATED | START_PREPARATION | `start` (`projects/[id]/page.tsx:230`) |
  | IN_PREPARATION, RETURNED_FOR_AMENDMENT | SUBMIT_TO_LEGAL | `canSend` (`formation-panels.tsx:295`) |
  | PENDING_LEGAL_ENDORSEMENT | none: "With the legal office" | the decision stays on the Formation tab |
  | LEGALLY_ENDORSED | RECORD_SIGNATURE | `contractorBlock` (`formation-panels.tsx:361`) |
  | EXECUTED | RECORD_STAMPING | `stampBlock` (`formation-panels.tsx:381`) |
  | STAMPED | RECORD_POSSESSION | `possessionBlocker`, not offered where the office is hidden (`supervision-panels.tsx:368`) |

## Consequences

- **Easier.**
  - One case from start to site.
  - One counting rule shared by the list and the dashboard.
  - Old links keep working without a table or a migration.
  - The restricted split is one function, so R-2's answer is a one-line change and its tests.
- **Harder.**
  - The case page resolves two kinds of id, and an award-only case must run no contract-only reader. C5 tests a crash on a missing
    contract.
  - The award panels and the contract panels sit side by side under two different SULIT gates. C5 tests that each panel's SULIT fields
    are refused under the other gate.
  - Scan tests pin text in `awards/[id]/page.tsx`. C4 re-points them, citing C-3, and never weakens them.
- **Ruled out.**
  - A Case table, or any schema change for wave C.
  - Moving the award acts.
  - Forwarding a reader the award refuses through `/awards/**` or an award id.
  - A one-off step bar.
  - Building a case URL anywhere but `caseHref`.
- **Reversible.**
  - R-2 (whether such a contract is restricted) changes only `caseVisibility` and its tests.
  - R-3 (whether an indent goes through formation) changes only `caseSteps`.
