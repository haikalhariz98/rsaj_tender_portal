# Phase 2 rulings — plans 6.2, 6.4, 6.5, 6.6 (product owner, 2026-10-01)

All four plans approved with conditions; none sent back. Order: 6.2 (step 0 first) → 6.4 (both increments) → 6.5 → 6.6,
one module at a time. 6.2 is not presented for acceptance before the document store is accepted. These rulings
override the plans' bodies where they differ. One-line entries are in `docs/notes/decisions-log.md` (2026-10-01).

## Cross-plan rulings (bind all four builds)

| # | Ruling |
|---|---|
| X-1 | Closing date and estimate amendments: 6.2 ships `versionFaults` taking `closingAt`; its action passes `null` ("Closing not set"). 6.4 reads the locked `SourcingExercise.closingAt` in the estimate actions, with an end-to-end refusal test. One name, `versionFaults`; "amendFault" dropped. Replaces "amendFault's closing half by 6.5". |
| X-2 | Dates: 6.4 writes start and closing at approval and freezes them on the approved `TenderPack` (`approvedStartOn`, `approvedClosingAt`) in that transaction. 6.5 drops `ClosingChangeKind.APPROVED`; `closingHistory` = the pack's approved dates then applied changes. Only two writers of `closingAt` (6.4 approving step, 6.5 applied `ClosingChange`), source-scanned. |
| X-3 | ADRs: 0012 6.2 sealed estimate; 0013 6.4 pack freeze and states; 0014 6.5 derived window phase; 0015 6.5 frozen invitee list; 0016 6.6 envelope register and Phase 3 key model. |
| X-4 | Demo ids: 6.2 `demo_mt11`/`d40` (Technical Committee `demo_c4`), `sx15`; 6.4 routes `demo_ai60`–`61`; 6.5 `demo_mt12`/`d41`, routes from `demo_ai62`, `sx16`–`19`; 6.6 `demo_mt13`/`d42`, routes after 6.5's, new `sx20`. Grep before use, incl. ids built by arithmetic in `demo-award.ts`. |
| X-5 | Route domain split: 6.4 step 1 adds one generic by-domain splitter and a source-scan test that no exercise-route reader filters on `awardId` alone (worklist labelled by domain). 6.5 only adds `window_change`. |
| X-6 | Migrations: each new enum value in its own migration before use. Each migration adding an attachment owner rebuilds the `num_nonnulls` CHECK from the full owner list (6.2 panel, BQ in increment 2; 6.4 `tenderPackPartId`; 6.5 `addendumId`; 6.6 `bidWithdrawalId`, `validityExtensionId`), confirmed in `pg_constraint`, with a schema-vs-CHECK test. |
| X-7 | Exercise tabs grouped by stage: Scope and estimate (Scope / Bill of quantities / Company estimate), Tender documents, Invitation (Window / Sale register / Briefing / Addenda), Bids received — 11 top-level. Second-level strip is one extension of the shared `Tabs`, linkable, built in 6.2's UI step as a design-system commit. Reversible. |
| X-8 | Every `ExerciseStatus` map exhaustive (`Record<ExerciseStatus,…>` or `never` switch); the union in `documents/attach.ts` derived from the one type. |
| X-9 | Award gate in sequence; exercises with no pack-kind snapshot (`demo_sx10`–`14`) untouched. 6.4: TENDER/QUOTATION snapshot needs APPROVED_FOR_TENDERING. 6.5 replaces it: ADVERTISED or INVITED, window phase CLOSED, no `window_change` route pending (tightening of a 6.4 test, flagged). 6.6 adds late-admission and validity checks only for exercises published through 6.5. 6.7 replaces the interim gate. |
| X-10 | Demo honesty: (a) no recorded act dated after the load day (6.2's estimate versions move to ≤ 2026-10-01); only scheduled dates may be future. (b) Window and bid instants relative to the load day; the load asserts each exercise's phase (`sx16` closed with 6.6's envelopes incl. the late one, `sx18` open, new closed `sx20`). (c) Every demo row passes the checks of its act (6.4 `sx5` pack v1 needs a lodged estimate — 6.2's demo lodges one, or 6.4 picks another exercise). (d) No RSAJ figures or sources STATED in demo policy; invented and ASSUMED; RSAJ worked examples stay test-only fixtures. |
| X-11 | Withdrawals and voided sales: a withdrawal is its own record on the exercise (letter attached, server-stamped, markings quoted), `envelopeId` set now (counter/post) or by 6.7 at opening (box); 6.7 refuses to open a matched envelope. `voidSale` refused once the window phase is CLOSED. 6.7 checks each bidder holds a live sale. |

## 6.2 — approve with conditions
Scope as ruled (two increments; OD-1..OD-10 stand). Step 0 closes Phase 1 carries 3, 4, 10 and the OD-8 chip first.
- Q-1: VERIFIED needs a live scan of the signed panel form (purpose `SPEC_PANEL_FORM`, owner `specificationPanelId`), classified SULIT at upload, never lowered; attestation keeps "recorded on behalf of, not signed".
- Q-2: estimate copies/scans never go in the document store; custody events record the paper.
- Q-3: imported CSV kept (purpose `BQ_IMPORT_SOURCE`, owner `bqVersionId`, uploaded via the Route Handler); officer picks the class (doc-store OD-7).
- Q-4: X-7. Q-5: X-1.
- Conditions: step 0 is one design-system change with a text-snapshot diff; the estimate callout names "sealed storage arrives with the electronic tender box (Phase 3)"; `preparedOn` is the organisation's day at save, never typed; demo per X-10; ADR 0012; one accessor `readSealedFigures`.

## 6.4 — approve with conditions
Increment 1: FR-DOC-001–004, 007, 008, 012, 013 + FR-MTD-012/013 carry-ins. Increment 2: FR-DOC-005, 006, 009, 010 (partly), 011, 014. Starts after 6.2 is accepted; step 1 (domain split) first, alone.
- Q-1 B: award pre-fills LAD, DLP, insurance and bond terms from the frozen Appendix; a difference needs a reason, audited, shown as "differs from the tender Appendix" on award and gate; awards without a frozen Appendix unchanged; flagged 6.11 step, new tests only.
- Q-2 A (then X-9). Q-3 A: rejection returns for amendment (RETURN_TO_ORIGINATOR, STATED); cancelling separate. Q-4 X-1. Q-5 A: day and time only.
- Q-6 A: LAD as amount or percentage; percentage resolved at award against the awarded sum, never the exercise value or estimate.
- Q-7: `/documents` stays NotBuilt (6.14). Q-8: SK001/OM-P-005 part lists are an RSAJ go-live seed (STATED) and test fixture only; go-live condition with the `tendering_approval` matrix rows.
- Conditions: X-2, X-5, X-6, X-8; `documentPackKind` unset blocks the move into preparation (6.3 fixtures gain that field only, flagged); restriction/stamp wording from configuration, no "Bumiputera" literal; increment-2 eligibility from configured registration bodies, not CIDB/MOF/SPKK columns; FR-DOC-009 at bid submission re-designated (6.7 paper, 6.15 electronic; at sale stays 6.5); increment 1 passes checks before increment 2; increment 2 accepted before 6.5; demo per X-10(c).

## 6.5 — approve with conditions
Scope FR-ADV-001–016 (009, 010 partly; 017 deferred to 6.15) + FR-DOC-010 publication window. Starts after 6.4 increment 2 is accepted.
- OD-1 A + X-2; OD-2 A (ADR 0014); OD-3 A (unset blocks; demo "latest required channel" ASSUMED; question to RSAJ); OD-4 A (pre-6.5 name routes: LIST_NOT_RECORDED, re-request with list); OD-5 A (`window_change` engine route, no rule refuses naming the Approval matrix); OD-6 A; OD-7 A; OD-8 refined (not permitted → "Not mandatory: mandatory attendance not set", no sale refused; per-event answer only when permitted); OD-9 A ("not checked" warning until 6.15, travels into 6.6–6.8); OD-10 FR-ADV-017 to 6.15; OD-11 A; OD-12 BD-7 test replaced stricter (route opens; invitation refused until a citation discharges the committee step; each `nameCitationFault` tested); OD-13 A.
- Conditions: X-2, X-4, X-5, X-6, X-9, X-10, X-11; FR-DOC-010 row (Tender Table Document availability from window phase; inspection log deferred to sign-in/6.15); `NameRouteInvitee` Restrict; tabs per X-7; ADRs 0014, 0015; each change to an accepted module in its own commit, listed.

## 6.6 — approve with conditions
Paper envelope register: FR-BID-001 partly (electronic box → Phase 3), 002–007, 009–011 built; 008 → 6.15; FR-CTE-008 and FR-CTE-007's late-tender part built; bundle report/recommendation and FR-CTE-013 → 6.8. Starts after 6.5 is accepted.
- OD-1 A: NFR-SEC-003 and the electronic box → Phase 3 with sign-in and D6 (stated departure from §13.4); option C (two-share sealing) the starting design with external crypto review; B rejected.
- OD-2 A (no party before opening; `partyId` only by 6.7, source scan). OD-3 amended: the server stamp alone decides lateness; an entered instant is the officer's stated time with a reason, shown; anything recorded after closing is LATE. OD-4 A. OD-5 committee per method, nullable; unset blocks tabling and the award only where a late envelope exists. OD-6 A (`lateAdmissionFault`). OD-7 officer names the recommended tenderer, attested, "not yet checked against an evaluation". OD-8 completeness consequence per method, nullable; unset blocks 6.7 finalising. OD-9 FR-BID-008 → 6.15. OD-10 closing day + N, ASSUMED, shown.
- Conditions: update phase1-acceptance §10 NFR-SEC-003 row before building; validity checks only on exercises published through 6.5; estimate lodgement needs no window (locks requisition → exercise → estimate); withdrawal letters SULIT; 6.10/6.11 hooks add faults and tests only; X-4, X-6, X-10 (`sx20`), X-11; ADR 0016.

## Every build
`npm test`, typecheck, lint pass; migrate diff empty and CHECKs/partial indexes present in `pg_constraint`/`pg_indexes`;
demo wipe/load round trip; siblings at 1280/1440/390 with a text-snapshot diff; no test skipped or weakened (only the BD-7
replacement, stricter); every ruling logged.

## For the founder's end-of-build review
1. NFR-SEC-003 re-designation (departs from §13.4's electronic tender box). 2. 6.4 Q-1 B (award may differ from the
Appendix with a reason). 3. The BD-7 test replacement. 4. Exercise tab grouping (X-7). 5. 6.6 OD-3 (overrode the plan).

## 6.7 Bid opening — approve with conditions (ruled 2026-10-01)

- **C-1 Estimate copy check redesigned.** No `checkEstimateCopy`. The officer enters the paper ANGGARAN SYARIKAT figure (or "paper copy not found in the box") as an input to `finaliseOpening`; compared only after every other finalise check has passed, in the `disclose()` transaction; both figures and the outcome (MATCH / MISMATCH / NOT_IN_BOX) frozen on the opening. A MISMATCH never refuses finalising; a refused finalise never stores, echoes or depends on the typed figure (test: refusal identical for any figure). MISMATCH / NOT_IN_BOX is an append-only finding shown on the Schedule that blocks 6.8 `startEvaluation` and the award until an explanation (its own append-only record) is recorded.
- **C-2 Dual control (OD-1 A).** Two authorisations by distinct present panel members, server-stamped, "recorded on behalf of, not signed"; never called "dual control" on screen; authenticated half to sign-in (stated departure from §13.4). Adjourning lapses an unpaired authorisation (kept, marked lapsed); resuming needs two fresh ones — key per sitting or a lapse field, not `@@unique([openingId, personId])`. `demo_sx20` shows a lapsed one.
- **C-3 Box timeliness.** 6.6 OD-4 is the specific rule for BOX; OD-3 governs officer-received envelopes. (a) Judged from the LOCKED event's server `recordedAt`, never an entered instant. (b) `recordedAfterClosing` stored true; the lib branches on `receivedSource = BOX_AT_OPENING`, both branches tested; label "In the box when it was locked at …". (c) Any closing-to-lock gap is a finding on the Opening tab, frozen Schedule and 6.10 bundle; no tolerance constant. ADR 0017 records it.
- **C-4 SULIT prices (OD-3 A).** Only on Opening, Schedule, print and Evaluation, each chipped "SULIT · not restricted until sign-in"; source scan covers loaders, activity-feed builder, search, dashboard, sourcing and award lists, audit-export filters; History rows chipped.
- **C-5** OD-2 A: disclose at finalisation; signed-schedule scan attached only after finalising.
- **C-6** OD-7 A refined: independence rule null → panel assigned with a warning "Independence rule not set; panel not checked", frozen in `policySnapshot`; rule on with a member's unit unrecorded blocks; `Person.orgUnitCode` checked against OrgUnit codes.
- **C-7** `Award.awardeePartyId?` (ExerciseParty, Restrict); the gate compares parties, never free-text registration; empty never matches; interim 6.7 gate needs the awardee among `evaluationSet()`.
- **C-8** 6.7 replaces the interim award gate (X-9); existing CLOSED-pass gate tests rewritten stricter (add a finalised opening with its scan) and listed; Phase 1 exercises untouched.
- **C-9** Cancellation: `cancelFaults` accepts OPENED, and OPENING_IN_PROGRESS only once adjourned, via `window_change` with reason and refund answer; opening rows kept; undisclosed estimate stays sealed; BD-29 stands; own flagged commit to 6.5.
- **C-10** 6.6 counts and screens read `receivedSource` and label BOX rows; the 6.6 OD-2 scan becomes "only `openEnvelope` writes `partyId`"; own listed commit.
- **C-11** "Supersede a 6.8 report" is 6.8's hook, not built in 6.7.
- **C-12** Step 0 re-checks §0.2 interfaces against as-built 6.2/6.4/6.5/6.6; divergence comes back for a re-ruling. ADR 0017.
- **C-13** Standard gates; demo ids grepped incl. arithmetic ones; no RSAJ figure STATED.
- Open questions: OD-1 A (C-2); OD-2 A (C-1/C-5); OD-3 A (C-4); OD-4 A — unpurchased-bid consequence per method, nullable, blocks only where such a bid exists, demo REPORT ASSUMED, question to RSAJ; OD-5 A supplementary opening, versions kept; OD-6 A own `Opening` record; OD-7 C-6; OD-8 A "Bids and opening" tab group; OD-9 switch, unset blocks finalising, ASSUMED readings shown, question to RSAJ; OD-10 A corrections before finalising with reason and audit; OD-11 refused at 14:30:00, allowed from 14:30:01.

## 6.8 Evaluation — approve with conditions (ruled 2026-10-01)

- **E-1 OD-1 B (not A).** No late pin. An exercise with no snapshot reads "Published before evaluation models existed"; `startEvaluation` refuses naming cancel and replace (FR-ADV-016).
- **E-2** Model chosen on 6.5's Invitation › Window card, pinned in the publish transaction; EVALUATION_MODEL_NOT_SET names the setting; 6.5 publish tests change only by adding a pinned model to fixtures (flagged, own commit). Go-live: RSAJ issues a model per method in use (D1).
- **E-3** SULIT as C-4; uploads SULIT, not downloadable; FR-EVL-014 partial.
- **E-4** Scorer must be appointed to that stage's side (NOT_ON_TEAM); SAME_PERSON_BOTH_SIDES stays; "recorded on behalf of, not signed".
- **E-5** `scoreDecimals` unset blocks; half-up ASSUMED; the figure judged against a pass mark is the figure shown; internal 4-place fixed point, composite from unrounded stage figures; TA 109 85.01 tested.
- **E-6** Monthly balances `Decimal(18,2)`.
- **E-7** Finalising a 6.7 supplementary opening once any evaluation version exists opens version n+1 in the same transaction and supersedes the current one; unchanged bidders' scores carried and labelled; hook in 6.7's finalise, own commit.
- **E-8** `bundleFault` (6.10 `tableMatter`, 6.11 citation) and the NOT_CARRIED LOOP trigger only for exercises published through 6.5, own commits with new tests; CO-3 unchanged otherwise; `returnsToStage` a Select of product keys rendered by label (free text a legacy warning); TERMINAL never reopens.
- **E-9** Award gate: EVALUATED, an issued non-stale report, `awardeePartyId` equal to the recommended party. Pre-fill name, registration, address, price, period, party; price/period may differ with an audited reason ("differs from the recommendation"); party cannot differ (another tenderer → NOT_CARRIED → new version). New tests only, plus C-8's stricter rewrites, listed.
- **E-10** `cancelFaults` also accepts UNDER_EVALUATION and EVALUATED; same route; records kept; open version closed as cancelled; terminal outcomes reach cancellation only through this action.
- **E-11** Partial Musts logged: FR-EVL-012 CPR entered with report attached ("not from the register") until 6.16; FR-EVL-017 annexes D/F listed, not exportable while SULIT is undownloadable; FR-EVL-014 per E-3; FR-EVL-001 identity to sign-in.
- **E-12** Demo: models and policy load first; 6.5/6.6/6.7 demo files choose a model on each published exercise (each its own listed commit); `demo_ai90`, `demo_mt14`, `demo_d43`, `demo_at60`–`63` grepped; no RSAJ figure in demo data.
- **E-13** Step 0 interface re-check as C-12; ADR 0018; standard gates.
- Open questions: OD-1 B; OD-2 A; OD-3 A store UNDER_EVALUATION and EVALUATED, derive the rest; OD-4 A (logged departure); OD-5 A NOT_BANDED shown, question to RSAJ; OD-6 A aspect (b) verdict gates, band a guide; OD-7 defer FR-EVL-020 to sign-in; OD-8 A per E-9; OD-9 as stated plus E-5; OD-10 A not an entitlement, question to RSAJ.

## For the founder's end-of-build review (continued from the list above)
6. FR-OPN-003: authenticated dual control re-designated to sign-in. 7. Box envelopes judged by box-lock time (exception to 6.6 OD-3); gaps shown, no tolerance. 8. Estimate copy check redesigned to happen at finalising. 9. Partly met Musts FR-EVL-001, 012, 014, 017. 10. 6.8 OD-8: award value may differ with a reason, awardee may not. 11. 6.8 OD-1 ruled against the plan (no late pin). 12. SULIT prices, scores and reports readable by any portal user until sign-in (off every broadcast surface).

Questions for RSAJ: 6.7 OD-4, OD-9; 6.8 OD-5, OD-10; FR-CTE-011 independence rule; D1 evaluation models.
