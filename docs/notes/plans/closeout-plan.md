# Phase 2 — Close-out and time: plan

**Status:** Accepted, 2026-10-28. Written by the solution architect on 2026-10-27 against `4579f9ac` on `build-all-modules`.
The product owner ruled on 2026-10-27 (24 rulings); every amending ruling is folded in below, and §11 lists each ruling and
where it lands. ADR 0047 records the decisions that are hard to reverse. **Stages run A → B → D → C.** Step C5 (supply close) is
removed, and termination is wholly out of Phase 2.

**Check against the code at build time.** Phase 0 and Phase 1 landed after this plan was written: `PaymentCorrection` (readers
take the latest through `CORRECTIONS` / `asCorrected`), `paidFigureOf` / `snapshotFigure` in `payment/finance.ts`, and the
funding sources (ADR 0046). EOT routes in the RSAJ pack are SK006 §7.6.1 on every contract (log, 2026-10-27); this plan does not
change them. Design note 0008 will rename the Time tab "Timeline" in Phase 4a.

**Sources:**
- The founder's roadmap of 2026-10-27, Phase 2 (`plans/roadmap-2026-10-27.md`).
- The founder's requirements CC-01 to CC-07 and VC-03 ("RSAJ Portal Requirements Requisition to Project Close-out").
- RSAJ's specification: FR-EOT-001–013, FR-CMP-001–018, FR-FIN-001–014, FR-CPR-001–008 and FR-PAY-021.

**What this reuses:** the 6.13 Part B full plan (`plans/6.13-post-award-lifecycle.md`, "Part B — full plan"), the run 1b
design note (`plans/6.13B-run1b-design.md`), the 6.14 certificate engine (`plans/6.14-certificates.md`) and the 6.16 draft
(`plans/6.16-contractor-performance.md`).

**Accepted records that bind this plan:**
- ADR 0029: the contract matter.
- ADR 0030: extensions are baseline versions.
- ADR 0031: the states after Active and the act × status table.
- ADR 0032: releases are one ledger.
- ADR 0022: the certificate record.
- ADR 0008: issued instruments are frozen.
- ADR 0042: the Project workspace.

Where this plan cuts the Part B plan's scope, the cut is listed in §1 and recorded in ADR 0047. Nothing is cut silently.

**Founder direction applied:**
- The design is simple and SaaS-grade, in English only, for the desktop only, with minimal words.
- Dropdowns are used wherever the values are known.
- Every screen has one primary action plus `MoreActions`.
- The work is additive to what is built.

## 0. What exists, and what is missing (grep at `4579f9ac`)

**Built and tested, but not wired to any screen:**

| Area | What is there | What is missing |
|---|---|---|
| Time | Schema: `DelayNotice`, `EotClaim`, `EotReason`, `ExtensionOfTime`, `LossExpenseClaim`, `PeriodExtension`, `PeriodAgreement`, `LadWaiver`. Acts in `src/app/projects/[id]/time-actions.ts`: `recordDelayNotice`, `openEotClaim`, `answerEotClaim`, `addEotReason`, `removeEotReason`, `determineEotClaim`, `sendEotClaim`. The matter's route is built in `matter-actions.ts` and `src/lib/matter/route-write.ts`, including `writeApprovalOfRecord`. Rules: `time/{entitlement,extension,route,period,loss-expense}.ts`, `contract/version-write.ts`. | `raiseEotCertificate`, and an EOT issue hook (`src/lib/time/at-issue.ts` does not exist). **Signing is blocked:** `certificate/write.ts:261` calls `matterSigningFaults`, which refuses every MATTER_APPROVED kind. `matterSigning(kind, facts)` in `matter/matter.ts:126` has no caller. Also missing: the loss-and-expense and LAD-waiver acts, the period-extension acts, and any screen. |
| Damages | The interim raise already applies waivers and returns credits (`payment/assemble.ts`, `payment/load.ts`, `lad/{credit,segments,basis,scopes}.ts`). `lad/waiver.ts` and `lad/accrual.ts` exist. | The waiver's record and send acts, the accrual meter, and the waiver and accrual settings' editors. |
| Certificates | Every needed `CertificateKind` exists. `KIND_ROUTE_RULE` is set: PRACTICAL_COMPLETION, MAKING_GOOD_DEFECTS and FINAL use APPROVED_ROUTE; SCHEDULE_OF_DEFECTS uses BY_ROUTING_TYPE; EOT uses MATTER_APPROVED. `KIND_ROUTE_DOMAIN` maps them to practical_completion, making_good and final_payment. `KIND_ISSUE_WRITES` maps them to PC, MGC and FCI. | No domain record for any of them, no raise act, and no issue hook. Issue runs only `issueRefusal` (payment) and `variationIssueRefusal` / `afterCertificateIssue` (variation) (`write.ts:386`, `:441`). |
| States | `ContractStatus` includes PRACTICALLY_COMPLETE, MAKING_GOOD_COMPLETE, FINAL_CERTIFICATE_ISSUED and CLOSED. `STATUS_WRITTEN_BY` and `contractTransition` are in `contract/status.ts`. `ACT_STATUS` (`contract/act-status.ts`) has the families COMPLETION, DEFECTS, MAKING_GOOD, SECURITY_RELEASE, FINAL_ACCOUNT, FINAL_PAYMENT and CLOSE. `contract/stage.ts` gives the derived stages. | No writer for any of these states. |
| Retention | `RetentionRelease` (FIRST, BALANCE). `releaseOf` in `payment/retention.ts`. The act `releaseRetention` passes `makingGoodIssued: false` (`payment-actions.ts:507`). | Anything that reaches the balance. |
| Securities | `SecurityInstrument` has no release fields. ADR 0032 designs `SecurityRelease`. | The table and the act. |
| Settings | `PostAwardPolicy` already holds `retentionBalanceReleaseAt`, `performanceBondReleaseAt`, `finalPreviousBasis`, `ladWaiverApplication`, `ladAntiOppressionDays`, `weatherGuidance` and `contractorPortalSigning`, each with its provenance. The baseline holds `dlp {applies, months}`. | Editors for the Part B fields (BD-613-116: "with the run that reads each"). |
| Case page | Five steps. Close-out is `{ state: "parked", next: CLOSE_OUT_PARKED }` (`case-steps.ts:278`). `CaseTabStep` excludes close-out (`case-tabs.ts`). The page prints `closeOutParked` (`page.tsx:388`). | Everything in the close-out stage. |
| Contractor portal | `/supplier/projects/[id]` has six tabs: Overview, Programme, Site diary, Payments, Certificates, Documents. The Certificates tab signs CONTRACTOR blocks where `contractorPortalSigning` is true. The Project workspace document kinds include DELAY_NOTICE, DEFECTS_RECTIFIED and STATUTORY_DECLARATION. | A defects list. |
| Performance | Only `EvaluationBidder.cprPercent`, which is typed in by hand. | Everything else. |
| Matrix | The RSAJ pack has `asSo` rows PC_T, MGD_T and FINAL_T, and quotation rows MGD_QUOTATION and FINAL_QUOTATION (`prisma/rsaj/starter-pack/approvals.ts`). The Phase 0.1 builder owns the EOT rows (SK006 §7.6.1). | Nothing for this plan. **This plan does not touch `approvals.ts`.** |

**`payment/prelims.ts`** is Part A's preliminaries rule, not close-out. It stays on the backlog row "Built and tested, not
wired".

## 1. Scope: what each requirement gets

