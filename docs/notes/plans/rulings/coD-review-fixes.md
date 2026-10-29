# Close-out stage D review fixes (2026-10-29): BINDING brief

Reviewed at `73141f30` by the code reviewer and a screen walk at 1280/1440. One builder fixes everything below in one pass.

## Must

- **M1. The Close tab withholds the score from everyone.** `performance-panel.tsx:57` asks the contract scope for `scoreTotal`,
  `gradeLabel`, `scores`; `sulit-fields.ts` registers the first two for the supplier scope only and `scores` for evaluation, so
  `sulitAccessAll` returns FIELD_NOT_FOR_THIS_RECORD. Add `alsoIn: ["contract"]` to `scoreTotal` and `gradeLabel`; register a
  `performanceScores` field (supplier, `alsoIn: ["contract"]`) instead of borrowing `scores`. Pure test: GRANTED on the contract
  scope for a reader with the permission.
- **M2. Scores and notes reach the browser ungated.** `performance-panel.tsx:67,90`: build `values` for `ScoresDrawer` only when
  the gate is GRANTED; run the criterion note through `sulitCell` (or drop it from `sub`).
- **M3. History prints the scores in plain text.** `performance-actions.ts:113-118` audits `criterion1..n` (unregistered) under a
  `Contract N ·` label. Audit the scores under the registered `performanceScores` field.
- **M4. Two criteria can share an order.** Refuse a repeated order in `formIssueFaults` (`CRITERION_ORDER_REPEATED`, words in
  `labels.ts`, test) and in `saveCriterion`; new additive migration `@@unique([formId, sortOrder])` on `PerformanceCriterion`
  (do not edit an applied migration).
- **M5. The Close card names the wrong opening point before the CPC.** `dlpApplies: !!rows.cpc?.dlpStart` says "practical
  completion" for every contract with no CPC; con13 (award `dlpMonths = 12`) opens at the CMGD. Compute the opening facts once in
  `src/lib` (e.g. `openFactsOf(rows)` built on `dlpOfRow`, falling back to the award's `dlpMonths > 0` before the CPC) and use it
  in both `performance-actions.ts:82` and `performance-panel.tsx:39` (review S3).
- **M6. Supplier tab strip overflows at 1280** (1012 px in 944; History hidden). Rename the "Creditor profile" tab to "Creditor".
  Give Performance a count of filed reports like its siblings (the count is not SULIT).

## Should

- **S1.** The demo's verified report on a closed contract moves to stage C's demo (no contract can close before stage C). Record
  this in the closeout plan §8 D4 and leave a stage C note; do not seed it now.
- **S2.** closeout-plan.md §6.3 fixture: 4,3,5,4,3 at 0.30/0.25/0.20/0.15/0.10 on 5 is 77.0000, not 74.0000. Correct the plan
  (the tests use 4,3,5,3,3 = 74, which is right).
- **S4.** db test: a contract whose type has no issued form is refused by the type's name.
- **S5. Issue drawer.** "Someone who did not make the draft issues it." shows when `SecurityPolicy.twoPersonChanges` is off. Pass
  the switch in; show the sentence only when it is on.
- **S6. Close card.** One status for one state: no header badge when there is no report. Reasons go in `EmptyState` children (no
  raw `<p className="text-slate-600">`), one reason at a time, under 20 words. The missing-form reason links to Settings ›
  Performance forms for people who can configure; others read "Ask an administrator to issue a {type} performance form."
- **S7. Settings › Performance forms vs its siblings.** A `PageHeader` status ("All set" / "N types without a form", warn). Count a
  type with no issued form in Settings › Contracts & payments' "needs a value" (`src/lib/nav.ts` around `contracts-payments`). With
  no forms at all: one `EmptyState` with one line and the "New form" action, no duplicate callout. A draft with faults shows Issue
  as secondary, not a second primary. "New form" matches Evaluation models' secondary "+ Start a model" style.
- **S8.** Grade bounds read "0%" / "60%", not "0.00%" (`formatMark(…, 2)` on `lowerPct`).

## Consider (do them; they are small)

- **C1.** Supplier performance list: paginate or cap the `findMany` (`suppliers/[id]/performance-panel.tsx:22`). Call `sulitGate`
  only when there is a report.
- **C3.** Never reuse a discarded draft's version number (`core.ts:113`).
- **C4.** A note without a score, or clearing a saved score: say so instead of silently dropping it.
- **Labels.** "Scores run" → "Score range" everywhere; one label for provenance ("Source") in drawer and card. Criterion "Order"
  defaults to the next number (keep it a field only if reorder needs it). Weights: match how Evaluation models shows weights
  (check it; if percentages there, percentages here). Trim the Close card info popover (drop "The contractor never sees it.").

## Not changed

- C2 (verifier office rule): deferred by plan §9.