| Requirement | In Phase 2 | Partly met / deferred, with the reason |
|---|---|---|
| VC-03, FR-EOT-001–010 | **In (stage A).** Screens for the acts that exist; the certificate raise; the issue hook writing the baseline version; supersession of the damages decision. | FR-EOT-005 weather guidance is shown from `weatherGuidance`, which ships unset. |
| FR-EOT-011–013 | **In (stage A, last step).** Period extension and the supplementary agreement, only for contract types whose `eotInstrumentKind` offers it. | The form is B6 (RSAJ's). It is refused TEMPLATE_NOT_SET until RSAJ writes it. |
| FR-EOT-006, FR-LAD-008–009, 012 | **In (stage A).** Loss and expense: record, value and send; the 1.2 line links its claim. Waivers: record, send and send again. The accrual meter. | — |
| CC-01, FR-CMP-004–007, 009 | **In (stage B).** The CPC with its defect lines. The passing joint inspection is recorded on the CPC: its day, who attended and the reasons the test is met. | **Sectional completion (FR-CMP-002): deferred.** A contract with sections is refused at the CPC by name (Q2). No `scope` or `sectionRef` is modelled (ruling 20). **The IT variant (FR-CMP-006): deferred.** A type with `completionVariant = IT` is refused by name. **Failed inspections (the FR-CMP-005 loop): deferred to Phase 3**, as Inspection work items. |
| CC-02, FR-CMP-001, 008, 011, 013, 015 | **In (stage B).** The DLP from the CPC and the baseline. A notice before it ends. Defects reported during the DLP. The Schedule of Defects at the DLP's end. The CMGD. | FR-CMP-012 (expedited class, S): Phase 3 priority. FR-CMP-014 (third-party rectification and its three recoveries), bond claims and debt claims: deferred, so the CMGD waits until every line is made good or withdrawn. The design-bond clock of FR-CMP-008 and FR-CMP-017: the bond is listed as surviving the close; its release act is deferred. |
| CC-03, FR-PAY-021, FR-CMP-016, 018 | **In (stage B).** The first release stays as built (as-built handover and `firstReleasePct`). The balance is released at the event `retentionBalanceReleaseAt` names. Securities are returned through the `SecurityRelease` ledger (ADR 0032). | INT-07 to D365 goes through a manual adapter (D365 is on hold, roadmap decision 3). |
| CC-04, FR-FIN-001, 003–013 | **In (stage C).** The final account on the FINAL certificate, with computed blocks, keyed deductions, Finance's confirmation, the pack, the declaration gate, contractor acceptance through the CONTRACTOR block, the route on `final_payment` and Finance's payment. | FR-FIN-002 (final claim window, S): deferred. FR-FIN-007: the declaration is the contractor's document, taken up by an officer; its fields are not captured as data (partly met: PDPA data minimisation). FR-FIN-008: the pack is the contract's own certificates plus a configured document list, not the eleven items fixed in code. The RSAJ pack seeds that list with three STATED items (CPD/INT-SFA-INDEN): as-built drawings, the CIDB levy certificate and the receipt of water charges (ruling 8). |
| CC-05, FR-FIN-014 | **In (stage C).** Close once every precondition holds, the verified performance report among them (ruling 17). **Supply contracts do not close in Phase 2** (ruling 19): they have no defined release event. The Close tab says closing is not built for supply contracts. Backlog row. | INT-08 goes through a manual adapter. Archiving under the retention policy stays the document store's deferred item. |
| CC-06 | Already met: `SiteRecordsHandover` (as-built drawings, O&M manuals). The close-out tabs link to it. | — |
| CC-07, FR-CPR (6.16) | **In (stage D), as a minimum viable version.** One configured form per contract type (no general form); one report per contract, opening at the CMGD (or the CPC where there is no DLP); scored, then verified by a second person; listed on the supplier. | Deferred: the other three stages of FR-CPR-005, share groups (FR-CPR-004), the LAD block (FR-CPR-007), the evaluation link (FR-EVL-012), language variants and the verifier's office rule. |
| Part B runs 3 and 4 | **Not in Phase 2.** Nominated parties (FR-NSC), termination (FR-TRM, wholly out, ruling 24), partial occupation (FR-CMP-003) and `CompletionOpening` (Q5). | They are not in the roadmap's Phase 2 list. Their models are not built. Their ACT_STATUS rows stay as they are. |

## 2. Decisions (CO-1 to CO-12)

**CO-1. Reuse the accepted records; change only what ADR 0047 says.**
- EOT is a contract matter (ADR 0029) and writes a baseline version (ADR 0030).
- Every act asks its existing `ACT_STATUS` family.
- Every release is a ledger row, never repeated (ADR 0032).
- Every certificate goes through the 6.14 engine.

**CO-2. One issue-hook map for the new kinds.**
- `src/lib/certificate/issue-hooks.ts` exports `KIND_ISSUE_HOOK: Partial<Record<CertificateKind, IssueHook>>`, with
  `IssueHook = { refusal(tx, l, cert): Promise<Words | null>; after(tx, actor, l, cert, now, today): Promise<Words | null> }`.
- `recordSignature` calls `KIND_ISSUE_HOOK[cert.kind]?.refusal` beside `issueRefusal` (`write.ts:386`), and `.after` beside
  `afterCertificateIssue` (`write.ts:441`).
- Entries: EOT, CONTRACT_PERIOD_AGREEMENT, PRACTICAL_COMPLETION, SCHEDULE_OF_DEFECTS, MAKING_GOOD_DEFECTS, FINAL.
- Payment and variation keep their own hooks and are not moved.
- A hook that writes a status goes through `contractTransition(from, to, { act })`, so `STATUS_WRITTEN_BY` holds.
- **Nothing is stranded by a status write.** Each hook that writes a status (PC, MGC, FCI) is refused WORK_WOULD_BE_STRANDED,
  naming each item, while any open item belongs to a family that `actStatusFault(family, statusThisIssueWrites)` would refuse.
  Open items are: a matter whose route is pending or not yet sent, an EOT claim not determined, and a certificate in DRAFT,
  IN_ROUTING or SIGNING. The family list is read from `ACT_STATUS` itself (`MATTER_FAMILY`, `certificateAct`), never written by
  hand. This matters because `EOT: executed(PC)` and `PERIOD_EXTENSION: executed()`: without this refusal, a CMGD would leave a
  pending EOT route undecidable and the final account's EOT_OPEN would block the contract for good. The rule is pure:
  `strandedFaults(open, writes)` in `src/lib/certificate/issue-hooks.ts`.

**CO-3. Matter signing is wired.** `proceedToSigning` (`write.ts:261`) and `draftSigningFaults` (`kinds.ts:59`) call
`matterSigning(kind, facts)`. The facts are the matter reached from the certificate's domain row: `ExtensionOfTime.claim.matter`,
or `PeriodAgreement.extension.matter`. A TERMINATION certificate has no record yet, so it stays refused, as BD-613-121 says.
`matterSigningFaults` is deleted once it has no caller.

**CO-4. One live defect line.**
- `DefectItem` holds the line. `DefectEvent` is append-only and holds what happened to it.
- A line belongs to the CPC that lists it, or it is reported during the DLP. A Schedule of Defects lists the lines still open
  when it is issued.
- An issued certificate freezes its lines (text, location, due day) in its domain row's `frozenLines` (ADR 0008): the CPC, the
  Schedule of Defects and the CMGD.
- **The CMGD freezes every line with its end state** (made good or withdrawn) in `MakingGood.frozenLines`. A withdrawn line keeps
  its reason. The CMGD and the Close checklist say "n withdrawn, not made good" (ruling 4).
- A line's state is derived only from its events, by one pure function.
- This is the Phase 3 seam (§7).

**CO-5. The DLP is frozen on the CPC.**
- At raise: `dlpStart` is the practical completion date, and `dlpEnd` is `addMonths(start, baseline.dlp.months)`, using
  `src/lib/securities/period.ts` (end exclusive, shown as the day before).
- Once the CPC leaves DRAFT, the dates are fixed. An EOT never moves them.
- If `dlp.applies` is false: no dates, no Schedule of Defects and no CMGD; the path goes straight to the final account (FR-CMP-001).
- If `dlp` is null on the baseline: the CPC is refused DLP_NOT_SET, naming the contract's baseline.

**CO-6. Release events follow the switches already shipped.**
- `retentionBalanceReleaseAt` and `performanceBondReleaseAt` are MAKING_GOOD or FINAL_PAYMENT. Null refuses, naming the setting.
- MAKING_GOOD needs the CMGD issued and its final inspection day recorded (FR-CMP-018; ADR 0032 decision 3, which is kept and
  stored as a day on `MakingGood`).
- For **retention under FINAL_PAYMENT**, the balance is part of the final certificate's recommended payment. The ledger row
  (`RetentionRelease`, BALANCE) is written when Finance's payment of the FINAL certificate is recorded, in the same transaction,
  so it is never released twice.
- A contract with no DLP has no CMGD, so its MAKING_GOOD event is read as FINAL_PAYMENT. This is said in an info popover.

**CO-7. Securities are returned one at a time.** `returnSecurity` writes `SecurityRelease`, with `securityId @unique`, so a
security is never returned twice.

| Kind | When it may be returned |
|---|---|
| Performance bond | At `performanceBondReleaseAt`'s event. |
| Retention bond | At the retention balance's event. |
| Advance payment guarantee | Once the advance is fully recouped on issued certificates (`payment/advance.ts`). |
| Design guarantee bond | Refused DGB_SURVIVES. It is listed as an obligation that survives the close. |

- A cash or banker's-draft form needs the official receipt's reference (FR-CMP-015).
- A REJECTED instrument holds nothing and is not listed.

**CO-8. The final account reuses the Part B arithmetic and cuts its paperwork.**
- The figures follow the run 5 rule (6.13 plan B5 `final/account.ts`), including the switch `finalPreviousBasis`. Its fixture
  is the test.
- **Finance's confirmation** is three columns on `FinalAccount`, not a table.
- **The statutory declaration** is a STATUTORY_DECLARATION project document marked TAKEN_UP, linked by id.
- **The pack** is the contract's issued certificates, which are listed automatically, plus a configured list of extra documents
  (`CloseoutDocumentRequirement`, shipped empty). Each one is satisfied by picking a project document of the contract from a
  dropdown, or by marking it not applicable with a reason.

**CO-9. Contractor acceptance (FR-FIN-009) is the FINAL certificate's CONTRACTOR block.**
- The printed order is Recommending, Contractor plus Witness, then S.O. It comes from the template's `FormSignatureBlock` rows,
  which are pack data.
- The contractor signs in the portal's Certificates tab where `contractorPortalSigning` is true. Otherwise an officer records the
  paper signature, with its witness block.
- No new contractor act is needed.

**CO-10. The close is an audited act, not a route** (Q3).
- It is allowed when `closureFaults` is empty, and it writes `ContractClosure` and CLOSED.
- The approvals behind it are the certificates' own routes.

**CO-11. D365 hand-offs go through a façade with the manual adapter only.**
- `src/lib/integration/closeout.ts` has `CloseoutGateway { retentionReleased(ref); closeRequested(ref) }`. `manualCloseout` does
  nothing; the officer acts in Finance's system.
- This mirrors `integration/award-commitment.ts`.
- No D365 schema appears anywhere.

**CO-12. Performance is its own record, verified by two people** (stage D; ADR 0047 D6).
- It is not a certificate kind, because a new kind fans out to every exhaustive map (6.16 plan X-8) for a form that has no DAL
  route.
- The verifier must be a different signed-in person from the assessor (CHECK and act).

## 3. The case page

### 3.1 Project stage: a new tab, "Time"

`CASE_TABS.project` gains `"time"` after `"variations"`. ACT_STATUS already allows EOT in PRACTICALLY_COMPLETE, so the tab stays
open after completion.

| Card | Contents | Primary / MoreActions |
|---|---|---|
| Completion date | Original and current date for completion, with each version from the baseline (reason EXTENSION_OF_TIME, its certificate) in a `DataList`. | — |
| Delay notices | `DataList`: received on, path, cause. | Primary: **Record delay notice** (drawer; path is a Select; "From the contractor's document" is a Select of the contract's DELAY_NOTICE documents, which fills the received day). |
| Extensions of time | `DataList` of claims: reference, state chip, days claimed, days granted. A row opens the claim page. | Primary: **Open a claim** (drawer; scope is fixed to Whole works, CO-1 / Q2). |
| Loss and expense | `DataList`: claimed, valued, state. | MoreActions: Record, Value, Send. |
| Contract period | Shown only where the type's `eotInstrumentKind` offers CONTRACT_PERIOD: extensions and agreements. | Primary: **Record period extension**. |

**The claim page, `/projects/[id]/eot/[claimId]`.**
- It is a sibling of `variations/[variationId]/page.tsx`.
- Its `PageHeader` carries the matter's reference, a state badge, and facts (scope, days claimed, days granted).
- Sections: Claim (`KeyValues`), Reasons (`DataList`), Approval (the matter's route card, reused from the variation page) and
  Certificate.
- There is one primary action, chosen by `eotNext(state)` (§6.3):

| State | Primary action |
|---|---|
| Recorded | Answer the claim |
| Answered | Add reason |
| Has reasons | Determine |
| Entitled | Send for approval |
| Approved | Raise certificate |
| Certificate raised | Open certificate |
| Granted | none |

- MoreActions: Add reason, Remove reason, Attach evidence.

**Payments › Liquidated damages** gains a Waivers list (MoreActions: Ask for a waiver, Send again) and the accrual meter
(`lad/accrual.ts`, with `ladAntiOppressionDays`; unset reads "Not set" with no alert).

### 3.2 The close-out stage, unparked

**Tabs.** `CASE_TABS["close-out"] = ["completion", "defects", "final-account", "closure"]`, labelled Completion, Defects,
Final account and Close.

| Tab | Cards |
|---|---|
| Completion | Practical completion (the CPC's facts and its certificate link); Defects liability period (start, end, days left `Meter`, no-DLP text); Making good (the CMGD); Retention (first and balance, the ledger); Securities (each instrument with its return state). |
| Defects | One `DataList` of every line: description, location, from (CPC / reported / schedule), due, state chip, overdue chip. A Schedule of Defects card appears once the DLP has ended. |
| Final account | Figures (the less and deduct blocks, recommended, split per party), Pack, Finance's confirmation, Declaration. |
| Close | Checklist (`closureFaults` as pass/fail rows), Contractor performance, surviving obligations, the Close button. |

**What's next and the one main button.**
- `case-steps.ts` gains `closeOutStep(f)`, reading `CloseoutFacts` (§6.1) through `closeoutNext(facts)`, which is pure.
- The step's state is "waiting" while ACTIVE with no CPC, "in-progress" from the first CPC draft, and "done" when CLOSED.
- The component renders what it is given and decides nothing.

| Where the contract is | What's next | Main action (`CaseAction`) |
|---|---|---|
| ACTIVE, no CPC | Practical completion not certified | `RAISE_CPC` |
| CPC in draft, routing or signing | Practical completion certificate {state} | `OPEN_CERTIFICATE` |
| PC, DLP running | Defects liability ends {day} | `ADD_DEFECT` |
| DLP ended, lines open, no schedule | {n} defects open at the end of the period | `RAISE_SCHEDULE` |
| DLP ended, lines open, schedule issued | {n} defects to make good by {day} | — (the contractor acts; officers accept on Defects) |
| DLP ended, nothing open | Ready for the certificate of making good defects | `RAISE_CMGD` |
| MGC (or PC with no DLP), a release or return due | Retention balance / {security} to release | `RELEASE_RETENTION` / `RETURN_SECURITY` |
| Ready for the final account | Final account not raised | `RAISE_FINAL_ACCOUNT` |
| Final in draft | The first of: deductions, pack, Finance's confirmation, declaration | `OPEN_FINAL_ACCOUNT` |
| FCI, not paid | Waiting for Finance's payment | `RECORD_FINAL_PAYMENT` (Finance only, else none) |
| MGC (or PC with no DLP), report not verified | Contractor performance not filed | `SCORE_PERFORMANCE` (ruling 17: the report opens at the CMGD and must be filed before the FINAL is sent for approval) |
| Every check passes | Ready to close | `CLOSE_CONTRACT` |
| CLOSED | Closed on {day} | — |

**Tests changed, each flagged in its commit:**
- `case-steps.test.ts` (close-out parked);
- `case-tabs.test.ts` (`CaseTabStep` excludes close-out; `stageTab` "Close-out has no tabs");
- `stepper.test.ts` (if the "parked" state goes).

`CaseStepState` "parked" is removed, because nothing is parked any longer. `CLOSE_OUT_PARKED` and `closeOutParked` are removed.

`/projects?view=dlp` is a judged list view (`case-work-views.ts`): DLPs ending within the notification rule's largest offset,
with the same reading as the notice.

## 4. The flows

Rules for every act, as in run 1b:
- It runs inside `withLockedContract` and asks its `ACT_STATUS` family (CANCELLED first).
- It reads the server clock once, re-reads the locked rows and runs the pure rule again.
- It writes, and audits before and after in the same transaction, with the signed-in actor (ADR 0034).
- A refusal throws, so nothing is half written.
- **Lock order:** Requisition → Exercise → Award → Contract → Certificate → domain row (`ContractMatter` first where there is one;
  then `PracticalCompletion`, `MakingGood`, `DefectSchedule`, `FinalAccount`, `PerformanceReport`) → `DefectItem` rows by
  ascending id → `SecurityInstrument` → Supplier last.
- **Who may act:** the organisation's side of ADR 0042 D2 (`recorderFaultToday`). The S.O.'s office, or a representative whose
  delegation covers SUPERVISION, raises certificates and decides defects. Finance's existing guard (`staffForAct("TRANSACTION")`
  on `recordFinancePayment`) confirms totals and records payments.

### 4.1 Extension of time (stage A)

**States, derived by `eotClaimState`:** Recorded → Answered → Determined.
- Not entitled: the claim closes and the damages decision is offered (existing).
- Entitled: Sent → Approved, or Refused (the destination is chosen, existing) → Certificate raised → Granted.

**DAL:** domain `eot`, condition `eotCondOf(financialImpact)`. The rows belong to the Phase 0.1 builder (SK006 §7.6.1). A
committee step is tabled from the matter (`tablingOf`).

**Raise (`raiseEotCertificate`, family EOT; run 1b note §6.6):**
- Inputs: the days granted, and the period not extended (when PARTIAL).
- Refusals: MATTER_NOT_APPROVED, EOT_CERTIFICATE_LIVE, GRANTED_DAYS_REQUIRED, UNEXTENDED_NOTE_REQUIRED, NO_DATE_FOR_COMPLETION,
  TEMPLATE_NOT_SET (`raiseFormFault`).
- Warning: GRANT_DIFFERS.

**Sign:** the template's blocks. The S.O./P.D. signs as the authorising block, with office rule SO (SK006 §7.7.1). This is
template data, not code, and not a stage A pack edit (ruling 23): the **demo** EOT template carries an SO authorising block, and
A1 tests that the certificate signs only after its matter is approved and that the SO block resolves to the contract's S.O.
RSAJ's own post-award certificate templates are a backlog row.

**Issue (`KIND_ISSUE_HOOK.EOT`):**
- *refusal:* EOT_MOVED.
- *after:* `writeExtensionVersion` (EXTENSION_OF_TIME); then `ExtensionOfTime.baselineId`; then every live decision whose scope
  moves gets `NonCompletion.supersededByEotId`, with its note (ADR 0030 §2).
- The next interim's credit is already computed (`lad/credit.ts` through `assemble.ts`).

**Audit:** ExtensionOfTime CREATE, the baseline version CREATE (the version writer's own), and NonCompletion UPDATE.

**Both orders** (existing `both-orders.test.ts`, extended):
- EOT issued after an interim was raised: the interim's issue is refused LAD_BASIS_MOVED.
- A second EOT raised before the first is issued: EOT_MOVED.

**Loss and expense** (`recordLossExpense`, `valueLossExpense`, `sendLossExpense`; family LOSS_EXPENSE; domain `loss_expense`):
- `lossValueFaults` and `lossSendFaults` apply, and `claimsCommitteeFaults` at send.
- An approved claim is picked from a dropdown on the 1.2 LOSS_AND_EXPENSE line of a sum adjustment
  (`SumAdjustmentLine.lossExpenseClaimId`), refused by `lossLineFaults` unless it is approved.

**LAD waiver** (`recordLadWaiver`, `sendLadWaiver`, `resendLadWaiver` in `damages-actions.ts`; family LAD_WAIVER; domain
`lad_waiver`, at the exact ratio):
- `waiverRecordFaults` applies. The LAD amount is frozen at send. Its application is the interim's, as built.

**Period extension** (`recordPeriodExtension`, `sendPeriodExtension`, `raisePeriodAgreement`; family PERIOD_EXTENSION; domain
`contract_period_extension`):
- Refusals: PRECONDITION_NOT_MET, PERIOD_NOT_OFFERED, NEW_EXPIRY_NOT_LATER.
- *Issue hook:* PERIOD_MOVED, then the PERIOD_EXTENSION version.

### 4.2 Practical completion and its defect list (stage B)

**Raise (`raisePracticalCompletion`, family COMPLETION; kind PRACTICAL_COMPLETION).**
- Inputs, all dates are pickers:
  - completion date;
  - possession taken on;
  - joint inspection day;
  - attendees (people from a multi-select, plus free names);
  - the reason the test is met (FR-CMP-004).
- `cpcRaiseFaults` refusals:

| Code | When |
|---|---|
| CPC_LIVE | A CPC that is not void already exists. |
| COMPLETION_IN_FUTURE | The completion date is after today. |
| BEFORE_POSSESSION | The completion date is before possession of site. |
| INSPECTION_IN_FUTURE | The inspection day is after today. |
| DLP_NOT_SET | The baseline's `dlp` is null. |
| SECTIONAL_NOT_BUILT | The baseline has sections (Q2). |
| IT_VARIANT_NOT_BUILT | The type's `completionVariant` is IT. |
| LAD_WINDOW_OPEN | A live LAD_APPLIES decision's window is still open. The officer closes it with the existing `closeLadWindow`, at the completion date, as that act stores it. |
| LAD_WINDOW_MISMATCH | The window closes on a different day from the completion date. |
| TEMPLATE_NOT_SET | No form is set for the kind. |

**Defect lines (`addCpcDefect`, `removeCpcDefect`).**
- Allowed only while the CPC is in DRAFT.
- Each has a description, an optional location and a due day (FR-CMP-007).
- The responsible party is always the contractor. That is said in the card's info popover.

**DAL:** `practical_completion` on the certificate route (`payment/route-open.ts`'s `submitForApproval`, as for interims). It
routes at **the contract sum**: `routeValueOf` (`payment/route-state.ts:47`) already falls back to it for every kind that is not
an interim, an advance or an adjustment. That is also the contract value the S.O. is resolved at, so the pack's `asSo` rows
match, and SO_ROUTE_MISMATCH cannot fire on a well-formed pack. No change to `routeValueOf` is needed.

**Issue (`KIND_ISSUE_HOOK.PRACTICAL_COMPLETION`):**
- *refusal:* LAD_WINDOW_OPEN again, on the locked rows.
- *after:* the CPC's lines are frozen into `PracticalCompletion.frozenLines`, then status PRACTICALLY_COMPLETE.
- Copies follow `FormDistribution` (the guarantor's is conditional, FR-CMP-009).

**Audit:** PracticalCompletion CREATE, DefectItem CREATE and DELETE (DELETE only in draft), the status UPDATE.

### 4.3 The DLP, defects during it, and the schedule (stage B)

**DLP.** The dates are on `PracticalCompletion` (CO-5). The notice:
- Event key `contract.dlp.ending` joins `NOTIFICATION_EVENTS`. Its rule's `reminderOffsetDays` and offices are the customer's
  (shipped none).
- It is raised on read by the case page and `/projects?view=dlp`, through `clockPlan` (`inbox/clock-plan.ts`, with a third
  `ClockKind`).
- It is written once per offset: StaffNotice kind `DLP_ENDING`, with `occurrence` = the offset.
- With no rule, the card says "No one is told: no notification rule" (the indent-expiry pattern).

**Defects reported during the DLP** (`reportDefect`, family DEFECTS): description, location, due day. The line has no
certificate.

**Contractor and staff on a line:**

| Act | Who | What it writes |
|---|---|---|
| `reportDefectRectified` | The contractor (§5), or an officer from paper | A note, and optionally evidence: one of the contract's project documents, picked from a dropdown. Event `REPORTED_RECTIFIED`. |
| `acceptDefect` | Organisation side | Event `MADE_GOOD`, with the day. |
| `returnDefect` | Organisation side | A required note. Event `RETURNED`, after which the line is open again. |
| `withdrawDefect` | Organisation side | A required reason. Event `WITHDRAWN`. |

Every act appends a `DefectEvent`. None updates the line.

**State (`defectState(events)`):** Open → Reported rectified → Made good. Returned reads as Open, with the return note shown.
Withdrawn ends the line. A line is overdue when its due day (or the latest issued schedule's "rectify by") is past and it is not
made good.

**Schedule of Defects (`raiseDefectSchedule`, family DEFECTS; kind SCHEDULE_OF_DEFECTS, BY_ROUTING_TYPE, no DAL row).**
- Input: rectify-by day.
- Refusals: DLP_NOT_APPLICABLE, DLP_NOT_ENDED, NO_OPEN_DEFECTS, SCHEDULE_LIVE, RECTIFY_BY_PAST_LIMIT (when the contract clock
  DEFECTS_RECTIFICATION is set: rectify-by after today plus the clock; FR-CMP-013's "not later than three months" is that
  clock), TEMPLATE_NOT_SET (the form is B6, RSAJ's).
- Warning: LIMIT_NOT_SET when the clock is unset ("the longest period is not checked").
- Its lines are every line still open at issue, frozen into `DefectSchedule.frozenLines`.

### 4.4 The certificate of making good defects (stage B)

**Raise (`raiseMakingGood`, family MAKING_GOOD; kind MAKING_GOOD_DEFECTS).**
- Inputs: the day the defects were made good, and the final inspection day (FR-CMP-018).
- Refusals: CPC_NOT_ISSUED, DLP_NOT_APPLICABLE, DLP_NOT_ENDED, DEFECTS_OPEN {n} (any line not made good or withdrawn),
  CMGD_LIVE, DAY_IN_FUTURE, TEMPLATE_NOT_SET.

**DAL:** `making_good`. At send, SO_ROUTE_MISMATCH and SO_UNRESOLVED apply to the approving step only (BD-613-78, ruled), by
`soRouteFaults` in `src/lib/closeout/so-route.ts`.

**Issue:** every line frozen with its end state into `MakingGood.frozenLines` (ruling 4), then status MAKING_GOOD_COMPLETE. The
copies carry the guarantor's notice (FR-CMP-016).

**Snapshot (ruling 6, FR-CMP-015).** The CMGD's computed snapshot carries the performance bond's value, the retention balance, and
the guarantee or official receipt numbers of the securities held.

### 4.5 Retention and securities (stage B)

**Retention balance** (the existing `releaseRetention`, family RETENTION_RELEASE). `releaseOf` takes
`balanceEvent: { state: "REACHED" } | { state: "NOT_REACHED"; event: ReleaseEvent } | { state: "NOT_SET" }` in place of
`makingGoodIssued`, computed by `balanceEventOf(policy, facts)`. New refusals:
- RELEASE_EVENT_NOT_SET, naming Settings › Post-award controls.
- MAKING_GOOD_NOT_ISSUED (kept).
- FINAL_INSPECTION_NOT_RECORDED.
- BALANCE_WITH_FINAL_PAYMENT, under FINAL_PAYMENT: the ledger row is written by Finance's payment of the FINAL (CO-6).

**No DAL route,** as for the first release today (Q3). After the write, `manualCloseout.retentionReleased`.

**Securities** (`returnSecurity`, family SECURITY_RELEASE).
- Input: returned on (day), and the official receipt reference (cash or banker's draft only).
- `securityReturnFaults`: EVENT_NOT_SET, EVENT_NOT_REACHED {event}, ADVANCE_NOT_RECOUPED, DGB_SURVIVES,
  OFFICIAL_RECEIPT_REQUIRED, ALREADY_RETURNED, NOT_HELD (REJECTED).
- **Audit:** SecurityRelease CREATE, with the instrument's reference.

### 4.6 The final account and the final payment certificate (stage C)

**Raise (`raiseFinalAccount`, family FINAL_ACCOUNT; kind FINAL).** `finalPreconditionFaults` refusals:

| Code | When |
|---|---|
| MAKING_GOOD_NOT_ISSUED | No CMGD, where a DLP applies. |
| CPC_NOT_ISSUED | No CPC. |
| CERTIFICATES_IN_PROGRESS | Any certificate of the contract is in DRAFT, IN_ROUTING or SIGNING. Names each. |
| VALUATION_OPEN | A valuation is open. |
| EOT_OPEN | A claim is not determined, or is approved but not certified. |
| LOSS_EXPENSE_NOT_VALUED | Any claim is unvalued or undecided (FR-FIN-001). |
| FINAL_BASIS_NOT_SET | `finalPreviousBasis` is unset. |
| WAIVER_SETTING_NOT_SET | An approved waiver is unapplied and `ladWaiverApplication` is unset. |
| FINAL_LIVE | A FINAL that is not void already exists. |
| TEMPLATE_NOT_SET | No form is set for the kind. |

**Figures (`finalAccountOf`, pure; the 6.13 plan B5 fixture, recommended 50,672.17):**
- **Final sum** = the original sum plus the net of the issued adjustments (FR-FIN-003). It is never keyed.
- **Less:** previous interim payments (by the switch), retention released (MAIN, NSC, NS), advance repaid.
- **Deduct:**
  - computed: LAD net of waivers and credits, with the waiver letter's reference;
  - keyed while DRAFT (`addFinalDeduction`, `removeFinalDeduction`, with the kind from a Select): PREMIUMS_PERKESO, WAGES,
    NON_COMPLIANCE, MAKING_GOOD_COST, DIMINUTION, OTHER (at most three), and LAD_ROUNDING (−1.00 < r < 1.00 through
    `lad/rounding.ts`).
- The split per party uses `payment/waterfall.ts` (FR-FIN-011).
- `judgedUnder` records every certificate, release, waiver and credit read.

**Before it is sent for approval (`finalRouteFaults`):**
- PACK_INCOMPLETE {items}: each `CloseoutDocumentRequirement` needs an entry.
- DECLARATION_NOT_TAKEN_UP: a STATUTORY_DECLARATION document of the contract marked TAKEN_UP, picked from a dropdown.
- FINANCE_NOT_CONFIRMED.
- FINANCE_TOTAL_DIFFERS {confirmed, computed}: Finance's confirmed total ≠ the sum of `FinancePayment` on the contract's interim
  and advance certificates.
- PERFORMANCE_NOT_FILED: the contractor performance report is not verified (ruling 17; FR-FIN-014). Not set is not met.

`confirmFinalPayments` (Finance) writes `financeConfirmedTotal`, the person and the time (FR-FIN-004).

**DAL:** `final_payment` (`KIND_ROUTE_DOMAIN.FINAL`), at the contract sum, by the same fallback in `routeValueOf` as the CPC
(§4.2): the DAL's item 17 and the pack's FINAL_T rows band on contract value. CMGD routes the same way. SO_ROUTE_MISMATCH and
SO_UNRESOLVED apply (§4.4).

**Sign:** Recommending, Contractor plus Witness, then S.O. (CO-9). Forwarding through C&P is the routing type's checks (FR-FIN-013),
which are configuration.

**Issue (`KIND_ISSUE_HOOK.FINAL`):**
- *refusal:* FINAL_BASIS_MOVED, when anything in `judgedUnder` has changed since raise.
- *after:* status FINAL_CERTIFICATE_ISSUED.

**Payment:** the existing `FinancePayment` act, with `PAID_FIGURE.FINAL = "recommended"`, added after Phase 1's `paidFigureOf`.
Sukuk's "certified" then counts the final payment, which is intended. When `retentionBalanceReleaseAt = FINAL_PAYMENT` and a
balance is held, the same transaction writes `RetentionRelease` BALANCE and calls `manualCloseout.retentionReleased`.

### 4.7 Close (stage C)

**`closeContract` (family CLOSE). `closureFaults` refusals:**

| Code | When |
|---|---|
| FINAL_NOT_PAID | The FINAL is not issued and paid. |
| SUPPLY_NOT_BUILT | The contract is paid on delivery order and invoice (ruling 19: supply contracts do not close in Phase 2). |
| CERTIFICATES_IN_PROGRESS | A certificate is still in progress. |
| MATTERS_OPEN | A route is pending. |
| DEFECTS_OPEN | A defect line is open. |
| RETENTION_HELD {amount} | Retention is still held. |
| SECURITY_NOT_RETURNED {list} | A security other than the design guarantee bond and the rejected ones is not returned. |
| PERFORMANCE_NOT_FILED | The performance report is not verified (stage D; Q4). Checked again here after `finalRouteFaults`; close refuses, it does not warn (ruling 17). |

The checklist also says "n withdrawn, not made good" from the CMGD's frozen lines (ruling 4). Close has no route (ruling 16).

**Writes:**
- `ContractClosure`: the closing day, the preconditions as checked, and what survives (the design guarantee bond with its
  release day where `designBondYears` is set, else "Not set").
- Status CLOSED.
- `manualCloseout.closeRequested`, with the line "Ask Finance to close commitment {number} and capitalise the asset" (INT-08).

**After the close:** the case page shows the existing CLOSED callout.

### 4.8 Contractor performance (stage D, minimum viable)

**Configuration** (Settings › Contract controls › Performance form; shipped empty):
- `PerformanceForm`: name, contract type (Select, required: each form belongs to exactly one type, ruling 10), the scale's top
  (Select 2–10, CHECK 2..10), and status Draft → Issued → Retired.
- `PerformanceCriterion`: label, guide, weight.
- `PerformanceGradeBand`: label and lower bound. Grading reuses `evaluation/bands.ts` (`placeInBands`, `bandSetFaults`), not a
  rule of its own.
- **Issue is refused** for WEIGHTS_NOT_ONE (the weights must total exactly 1.0000), NO_CRITERIA, and whatever `bandSetFaults`
  refuses.
- There is no general form and no fallback. Two issued forms for the same type are refused at issue.

**Report** (family PERFORMANCE_REPORT, new; allowed in MAKING_GOOD_COMPLETE, and in
PRACTICALLY_COMPLETE where the CPC is issued and there is no DLP, judged by the act; ruling 12):
- `openPerformanceReport` pins the form and its snapshot. It opens once the CMGD is issued, or once the CPC is issued where there
  is no DLP (ruling 17). It is refused for FORM_NOT_SET (by name: the contract type has no issued form), REPORT_LIVE, and
  NOT_YET_OPEN.
- `saveScores`: one Select per criterion (1 to the scale's top) and a note. It is allowed only before assessment.
- `assessReport` writes the total and grade (`performance/score.ts` and `grade.ts`, 4 places, half up, judged on the stored
  figure).
- `verifyReport` is refused for SAME_PERSON and NOT_ASSESSED. It files the report.

**Where it shows:**
- The Close tab's card.
- Supplier › Performance (new tab): filed reports, behind the supplier page's existing SULIT gate, as `cprPercent` is.
- The contractor never sees it (§9).

## 5. The contractor's side (portal, English only)

| Where | What the contractor sees | What the contractor does |
|---|---|---|
| Overview | "Completion date" (the current baseline, with EOTs), and "Defects liability ends {day}" once a CPC is issued. | — |
| Documents (existing) | — | Sends a delay notice, a defects-rectified document or a statutory declaration (existing kinds). An officer takes each up. |
| Defects (new tab, shown once a CPC is issued) | Every line not withdrawn: description, location, due, state, the officer's return note. | **Mark rectified** (row action; drawer with a note and an optional evidence Select of the contractor's own uploaded documents), giving `reportDefectRectified`. It writes StaffNotice `DEFECT_RECTIFIED` to the S.O. office's holders (the `PROJECT_DOCUMENT_FROM_CONTRACTOR` recipients rule). |
| Certificates (existing) | EOT, CPC, Schedule of Defects, CMGD and FINAL once issued. | Signs the FINAL's CONTRACTOR block, which is the acceptance of the final account, where `contractorPortalSigning` is true. |

`reportDefectRectified` runs with the supplier actor (`supplierHoldsContract`, ADR 0034 D11). It locks the contract and then the
line, asks DEFECTS, and is refused NOT_OPEN when the line is already reported or made good. It is audited with the supplier
account.

## 6. Contracts (written in step 1 of each stage, before any act or screen)

### 6.1 Types: `src/lib/closeout/types.ts`

```ts
export type DefectSource = "PRACTICAL_COMPLETION" | "LIABILITY_PERIOD";
export type DefectEventKind = "REPORTED_RECTIFIED" | "MADE_GOOD" | "RETURNED" | "WITHDRAWN";
export type DefectState = "OPEN" | "REPORTED_RECTIFIED" | "MADE_GOOD" | "WITHDRAWN";
export interface DefectEventFact { kind: DefectEventKind; on: Day; note: string; at: string }
export interface DefectFact { id: string; source: DefectSource; dueOn: Day; scheduleRectifyBy: Day | null; events: readonly DefectEventFact[] }

export type Dlp = { applies: false } | { applies: true; start: Day; endExclusive: Day } | { applies: null };
export type BalanceEvent = { state: "REACHED" } | { state: "NOT_REACHED"; event: "MAKING_GOOD" | "FINAL_PAYMENT" } | { state: "NOT_SET" };

export interface CloseoutFacts {
  status: ContractStatus;
  supply: boolean;                       // ContractType.paymentRoute === "DELIVERY_ORDER_INVOICE"
  cpc: { status: CertificateStatus; dlp: Dlp } | null;
  schedule: { status: CertificateStatus; rectifyBy: Day } | null;
  cmgd: { status: CertificateStatus; finalInspectionOn: Day | null } | null;
  final: { status: CertificateStatus; paid: boolean; firstMissing: string | null } | null;
  defects: { open: number; overdue: number };
  retention: { held: Sen; balanceReleased: boolean; event: BalanceEvent };
  securitiesToReturn: readonly { id: string; label: string; returnable: boolean }[];
  performance: "NONE" | "OPEN" | "ASSESSED" | "VERIFIED";
  closed: { on: Day } | null;
  today: Day;
}
export type CloseoutAction = "RAISE_CPC" | "OPEN_CERTIFICATE" | "ADD_DEFECT" | "RAISE_SCHEDULE" | "RAISE_CMGD"
  | "RELEASE_RETENTION" | "RETURN_SECURITY" | "RAISE_FINAL_ACCOUNT" | "OPEN_FINAL_ACCOUNT" | "RECORD_FINAL_PAYMENT"
  | "SCORE_PERFORMANCE" | "CLOSE_CONTRACT";
export interface CloseoutNext { state: "waiting" | "in-progress" | "done"; next: string; action: CloseoutAction | null }
```

`CaseAction` (`case-steps.ts`) is widened by `CloseoutAction`. `CASE_ACTION_NEXT` and the page's `CASE_ACTION_AT` gain their
entries.

### 6.2 Schema (additive; `organisationId` on every model; Decimal(18,2) money, Decimal(9,4) ratios; DATE-only days, ends exclusive; FKs Restrict; CHECKs by hand)

**Migration names:** each is named after the latest folder **at build time**. Sukuk's and the 0.1 builder's folders come first.
No timestamps are named here.

**Stage A: `loss_expense_line`.**
- `SumAdjustmentLine.lossExpenseClaimId String?` (FK LossExpenseClaim, Restrict).
- CHECK `lossExpenseClaimId IS NULL OR trigger = 'LOSS_AND_EXPENSE'`.
- **Pre-check** (the SELECT CAST pattern): none needed. The column is new, and existing LOSS_AND_EXPENSE lines stay unlinked and
  are read "Entered before claims were linked".

**Stage B, enum and CHECK migrations (one each, per X-6):**
- `contract_clock_defects_rectification` (`ContractClock` + DEFECTS_RECTIFICATION).
- `staff_notice_closeout_kinds` (the StaffNotice kind CHECK rebuilt from the full list plus `DLP_ENDING`, `DEFECT_RECTIFIED`; its
  source test with `STAFF_NOTICE_KINDS`).

**Stage B main: `closeout_completion`.**

| Model | Fields |
|---|---|
| `PracticalCompletion` | `certificateId @unique`, `contractId`, `completionDate`, `possessionTakenOn`, `inspectedOn`, `attendees String[]`, `testReasons`, `dlpMonths Int?`, `dlpStart?`, `dlpEnd?` (CHECK: both or neither; end > start), `frozenLines Json?`, `personId`, `recordedAt` |
| `DefectItem` | `contractId`, `source DefectSource`, `practicalCompletionId?` (CHECK: PRACTICAL_COMPLETION ⇔ set), `description`, `location @default("")`, `dueOn`, `reportedByPersonId`, `recordedAt`. A PRACTICAL_COMPLETION line is inserted or deleted only while its CPC is DRAFT; a LIABILITY_PERIOD line is insert-only (trigger). |
| `DefectEvent` | `defectId`, `kind DefectEventKind`, `on`, `note @default("")`, `evidenceDocumentId?` (FK ProjectDocument), `personId?`, `supplierAccountId?` (CHECK: exactly one actor), `recordedAt`. Append-only (trigger, like `ProjectDocumentDecision`). CHECK: RETURNED and WITHDRAWN have a note. |
| `DefectSchedule` | `certificateId @unique`, `contractId`, `rectifyBy`, `frozenLines Json?`, `personId`, `recordedAt` |
| `MakingGood` | `certificateId @unique`, `contractId`, `madeGoodOn`, `finalInspectionOn`, `frozenLines Json?` (every line with its end state; withdrawn keep their reason), `snapshot Json?` (FR-CMP-015: performance bond value, retention balance, guarantee or receipt numbers), `personId`, `recordedAt` |
| `SecurityRelease` | `securityId @unique`, `contractId`, `trigger SecurityReleaseTrigger` (MAKING_GOOD, FINAL_PAYMENT, ADVANCE_RECOUPED), `certificateId?`, `returnedOn`, `officialReceiptRef @default("")`, `personId`, `note`, `recordedAt` |

**Stage C: `closeout_final`.**

| Model | Fields |
|---|---|
| `FinalAccount` | `certificateId @unique`, `contractId`, `finalSum`, `recommended`, `previousBasis FinalPreviousBasis` (frozen), `judgedUnder Json`, `declarationDocumentId?` (FK ProjectDocument), `financeConfirmedTotal?`, `financeConfirmedByPersonId?`, `financeConfirmedAt?` (CHECK: all three or none), `personId`, `recordedAt` |
| `FinalAccountLine` | `finalAccountId` (Cascade), `block FinalBlock` (LESS, DEDUCT), `kind FinalLineKind` (PREVIOUS_INTERIM, RETENTION_RELEASED_MAIN/NSC/NS, ADVANCE_REPAID_MAIN/NSC, LAD, LAD_WAIVED, LAD_CREDIT, LAD_ROUNDING, PREMIUMS_PERKESO, WAGES, NON_COMPLIANCE, MAKING_GOOD_COST, DIMINUTION, OTHER), `amount`, `label`, `sourceIds Json`, `keyed Boolean`. CHECK: keyed ⇔ kind in the keyed set; LAD_ROUNDING in (−1, 1). |
| `CloseoutDocumentRequirement` | `labelEn`, `sortOrder`, `provenance`, `source @default("")`, `retiredOn?` (configuration; on `history.ts`'s allow-list; the RSAJ pack seeds three STATED rows, ruling 8) |
| `FinalPackEntry` | `finalAccountId`, `requirementId`, `projectDocumentId?`, `notApplicableReason @default("")` (CHECK: exactly one), `personId`, `recordedAt`; `@@unique([finalAccountId, requirementId])` |
| `ContractClosure` | `contractId @unique`, `closedOn`, `preconditions Json`, `surviving Json`, `personId`, `recordedAt` |

**Stage D: `performance`.**

| Model | Fields |
|---|---|
| `PerformanceForm` | `nameEn`, `contractTypeCode` (required; no general form, ruling 20), `scaleMax Int` (CHECK 2..10), `status PerformanceFormStatus`, `version`, `issuedAt?`, `provenance`, `source`, `retiredOn?` |
| `PerformanceCriterion` | `formId` (Cascade), `sortOrder`, `labelEn`, `guideEn @default("")`, `weight Decimal(9,4)` (CHECK > 0) |
| `PerformanceGradeBand` | `formId` (Cascade), `label`, `lowerPct Decimal(9,4)`, `sortOrder` |
| `PerformanceReport` | `contractId @unique`, `supplierId?`, `formId`, `formSnapshot Json`, `scoreTotal Decimal(9,4)?`, `gradeLabel?`, `assessedByPersonId?`, `assessedAt?`, `verifiedByPersonId?`, `verifiedAt?` (CHECK verifier ≠ assessor; verified ⇒ assessed), `personId`, `recordedAt` |
| `PerformanceScore` | `reportId` (Cascade), `criterionOrder`, `score Int`, `note`; `@@unique([reportId, criterionOrder])` |

`scoreTotal` and `gradeLabel` are registered in SULIT_FIELDS (supplier scope).

**Single-writer scans** (extend `run1b-writers.test.ts`, or add `closeout-writers.test.ts`):
- Each new table has one named writer file.
- `RetentionRelease` BALANCE gains its second writer: the FINAL payment hook.
- `ContractStatus` PC, MGC, FCI and CLOSED have their hooks or act, as `STATUS_WRITTEN_BY` names them.

### 6.3 Pure rules (tests beside each; spec figures in fixtures only; money in sen)

| File | Functions | Key tests |
|---|---|---|
| `src/lib/time/claim-state.ts` | `eotClaimState`, `eotNext` | Every state gives its one action; NOT_ENTITLED gives none, and the damages offer. |
| `src/lib/time/at-issue.ts` | `eotIssueRefusal`, `afterEotIssue` (server) | EOT_MOVED; the version is written once; only live decisions on the scope are superseded. |
| `src/lib/certificate/issue-hooks.ts` | `KIND_ISSUE_HOOK`, `strandedFaults` | Exactly the six kinds; a kind with a status in `KIND_ISSUE_WRITES` has a hook (source test). `strandedFaults`: an EOT route pending refuses the CMGD's issue, and so does an undetermined claim; a period-extension matter pending refuses the CPC's issue; nothing open passes; the families are read from `ACT_STATUS` (a test that changing a row changes the answer). |
| `src/lib/closeout/completion.ts` | `cpcRaiseFaults`, `dlpOf` | Every code in §4.2. **Completion 2026-09-25 with 12 months (fixture) ends exclusive 2026-09-25 + 12 months.** `dlp.applies` false gives no dates; null refuses. |
| `src/lib/closeout/defects.ts` | `defectState`, `overdue`, `defectActFaults` | Reported then returned reads OPEN with the note; made good is final; withdrawn ends it; NOT_OPEN; overdue uses the schedule's day when one is issued. |
| `src/lib/closeout/schedule.ts` | `scheduleRaiseFaults` | DLP_NOT_ENDED on the last day, allowed on the end day; RECTIFY_BY_PAST_LIMIT with the clock at 3 months (fixture); a warning when unset. |
| `src/lib/closeout/making-good.ts` | `cmgdRaiseFaults` | DEFECTS_OPEN counts reported-but-not-accepted lines; withdrawn ones do not count. |
| `src/lib/closeout/release.ts` | `balanceEventOf`, `securityReturnFaults` | Both switches × both events; no DLP reads as FINAL_PAYMENT; cash without a receipt is refused; the design guarantee bond survives; returning twice is refused. |
| `src/lib/payment/retention.ts` | `releaseOf` (signature changed, flagged) | Existing tests are rewritten from `makingGoodIssued` to `balanceEvent`, each assertion kept (faithful); new: NOT_SET, FINAL_INSPECTION_NOT_RECORDED, BALANCE_WITH_FINAL_PAYMENT. |
| `src/lib/closeout/so-route.ts` | `soRouteFaults` | Only the approving step is compared; unresolved refuses; another domain is not checked (BD-613-78). |
| `src/lib/closeout/final-account.ts` | `finalPreconditionFaults`, `finalAccountOf`, `finalRouteFaults` | **The 6.13 B5 fixture: final sum 1,115,308.60; less 1,053,875.43; deduct 10,761.00; recommended 50,672.17.** Both `finalPreviousBasis` readings give the same recommended (a property test over 200 seeded histories). At most three OTHER lines. Rounding ±0.99 accepted, ±1.00 refused. FINANCE_TOTAL_DIFFERS. |
| `src/lib/closeout/closure.ts` | `closureFaults` | Each code alone; the design guarantee bond never blocks; a supply contract is refused SUPPLY_NOT_BUILT. |
| `src/lib/closeout/next.ts` | `closeoutNext` | One row per line of the table in §3.2 (table-driven). |
| `src/lib/performance/{form,score}.ts` | `formIssueFaults`, `reportTotal`; grading through `evaluation/bands.ts` | Weights 0.30/0.25/0.20/0.15/0.10 issue clean, and 0.11 refuses. With scale 5, scores 4,3,5,3,3 give **74.0000** (fixture; 4,3,5,4,3 give 77.0000, corrected at the stage D review). Grade 39.995 gives E, 40.0000 gives D, 80 gives A (fixture bands, through `placeInBands`). |

## 7. Where Phase 2 meets Phase 3 (the work-item engine)

Phase 3 brings items typed RFI, site instruction, inspection/NCR, safety incident, action item, defect and task, with a board, a
list, "My work", and contractor access to shared items. Phase 2 builds none of that. The seam is:

1. **`DefectItem` is the legal line, and the work item is its collaboration shell.** Phase 3's DEFECT work item carries
   `defectItemId String? @unique` (FK DefectItem, Restrict), in Phase 3's migration. One line has at most one item. The item adds
   assignees, comments, photos, a timeline and board placement.
2. **State moves only through the defect acts.** Dragging a Defect card to "Done" calls `acceptDefect`, and to "Returned" calls
   `returnDefect`. The board's column is read from `defectState(events)`; it is never stored twice. `DefectEvent` is the item's
   timeline for these events.
3. **A defect found on site during the DLP** can start as a Phase 3 item. "List as a defect" calls `reportDefect`, which creates
   the line and links the item. Before practical completion, a Defect item is a snag with no line. At CPC raise, the officer can
   pick open Defect items from a multi-select, and `addCpcDefect` creates their lines and links them.
4. **Issued certificates are never affected.** `frozenLines` on `PracticalCompletion` and `DefectSchedule` keep what was certified,
   whatever later happens to the item.
5. **Failed joint inspections** (the FR-CMP-005 loop) become Phase 3 INSPECTION items. Phase 2 records only the passing inspection
   on the CPC.

Phase 2 must not build a board, assignees, comments or a priority field on `DefectItem`. Each is Phase 3's, and adding one here
would give the two phases two homes for the same fact.

## 8. Build steps (one heavy builder; stages A → B → D → C, each shippable; ruling 21)

Stage D comes before stage C because close refuses PERFORMANCE_NOT_FILED and the report opens at the CMGD (ruling 17). Stage B
ships as one unit; check `git status` before each schema step.

**Rules for every step:**
- The builder reads `node_modules/next/dist/docs/` for any Next API it touches.
- Every step ends with `npm run typecheck`, `npm run lint` and its own tests. The full `npm test` runs with the dev server off at
  the last step of each stage.
- A changed existing test is listed in its commit, each one flagged as stricter or faithful, and none is weakened.
- **Pack data waits.** Pack rows (RSAJ templates' signature blocks, release switches, the clock, notification rules) wait until
  the Phase 0.1 builder has committed `prisma/rsaj/starter-pack/*`. This plan's steps never edit those files while they are
  uncommitted.
- **The schema waits too.** `prisma/schema.prisma` is the Phase 0.1 builder's uncommitted file at the time of writing. A step that
  owns `schema.prisma` or a migration (A2, B1, C1, C5, D1) starts only once `git status` shows those paths clean, and its
  migration sorts after the latest folder then (Sukuk amendment 20's rule).

### Stage A — Time (EOT screens and wiring)

**A1. Signing and issue hooks, and the EOT certificate.**
- **Owns:**
  - `src/lib/certificate/{kinds.ts,write.ts}` (CO-3; the hook calls, CO-2);
  - `src/lib/certificate/issue-hooks.ts` (new);
  - `src/lib/time/{at-issue.ts,certificate.ts,claim-state.ts}` (new);
  - `src/app/projects/[id]/time-actions.ts` (+`raiseEotCertificate`).
- **Done when:** an approved claim raises, signs and issues an EOT certificate. The issue writes the EXTENSION_OF_TIME version and
  the supersession. A matter not yet approved cannot sign. The demo template's SO block resolves to the contract's S.O.
  (ruling 23).
- **Tests:**
  - `issue-hooks.test.ts`;
  - `at-issue.test.ts` (EOT_MOVED, written once, supersession by scope);
  - `claim-state.test.ts`;
  - `kinds.test.ts` (matter signing replaces fail-closed: flagged stricter in the approved direction);
  - `both-orders.test.ts`, extended;
  - `run1b-writers.test.ts`, with `ExtensionOfTime` and the version writer registered.

**A2. Loss and expense, and LAD waivers.**
- **Owns:**
  - `time-actions.ts` (+3 loss-and-expense acts);
  - `src/app/projects/[id]/damages-actions.ts` (new: the 3 waiver acts);
  - migration `loss_expense_line`;
  - `variation-actions.ts`'s adjustment-line act (the link, flagged against Part A).
- **Done when:** a claim is valued, sent, approved and linked on a 1.2 line. A waiver is sent at its ratio and applied by the next
  interim (as built).
- **Tests:** the acts call `lossValueFaults`, `lossSendFaults`, `claimsCommitteeFaults` and `waiverRecordFaults` (a source test,
  as in `lad/wiring.test.ts`); a db test for the CHECK.

**A3. Period extension.**
- **Owns:** `time-actions.ts` (+3 acts); `issue-hooks.ts` (CONTRACT_PERIOD_AGREEMENT).
- **Done when:** a term contract's extension goes through its route, and its agreement writes PERIOD_EXTENSION.
- **Tests:** `period.test.ts` is unchanged; a new hook test for PERIOD_MOVED.

**A4. Screens.**
- **Owns:**
  - `src/lib/contract/case-tabs.ts` (+`time`);
  - `src/app/projects/[id]/time-panels.tsx`, `time-editors.tsx` (new);
  - `src/app/projects/[id]/eot/[claimId]/page.tsx` (new);
  - `payment-panels.tsx` (the Waivers list, the accrual meter);
  - Settings › Post-award controls editors for `ladWaiverApplication`, `ladAntiOppressionDays` and `weatherGuidance`
    (BD-613-116);
  - `src/app/configuration/history.ts` allow-list.
- **Done when:** the founder's flow works by clicking: delay notice → claim → reasons → determine → send → approve (Approvals) →
  raise → sign → issue. The Time tab shows the new date.
- **Tests:** `case-tabs.test.ts` (+time, flagged); a screen test that the claim page has one primary action per state; the
  `act-status-screens` scan covers the new pages; `scripts/check-ui.mjs`.
- **Siblings:** the variation page and Payments. Run `scripts/text-snapshot.mjs` before and after.

**A5. Demo and gates.**
- **Owns:** `prisma/demo-*.ts` (one contract through the acts: notice, claim with two reasons, approved, certificate issued, the
  next interim showing the credit; settings ASSUMED). Claim free `demo_` prefixes by grep first.
- **Done when:** the demo is wiped and reloaded, and the full suite is green.

### Stage B — Completion, defects, DLP, CMGD, retention and securities

**B1. Schema and types.**
- **Owns:**
  - `prisma/schema.prisma`;
  - the three stage B migrations (§6.2), with CHECKs and triggers by hand;
  - `src/lib/closeout/types.ts`;
  - `src/lib/inbox/kinds.ts` (+2 kinds);
  - `src/lib/notifications/events.ts` (+`contract.dlp.ending`).
- **Done when:** the migrations apply and `migrate diff` is empty.
- **Tests:** a db test for each CHECK and the `DefectEvent` append-only trigger; `owner-check` is unchanged (no new attachment
  owner); the StaffNotice kinds source test.

**B2. Pure rules.**
- **Owns:** `src/lib/closeout/{completion,defects,schedule,making-good,release,so-route,next}.ts` and their tests; `releaseOf`
  (flagged).
- **Done when:** every row of §6.3 for stage B has its test.

**B3. Acts.**
- **Owns:**
  - `src/app/projects/[id]/closeout-actions.ts` (new: CPC raise, lines, defects, schedule, CMGD, `returnSecurity`);
  - `issue-hooks.ts` (+PC, +SCHEDULE_OF_DEFECTS, +MGD);
  - `payment-actions.ts` `releaseRetention` (the gate, flagged);
  - `src/lib/integration/closeout.ts` (new).
- **Done when:** CPC → DLP → schedule → CMGD → balance → bond return works on a test database through the acts.
- **Tests:**
  - lock order (`lock-order.test.ts` extended);
  - `act-status-scan` (each act asks its family);
  - the single-writer scans;
  - **both orders:** CPC issue against an interim in progress (LAD_BASIS_MOVED, existing); CMGD against a balance release
    (refused before, allowed after); an EOT route left pending, then the CMGD's issue (refused WORK_WOULD_BE_STRANDED, naming
    the claim); the claim decided, then the CMGD issues.

**B4. The contractor's side.**
- **Owns:** `src/app/supplier/projects/[id]/{page.tsx,panels.tsx,controls.tsx}` (the Defects tab, the Overview lines); the
  supplier action file that holds the contract's portal acts (+`reportDefectRectified`).
- **Done when:** the contractor marks a line rectified, the S.O.'s holders get the notice, and an officer accepts or returns it.
- **Tests:** a reach test (`supplier-reach.test.ts` pattern: another contractor's line answers 404); NOT_OPEN; the actor is the
  supplier account in the audit.

**B5. Screens and settings.**
- **Owns:**
  - `src/lib/contract/{case-steps,case-tabs,case-page-words}.ts` (unparked; flagged tests, §3.2);
  - `src/app/projects/[id]/page.tsx` (close-out tabs, `CASE_ACTION_AT`);
  - `src/app/projects/[id]/closeout-panels.tsx`, `closeout-editors.tsx` (new);
  - the DLP notice loader beside `award-view.tsx`'s clock notices;
  - `case-work-views.ts` (`dlp`);
  - Settings › Post-award controls (the two release switches, the DEFECTS_RECTIFICATION clock row).
- **Done when:** the close-out stage shows the Completion and Defects tabs with the right next line and main button at each state
  in §3.2's first eight rows.
- **Tests:** `next.test.ts`, run through `case-steps`; screen scans; `check-ui`.
- **Siblings:** Payments, Variations, the certificate page. Text-snapshot diff.

**B6. Demo and gates.**
- One contract taken to MGC: CPC with two lines, one rectified by the contractor and accepted, and one returned and then made
  good; the DLP shortened in the demo (ASSUMED); the schedule refused TEMPLATE_NOT_SET unless the demo template is set; the
  balance released; the bond returned.
- Run the full suite.

### Stage C — Final account and close

> Stage C demo note (stage D review, S1): seed the verified performance report on the demo's closed contract here, through the acts, once a contract can close.

**C1. Schema.** Owns the `closeout_final` migration and the `types.ts` additions. Done when it applies. Tests: CHECK db tests.

**C2. Pure rules.**
- Owns `src/lib/closeout/{final-account,closure}.ts` and their tests.
- Owns `PAID_FIGURE.FINAL` in `payment/finance.ts`, after Phase 1's `paidFigureOf`. The Sukuk certified test is extended (flagged
  stricter: the final payment now counts).

**C3. Acts.**
- **Owns:**
  - `src/app/projects/[id]/final-actions.ts` (new: raise, keyed lines, pack entries, `confirmFinalPayments`, declaration link,
    send, close);
  - `issue-hooks.ts` (+FINAL);
  - the FinancePayment act (the BALANCE write under FINAL_PAYMENT, flagged).
- **Done when:** the fixture contract's final account raises, routes on `final_payment`, is accepted by the contractor in the
  portal, issues, is paid, and closes.
- **Tests:** both orders (final in draft against a new interim gives CERTIFICATES_IN_PROGRESS / FINAL_BASIS_MOVED; close against a
  pending route gives MATTERS_OPEN); lock order; writers.

**C4. Screens and settings.**
- **Owns:**
  - the Final account and Close tabs (`closeout-panels.tsx`);
  - Settings › Post-award controls (`finalPreviousBasis`);
  - Settings › Contract controls › Close-out documents (`CloseoutDocumentRequirement` list, through `stageEdit` as other lists);
  - the RSAJ pack's three STATED close-out documents (ruling 8).
- **Done when:** §3.2's rows from "Ready for the final account" to CLOSED render. A supply contract's Close tab says closing is
  not built for supply contracts.

**C5. Removed** (ruling 19: supply contracts do not close in Phase 2; backlog row).

**C6. Demo and gates.** The stage B demo contract is taken to CLOSED.

### Stage D — Contractor performance (minimum viable)

**D1. Schema and configuration.**
- **Owns:**
  - the `performance` migration;
  - `src/app/configuration/performance/{page.tsx,actions.ts,editors.tsx}`;
  - `history.ts` allow-list.
- **Done when:** a form is drafted, refused at issue with weights of 0.95, and issued at 1.00.

**D2. Rules and acts.**
- **Owns:**
  - `src/lib/performance/{form,score}.ts` (reusing `evaluation/fixed.ts`'s 4-place arithmetic and `evaluation/bands.ts`'s
    grading, not copies);
  - `src/app/projects/[id]/performance-actions.ts`;
  - `act-status.ts` (+PERFORMANCE_REPORT in MAKING_GOOD_COMPLETE, and in PRACTICALLY_COMPLETE where the CPC is issued with no DLP, flagged).
  - PERFORMANCE_NOT_FILED lands in stage C's `finalRouteFaults` and `closureFaults`.
- **Done when:** a report is scored, assessed, and verified by a second person; the same person is refused.

**D3. Screens.**
- Owns the Close tab's performance card and the Supplier › Performance tab (`src/app/suppliers/[id]/page.tsx`, a new panel file).
- Done when the filed report shows on both, behind SULIT on the supplier.

**D4. Demo, the walk, and handover.**
- The demo's closed contract carries a verified report. **Moved to stage C's demo** (stage D review, S1): no contract can close before stage C, so stage D does not seed it.
- Walk every close-out screen at 1280 and 1440.
- Run the full suite and the text-snapshot diff.
- Remove the backlog row "Built and tested, not wired" for each rule now called (all except `prelims.ts`). This is a backlog
  edit, not a decisions-log edit.

## 9. Deliberately not done

- **Termination, nominated parties, partial occupation:** Part B runs 3 and 4. They are not in Phase 2. Termination is wholly out
  (ruling 24). Binding on its later run: both notices sign only after the termination matter's DAL approval (SK008 §7.5.1,
  §7.6.2), and TERMINATION_INTENT moves to MATTER_APPROVED.
- **Closing a supply contract** (ruling 19). Backlog row.
- **Contracts completed on paper before the system** (Q5): in the go-live data migration, such a contract must not get a second
  CPC. Backlog row.
- **RSAJ's post-award certificate templates** (ruling 23). Backlog row.
- **Sectional completion (FR-CMP-002) and the IT CPC variant:** each is refused by name (Q2).
- **Joint-inspection iterations, the expedited class, assignees and comments on defects:** Phase 3 (§7).
- **Third-party rectification, bond claims, debt claims and legal referral (FR-CMP-014):** with them, a contractor who never
  rectifies would block the CMGD. Until then, an officer withdraws the line with a reason, and that reason is audited.
- **The design guarantee bond's release act and its alert after close:** the bond is listed as surviving.
- **`CompletionOpening`** (contracts completed or released before the system): Q5.
- **The final claim window (FR-FIN-002, S).** The declaration's fields as data. The pack's eleven items fixed in code.
- **D365 INT-07 and INT-08 adapters:** manual only, while D365 is on hold.
- **6.16's other stages, share groups, the LAD block, the evaluation link, language variants and the verifier office rule.** The
  contractor sees no performance score.
- **Sending anything:** guarantor and contractor notices are recorded copies only (INT-09).
- **SUSPENDED:** as ADR 0031.
- **`payment/prelims.ts`:** stays on the backlog.

## 10. Open questions for the product owner (answered 2026-10-27; the answers are in §11)

| # | Question | Default |
|---|---|---|
| Q1 | When are the retention balance and the performance bond released for RSAJ? The product's switches stay unset. | The RSAJ pack sets both to MAKING_GOOD, STATED from SK009 §7.7.4 (also CC-03's example). The first release stays at the as-built handover (FR-PAY-021), not at the CPC. |
| Q2 | Sectional completion and the IT certificate variant. | Not built. The CPC is refused by name for a contract with sections or an IT type, so no wrong certificate is issued. Built when the first such contract appears. |
| Q3 | Do the close and the retention release need a DAL route? (RSAJ's line "route every approval … retention release, close-out"; the DAL has no tender row for either.) | No. Both are audited acts that rest on the routed certificates (CMGD, FINAL). A route can be added later as a domain without moving data. |
| Q4 | Must a verified performance report exist before close (FR-FIN-014), given that the product ships no form? | Yes. Close is refused PERFORMANCE_NOT_FILED, and the report is refused FORM_NOT_SET until a form is set. RSAJ's seven forms are needed before go-live. |
| Q5 | Contracts already practically complete, or with a release made, before the system. | Not in Phase 2 (no `CompletionOpening`). Such contracts stay at their status. Backlog row. |
| Q6 | Supply contracts (paid on delivery order and invoice) close from Active, once every claim is paid and the securities are returned. | Yes (step C5; ADR 0047 D4). |

## 11. The product owner's rulings (2026-10-27) and where each lands

| # | Ruling | Where |
|---|---|---|
| 1–3 | CO-1, CO-2 (one `KIND_ISSUE_HOOK`; `strandedFaults` reads ACT_STATUS), CO-3 (matter signing; TERMINATION stays refused) approved. | §2 as written. |
| 4 | `MakingGood.frozenLines`: every line with its end state; withdrawn keep their reasons; "n withdrawn, not made good". | CO-4, §4.4, §4.7, §6.2; ADR D1. |
| 5 | CO-5 approved: DLP frozen on the CPC; null refuses DLP_NOT_SET; `applies` false goes to the final account. | CO-5. |
| 6 | The CMGD snapshot carries FR-CMP-015's fields: bond value, retention balance, guarantee or receipt numbers. | §4.4, §6.2. |
| 7 | CO-7 approved: one return per security (`securityId @unique`); the design guarantee bond survives; cash needs its receipt. | CO-7. |
| 8 | The RSAJ pack seeds three STATED close-out documents (CPD/INT-SFA-INDEN). | §1, §6.2, C4. |
| 9 | CO-9, CO-10, CO-11 approved. | §2. |
| 10 | One form per contract type, no fallback, FORM_NOT_SET by name; grading by `evaluation/bands.ts`; scale 2–10. | §4.8, §6.2, §6.3; ADR D6. |
| 11 | D3 approved: the final inspection is a day on `MakingGood`; under FINAL_PAYMENT the balance is written with Finance's payment; no DLP reads as FINAL_PAYMENT; `CompletionOpening` and the DGB release deferred. | ADR D3, CO-6. |
| 12 | No supply ACTIVE → CLOSED edge; PERFORMANCE_REPORT allowed in MGC, and in PC where the CPC is issued with no DLP. | §4.8, D2; ADR D4. |
| 13 | D5 approved. | ADR D5. |
| 14 | Q1: the RSAJ pack sets `retentionBalanceReleaseAt` (FR-PAY-021, OM/P/007 §8.26, SK009 §7.7.4) and `performanceBondReleaseAt` (SK009 §7.7.3–7.7.4, FR-CMP-016) to MAKING_GOOD, STATED, each note naming FR-FIN-012's final-payment reading. The first release stays at the as-built handover. | Stage B pack data. |
| 15 | Q2: sectional and IT contracts refused at the CPC by name. | §4.2. |
| 16 | Q3: releases have no route of their own; the CMGD or FINAL is the approval of record, named on the Retention and Securities cards. Close needs no route. | §4.5, §4.7. |
| 17 | Q4: the report opens at the CMGD (or CPC with no DLP); PERFORMANCE_NOT_FILED refuses sending the FINAL and is checked again at close; FORM_NOT_SET by name; order A → B → D → C. New RSAJ question: confirm FR-FIN-014 and supply the seven CPD/SA-F0n workbooks. Supersedes OD-B18. | §4.6, §4.7, §4.8, §8. |
| 18 | Q5: contracts completed before the system stay at their status; backlog row (no second CPC in the go-live migration). | §9. |
| 19 | Q6 cut: supply contracts do not close in Phase 2; the Close tab says so; backlog row. | §1, §4.7, C5 removed; ADR D4. |
| 20 | No `scope` / `sectionRef` on `PracticalCompletion` or `MakingGood`; no general performance form. | §6.2. |
| 21 | One heavy builder, A → B → D → C, C5 removed; stage B ships as one unit. | §8. |
| 22 | Musts unmet at go-live (deferred): FR-TRM-001..017; FR-NSC-001..017 bar the splits built; FR-CMP-002, 003, 005's failure loop, 006's IT variant, 014, 017's alert after close; FR-LAD-010, 011, 013's escalation; FR-FIN-007, FR-CMP-013 and FR-CMP-018 in part; FR-CPR-001, 004, 005 (three of four stages), 006, 007, 008. | §1, §9. |
| 23 | The demo EOT template uses an SO authorising block; A1 tests signing after matter approval and the SO block resolving to the contract's S.O. Backlog row: RSAJ templates for every post-award kind. | §4.1, A1. |
| 24 | Termination wholly out; its later run signs both notices only after the DAL approval, and TERMINATION_INTENT moves to MATTER_APPROVED. | §9. |
