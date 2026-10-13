# 0003 — Sourcing Requirements v2 (SR-01..SR-15) mapped against the code

Status: a read-only map, written 2026-10-09 for planning. No decision is taken here: the gaps in
section 4 are open for the product owner. Nothing in this note is built.

Source (binding): `docs/requirements/Sourcing_Requirements_v2.docx`, "Sourcing Requirements:
Prototype Review Changes, Round 1". Its text is in `docs/requirements/sourcing-v2-media/Sourcing_Requirements_v2.txt`
and its figures are `image1.png`..`image14.png` in that folder. In this note "the document" means that file.
It supersedes, for Sourcing, the founder's 2026-10-08 review proposals
(`docs/notes/drafts/module-review-2026-10-08.md`, ON HOLD). Where the document conflicts with an earlier founder
ruling in `docs/notes/decisions-log.md`, the document wins.

## 0. The answers in section 5, and who gave each

All seven are treated as confirmed, because the founder said "change it". Log them as such.

| # | Answer | Given by |
| --- | --- | --- |
| 1 | Two tabs: Scope and estimate (form fields), then Tender documents (files and approval). | Analyst's suggestion, confirmed |
| 2 | The Company estimate stays as its own section under Scope and estimate. | **Founder** |
| 3 | Remove the physical sale fields completely, because the move is to online. | **Founder** |
| 4 | Bid validity is entered in Notice and fee, on Scope and estimate. | Analyst's suggestion, confirmed |
| 5 | Both opening officers must confirm before the opening is finalised. | Analyst's suggestion, confirmed |
| 6 | Rejected bidders are not told through the portal until the evaluation is complete. | **Founder** |
| 7 | CPD will amend SK002 and SK003 to allow online sale, submission and opening. | Analyst's suggestion, confirmed |

Answer 7 settles the *direction* of two of the three conditions on the electronic box (6.15c; log line 1517): D6 and
the SK002 §7.7 amendment. **CPD has not yet amended the SOPs.** The amendment is pending and stays a go-live dependency,
not a cleared condition. The **outside cryptography review is still open** (see GAP-S1).

## 1. Who, the task, and how it goes wrong

- **Who.**
  - A CPD officer, several times a week, sets up an exercise, then uploads files and sends them for approval.
  - Two named opening officers, once per exercise, at the closing.
  - Suppliers, on the portal, buy the documents and submit a bid.
- **The task.** The target flow is in section 3 of the document. Requisition approved → exercise Draft → Scope and
  estimate (all form fields) → Tender documents (files, then Approval for tendering) → Publish → suppliers buy and
  submit online → Received → two-officer opening check → Jadual Tawaran → Evaluation.
- **How it goes wrong today.**
  - Set-up facts are spread over Overview, Scope, Tender documents and Invitation.
  - Two approval tracks look like one.
  - An on-screen bill of quantities, a panel and a "Mark ready" step block submission, and officers do not use them.
  - The receipt and opening model is paper.

## 2. Per-SR map

Legend: **UI** = screen-only. **Gate** = a server gate changes but the schema does not. **Schema** = needs a
migration in 20261101000000–20261101999999.

### SR-01 — Supplier registration in five steps

**(1) Where it lives today.**
- **Public form.** `/supplier/register` (`src/app/supplier/register/page.tsx`, `application-form.tsx`,
  `receive.ts`, `submit/route.ts`). It shows "Online applications are not open yet" when `loadRegistrationForm()`
  (`src/lib/portal/apply-repo.ts:39`) reports `missing`.
  - The test is `whatIsMissing` in `src/lib/portal/apply.ts`. The words are `APPLY.closedTitle` and `APPLY.missing.states` in
    `src/lib/portal/labels.ts:370,431`.
  - On the founder's local database, `SupplierListValue` holds only 3 ENTITY_TYPE rows and 2 COUNTRY rows, for the
    one organisation "Demo Utilities Sdn Bhd". It has **no STATE rows**, and no BUMIPUTERA_STATUS rows, which are optional.
- **Where the states are configured.** Configuration › Supplier register › **Lists**:
  - the screen is `src/app/configuration/suppliers/page.tsx:426`;
  - the editor is `saveListValue` in `src/app/configuration/suppliers/core.ts:225`;
  - the model is `SupplierListValue`, list `STATE`, kinds in `src/lib/suppliers/types.ts:56`.
- **The five-step wizard is already built, but only in part.**
  - Phase 4b built `/supplier/registration` (`src/app/supplier/registration/page.tsx`, `REGISTRATION_STEPS =
    ["company","documents","codes","epayment","review"]` in `src/lib/portal/registration/types.ts:12`) on the shared `Stepper`.
  - Its steps are Company (read-only), Compliance Documents, Work Codes, e-Payment, and Review & Submit.
  - It is **signed-in only**, after an officer accepts step 1 and an activation code is issued.
  - This is the ruling of 2026-10-07 (log line 1880): step 1 stays a one-page public form, steps 2–5 are a signed-in
    wizard, and self-sign-up is not adopted (draft ADR 0035).

**(2) What must change.**
- **(a) Data.** Load the states so the public form opens.
- **(b) Shape.** The document asks for the five steps as one form under "Register as a supplier", with Submit only on step 5.
  - This **reverses the 2026-10-07 two-stage ruling** for an anonymous applicant.
  - Read at its smallest, it could mean showing the five-step `Stepper` on `/supplier/register` with step 1 current, and
    steps 2–5 marked "after your application is accepted".
  - See GAP-R1.

**(3) Readers and dependants.**
- STATE is read by:
  - `receive.ts:110,149`;
  - `src/app/suppliers/actions.ts:223,230`, `suppliers/new/page.tsx:41,89`, `suppliers/online/[id]/page.tsx:62` and `suppliers/[id]/page.tsx:220`;
  - `portal/differences.ts:68` and `portal/registration/summary-store.ts:36,45`.
- The demo has its own invented states, `prisma/demo-step-one.ts:10-12`. They are loaded only by `scripts/demo-accounts.ts:163`.
- Nothing is removed.

**(4) The smallest safe path.**
- **(a) The data** goes into the founder's local database only. It is **not a code default and not a seed**.
- Phase 5 already holds `suppliers.saveListValue` for a second person (`src/app/configuration/suppliers/actions.ts`
  → `stageEdit`, uncommitted, Phase 5b).
- The audited path is therefore:
  1. The founder proposes each of the 16 values in Configuration › Supplier register › Lists, with provenance STATED.
  2. A **second** active account holding `configuration.issue` decides each one on Configuration › Changes.
  3. Codes are configuration keys and are never shown. Suggested codes are the ISO 3166-2:MY codes MY-01..MY-16.
- The 16 values are:
  - the 13 states: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Pulau Pinang, Perak, Perlis, Selangor,
    Terengganu, Sabah, Sarawak;
  - the 3 federal territories: WP Kuala Lumpur, WP Labuan, WP Putrajaya.
- **Blocker on the local database: the proposal itself is refused.**
  - `edit-store.ts:150,199` refuses a proposal when nobody besides the proposer could decide it. So the founder cannot
    even propose, not merely wait for a checker.
  - The local database has one active account, `haikal.admin` (administrator).
  - `gopal.tester` (Gopal Nair, role DIV_HEAD) is PENDING_ACTIVATION and not an administrator.
  - There are no `RolePermission` rows for `configuration.*`. `configuration.issue` is ADMINISTRATOR_OR_GRANT
    (`src/lib/auth/permissions.ts:52`), so Gopal would not hold it even once activated.
  - Before loading, either:
    - activate a second account that is an administrator; or
    - grant `configuration.issue` to a role that a second active person holds. That grant is itself a configuration change.
  - This path depends on Phase 5b's uncommitted `suppliers/actions.ts`. If Phase 5b changes before the load, re-check it.
- **A direct-write script, in the `demo-accounts.ts` pattern, would bypass maker-checker.** That pattern is the "do
  not fake a second approval" case. Do not use it on a non-demo organisation.
- The operation label "Save an entity type or a country" (`suppliers/operations.ts:8`) is stale: it also covers
  states. That file belongs to Phase 5, so mention the label there rather than edit it.
- **(b) The shape.** The smallest version is UI only: a `Stepper` on `/supplier/register` showing step 1 of 5. Anything
  more needs GAP-R1 ruled.

### SR-02 — Your account page width

- **(1) Where.** `src/app/account/page.tsx:52` (staff, the page in figure 2) and `src/app/supplier/account/page.tsx:74`
  (supplier) both wrap their cards in `max-w-4xl`. Sibling pages use the full content width.
- **(2) What changes.** Drop `max-w-4xl` from the wrapper on both. Keep the inner `max-w-md` on the password form,
  because a 1,200 px password field reads badly.
- **(3) Dependants.** No test or script asserts the width (grepped). The text snapshot is unaffected.
- **(4) Path.** UI. Check `/account` against `/configuration/accounts` and `/supplier/account` against `/supplier/company`.

### SR-03 — Approval for tendering only on Tender documents

- **(1) Where.** The Overview card is `src/app/sourcing/[id]/overview.tsx:161-180`, fed by `tendering` from `page.tsx:436`.
  The Tender documents tab **already** draws the same stepper:
  - `RouteCard` in `src/app/sourcing/[id]/documents/workspace.tsx:210-241`;
  - `tenderingStepperSteps` in `src/lib/tender-docs/route-flow.ts`.
- **(2) What changes.** Remove the Overview card and the `tendering` prop.
- **(3) Dependants.** `route-flow.test.ts` tests the lib only. Re-take the text snapshot of `?tab=overview`.
- **(4) Path.** UI.

### SR-04 — Remove the yellow chain warning

- **(1) Where.**
  - `RouteList` in `overview.tsx:77-101` renders every `route.warnings` entry as a `Callout`.
  - The text comes from `src/lib/authority/core-routing-labels.ts:83` through `src/lib/authority/resolve.ts`.
  - It says the matrix rule's core-routing choice is not decided.
- **(2) What changes.** The Contract card stops showing the core-routing warnings. "Who approves the appointment" stays.
- **(3) Dependants.**
  - The same warning is shown on these screens, and must stay there:
    - requisition (`requisitions/[id]/page.tsx`);
    - award (`awards/[id]/page.tsx`);
    - window (`window-section.tsx`);
    - Tender documents (`documents/workspace.tsx`, `route-steps.tsx`).
  - Rule 2 ("gaps stay honest") forbids hiding it where the route is submitted and decided.
- **(4) Path.** UI, limited to the Overview card. Filter out only the core-routing provenance warnings; keep error-level ones.
  - The legitimate fix is configuration. Decide "takes its chain from the core routing" on that rule in Configuration ›
    Approval matrix, and the warning clears everywhere.
  - Say this to the founder.
  - The Contract card as a whole also conflicts with "summary and flow only". See GAP-O1.

### SR-05 — Details & compliance and Key dates & person in charge move to Scope and estimate

- **(1) Where.** `DetailsCard` is `overview.tsx:496` and `KeyDatesCard` is `overview.tsx:627`. Their editors are:
  - `EditDetailsDrawer` (title, work code, person in charge), from `src/app/sourcing/editors.tsx`;
  - `AddRequirementDrawer`, `RemoveRequirementDrawer`, `RestrictionDrawer` and `PermitDrawer`, from `documents/conditions-editors.tsx`.
- **(2) What changes.** Render both cards in the Scope and estimate tab, which becomes a single form page or a new
  first section; see SR-08 and SR-09. The Overview drops them.
- **(3) Dependants.**
  - The cards read `ConditionsTab` (`src/lib/tender-docs/read-conditions.ts`) and `KeyDatesView` (`src/lib/method/key-dates.ts`).
  - Both are pure readers and move as they are.
  - `KeyDatesCard` links "Schedule one under Invitation, Briefing" (`overview.tsx:~667`). That link must point to the
    new briefing location.
- **(4) Path.** UI. Today the dates are *proposed at submission* (`submitPack` reads `startOn` and `closingDay`). The
  document wants them "entered on Scope and estimate". See GAP-D1.

### SR-06 — The Invitation tab moves into Scope and estimate, and the tab goes

- **(1) Where.**
  - The tab key is `invitation` (`page.tsx:203,283,322-323`).
  - The workspace is `src/app/sourcing/[id]/window/workspace.tsx`, with sections Window / Sale register / Briefing /
    Addenda. Before approval, `PreparingSection` shows "What the notice states, and the fee" and "Briefing and site visit".
  - Editors: `EditWindowDrawer` and `FeeLineDrawer` in `window/editors.tsx`, and `briefing-section.tsx`.
- **(2) What changes.** Pre-approval preparation (notice items, fee, bid validity per answer 4, briefing and site
  visit) renders on Scope and estimate. The `invitation` tab is no longer offered.
- **(3) Everything else on the Invitation tab has no home in the document.** It needs one (GAP-I1):
  - Publish: `PublishDrawer`.
  - The evaluation model chooser, `ChooseEvaluationModelDrawer`. It must still be fixed at publication
    (FR-EVL-006/007; `evaluationPin` in `src/lib/window/judge.ts:139`, `publish.ts:175`).
  - Channels and `RecordPublicationDrawer`.
  - Publication proofs, `OwnerAttachments PUBLICATION_PROOF`.
  - The notice preview and its frozen text.
  - "Before it can be published" findings.
  - The invited path: `ProposeInviteeDrawer`, the invitee list, the name route, and letters through `LetterDeliveryDrawer`.
  - The sale register (`sale-section.tsx`) and the supplier requests list (`requests-list.tsx`).
  - Briefing attendance (`briefing/[eventId]/attendance/route.ts`).
  - Addenda (`addenda-section.tsx`).
  - Closing change and extend, and cancellation of a published exercise (`tab-acts.tsx`; `page.tsx:323` says
    "cancelled from the Invitation tab").
  - Rules used.

**Other links to `tab=invitation`.** 16 occurrences in all:
- `src/lib/method/approval.ts:208` (window-change approvals in My approvals);
- `src/lib/documents/targets.ts:66` (addendum attachments);
- `src/components/shell/topbar.tsx:180` (Sales crumb);
- `sourcing/[id]/label/[saleId]/page.tsx`, `bids/workspace.tsx:46` and `overview.tsx`;
- `page.tsx:893` ("Open the Invitation tab" on the name tab);
- tests: `crumbs.test.ts`, `route-domains-window.test.ts` and `permission-gates.test.ts`.

**(4) Path.**
- A Gate change is needed. Window items are judged **at publish** today (`ITEM_FAULTS`, `src/lib/window/publish.ts:193`).
- "Filled in before the documents go for approval" adds them to `submitFaults` (`src/lib/tender-docs/pack.ts`) and to
  `submitPack` (`documents/actions.ts:574`). This is a Gate change, not a schema change.
- Keep `activeTabOf` tolerant: an old `?tab=invitation` address should land on the new home, not on the Overview.

### SR-07 — Name the two opening officers

- **(1) Where.** Not captured per exercise. The opening panel is picked **at opening start**:
  - from the method's opening committee seats (`src/lib/opening/panel.ts`, `OpeningPanelMember`);
  - with `panelSize` (FR-OPN-002) and the independence rule (FR-CTE-011, C-6).
  - Dual authorisation is `src/lib/opening/unseal.ts` and `OpeningAuthorisation`, each member's own signed act since
    Phase 3d, attributed to the panel seat (NFR-SIG-001).
- **(2) What changes.** A per-exercise roster of the officers who will open, captured on Scope and estimate.
  - Submission is blocked unless the required number of **distinct** officers is named.
  - At opening, only those officers may sit, authorise, answer the checklist and decide.
- **(3) Dependants and plug-in.**
  - `startOpening` (`opening/actions.ts`, `src/lib/opening/start.ts`) would build `OpeningPanelMember` from the named
    roster instead of from a pick at start.
  - The roster is still validated against the committee seats in force, `panelSize` and independence.
  - `authorisationFaults` (`NOT_ON_PANEL`) then enforces "only these two" with no change.
  - The Access tab's derived names (`exerciseAccessFacts`, ruling at log line 1711) must include them.
  - Administrators are refused (log line 1660).
  - "Two" is `Committee.panelSize`, which is configuration. **Never a literal.**
- **(4) Path.** Schema.
  - A new table, e.g. `ExerciseOpeningOfficer(exerciseId, personId, committeeMemberId?, seatLabelSnapshot, namedAt, namedByPersonId)`, audited.
  - Or `ExerciseParticipant` with a typed capacity. A dedicated table is preferred, because the opening reads it as a gate.
  - Plus a `submitFaults` code. See GAP-P1.

### SR-08 — Remove the Specification panel and the Signed panel form

- **(1) Where.**
  - Screen: `src/app/sourcing/[id]/scope/scope-section.tsx:34-127`.
  - Actions: `savePanel`, `recordPanelVerification` and `markPanelVerified` in `scope/actions.ts:411-587`.
  - Libs: `src/lib/scope/panel.ts`.
  - Models: `SpecificationPanel`, `SpecPanelVerification`, `SpecPanelColumn`; attachment purpose `SPEC_PANEL_FORM`.
- **(2) What changes.** The panel is no longer shown, edited, or required.
- **(3) Readers and dependants.**
  - **The gate.** `packFaults` blocks with `PANEL_NOT_VERIFIED`, `PANEL_SCAN_GONE` and `PANEL_BILL_SUPERSEDED`
    (`src/lib/scope/pack.ts:61-69`). It is read by `scopeReadiness` and `submitPack`, which locks the panel row at `documents/actions.ts:593`.
  - **Configuration.** Panel columns live on Configuration › Scope (`src/app/configuration/scope/core.ts`, a Phase 5 file).
  - **The document store.** `src/lib/documents/{owners,targets,entitlement,hidden,read,repo,attach,owner-facts}.ts` and
    `src/app/documents/actions.ts` (owner kind `specificationPanel`).
  - **The SULIT scans.** `sulit-fields.ts`, `sulit-trail.ts` and `act-slots.ts`.
  - **Demo.** `prisma/demo-scope.ts:303`, `prisma/demo-window.ts:563-585` and `prisma/demo-documents.ts:150,156`.
  - **Tests.** `src/lib/scope/panel.test.ts` and `pack.test.ts`; `src/lib/auth/act-begin.test.ts`; `documents/attach.test.ts`,
    `targets.test.ts` and `demo-wipe-plan.test.ts`.
- **(4) Path.** Gate plus UI, with no data dropped. The panel findings come out of the submit gate behind a configured
  switch (GAP-E1). The section is hidden. Rows, files and their History stay readable.
- **Spec.** This supersedes **FR-EST-005 (M)** for any customer that switches it off.

### SR-09 — Remove the on-screen bill of quantities; the BQ is an uploaded Excel

- **(1) Where.**
  - Screen: `scope/bq-section.tsx` and `csv-tools.tsx`.
  - Actions: `startBq` … `finaliseBq`, `startBqRevision`, `importBqCsv` and `exportBqCsv` (`scope/actions.ts:122-365,842-978`).
  - Libs: `src/lib/scope/{bq,csv,rates,bq-fields}.ts`.
  - Models: `BqVersion`, `BqSection`, `BqItem`, `BqTemplate*` and `RateSchedule`.
- **(2) What changes.** No on-screen BQ. The BQ becomes a tender document line with Template / Upload / Download / Replace (SR-11).
- **(3) Readers and dependants, across modules.**
  - **The submit gate.**
    - `BQ_NOT_FINALISED` and `BQ_REVISION_OPEN` in `packFaults` (`scope/pack.ts:55-59`).
    - `content.bqFinalised` in `submitFaults` (`documents/actions.ts:615`).
    - `markPartReady` reads `bqVersion` (`documents/actions.ts:276-277`).
    - The panel's `BQ_NOT_FINALISED` (`scope/panel.ts:171`).
  - **The freeze.**
    - `freezePack` freezes a `BQ_UNPRICED` document from `scope.bill` (`src/lib/tender-docs/freeze.ts` and `repo.ts:215-219`).
    - `TenderPack.bqVersion` pins the version.
    - The documents print says "the bill is issued unpriced" (`documents/print/page.tsx:22`).
  - **Scope approval, FR-REQ-014.**
    - A SCOPE matter is keyed on `bqVersionId` (`src/lib/scope/scope-matter.ts`; `tableScope`, `scope/actions.ts:769`).
    - `SCOPE_NOT_APPROVED` blocks submission wherever a method requires scope approval.
    - **With no bill it blocks forever.** The committee page links to `tab=scope&section=scope` (`src/app/committees/[id]/page.tsx:438`).
  - **Behaviour rules.** `primeCostSums` feeds `behaviourFaults` (`NOMINATION_NOT_FOR_TYPE`, `src/lib/tender-docs/behaviour.ts:64`).
  - **Contracts.**
    - `src/lib/contract/load.ts:131-170` reads `pack.bqVersion.totalsSnapshot` (prime cost and provisional sums) into the baseline.
    - `baseline.ts:183` falls back to null, and `baseline-entry.ts` lets them be ENTERED.
    - So contracts survive with sums entered by an officer.
  - **Variations.**
    - `VariationMeasurement.bqItemRef` is free text (`variation/measure.ts:77`) with no foreign key. Unaffected.
    - Re-measurement routing reads the baseline's `provisionalSums`. These can be entered, as above.
  - **Estimate.** `againstBill` (`src/lib/scope/estimate.ts:333`) already says "no bill" when the bill is null.
  - **Evaluation does not read the bill.**
    - `src/lib/evaluation/saving.ts` reads the estimate only, from the opening's frozen schedule.
    - `readers.ts` is custody. `report-view.ts` reads the schedule.
    - There is no `arithmetic.ts`, only a test of that name.
  - **Interim valuations read no bill.** There is no bill or BQ reference in `src/lib/payment/valuation.ts`. They read the contract baseline.
  - **Committee memos and sittings.** `src/lib/committee/{memo-store,sittings,hidden}.ts` read `bqVersion` for SCOPE matters.
  - **Configuration › Scope.** BQ templates, measurement standard and rate schedules, in a Phase 5 file.
  - **Demo.** `prisma/demo-scope.ts`, `demo-tender-docs.ts`, `demo-window.ts`, `demo-lifecycle.ts`, `demo-documents.ts`
    and `demo-sitting-trail.ts`.
  - **Tests.** Everything under `src/lib/scope/*bq*`, `pack.test.ts`, `sealed.test.ts` and `src/lib/tender-docs/{pack,stamp,appendix}.test.ts`.
    Also `sk001-fixture.ts`, `method/{evaluation,opening}-states.test.ts`, `sulit-*.test.ts`, `auth/{tenant,restricted,sulit-rollout}.db.test.ts`
    and `committee/memo.db.test.ts`.
- **(4) Path.** Gate plus UI. The bill findings leave the submit gate behind the basis's switch. The BQ becomes a pack part
  of upload kind. Existing bills stay readable on a read-only "Earlier bill" view, never stranded (`sections.ts` principle).
  - Scope approval must be re-keyed or switched off (GAP-E2).
- **Spec.** This supersedes **FR-EST-001 (S)**, **FR-EST-002 (M)**, **FR-EST-003 (M)** and **FR-EST-004 (S)** for a customer that switches it off.
  - FR-EST-002's re-measurement worklist then depends on provisional sums being entered, or read from the Excel. See GAP-E3.

### SR-10 — Online document purchase

- **(1) Where.**
  - The drawer "Prepare the window" (figure 10) is `EditWindowDrawer` in `window/editors.tsx`, saved by `window/actions.ts`.
  - The fields are `ExerciseWindow.inspectionPlace`, `purchasePlace`, `inspectionHours`, `submissionPlace`,
    `feePaymentMethods`, `purchaseFromDay`, `purchaseCloseDay` and `feeAmount`.
  - The physical sale is `DocumentSale`, recorded by an officer (`register-actions.ts`, `sale-section.tsx`, the label at
    `label/[saleId]/page.tsx`, FR-ADV-011).
  - Supplier side, Phase 4d:
    - `DocumentRequest` (FR-VND-012) with the pre-sale checks (FR-ADV-010);
    - `WindowPolicy.electronicDocumentRelease`, unset;
    - `releaseState` (`src/lib/portal/bids/release.ts`) releases the pack only after an officer records `financeReceiptNo`;
    - the manual fee-receipt adapter is `src/lib/integration/fee-receipt.ts`.
- **(2) What changes.**
  - Remove the four physical fields from the drawer.
  - Keep first and last day of sale, and the fee. Add bid validity (answer 4).
  - Suppliers pay online and then download.
  - Only buyers can bid.
- **(3) Dependants of the physical fields.**
  - **Publish gate.** `INSPECTION_PLACE_MISSING`, `PURCHASE_PLACE_MISSING`, `INSPECTION_HOURS_MISSING` and
    `SUBMISSION_PLACE_MISSING` (`src/lib/window/publish.ts:142-148`).
  - **Merge fields.** `window.inspectionPlace`, `window.purchasePlace`, `window.inspectionHours` and `window.submissionPlace`
    (`src/lib/window/fields.ts:30-39`).
    - A configured notice or letter template that still uses them reads as missing values and **blocks publish**.
    - The templates are customer configuration (Configuration › Templates / Invitation, Phase 5 files), not code.
  - **Readers.** `src/lib/window/{read,judge,audit-view}.ts`.
  - **Portal.** `src/lib/portal/{public,select,labels}.ts`, `portal/bids/{context-store,workspace-store}.ts`,
    `supplier/opportunities/[id]/page.tsx` and `supplier/bids/[id]/panels.tsx`.
  - **Demo.** `prisma/demo-window.ts`.
  - **Tests.** `window/fields.test.ts`, `publish.test.ts`, `special-permission-offer.test.ts`, `portal/public.test.ts` and `portal/bids/bids.db.test.ts`.
- **(4) Path.** Gate plus UI for the fields. The columns stay, unread and not dropped.
  - The publish faults are removed, citing SR-10.
  - The merge fields are retired from the whitelist, so a template naming them is refused on the template screen, not at publish.
- **The online purchase itself needs Schema plus a façade.**
  - A `PaymentGateway` interface goes in `src/lib/integration/`, beside `fee-receipt.ts`, with **no live adapter**.
  - The supplier initiates the purchase. Its state stays "awaiting payment" until the gateway, or the existing manual
    officer-recorded receipt, confirms it.
  - **No code path may write a paid state on the supplier's say-so, or as a stub** (GAP-PAY).
  - "Download" also needs file release. Phase 4d shows the pack as frozen text and offers **no file download** (log line 1913).
- **"How the fee is paid"** is not on the document's removal list, but it describes counter payment. See GAP-W1.

### SR-11 — Template / Upload / Download / Replace on every document

- **(1) Where.**
  - `PartsList` (`src/app/sourcing/[id]/documents/parts-list.tsx`). Its actions are `PickTemplateDrawer`, the
    `OwnerDocumentsButton` for upload parts, `MarkReadyDrawer`, `OmitPartDrawer`, `ReopenPartDrawer`, "Open", and "View as frozen".
  - `markPartReady` (`documents/actions.ts:267`) and `markReadyFaults` in `src/lib/tender-docs/pack.ts`.
- **(2) What changes.** Four actions only. A part is ready once a file is uploaded. No Open and no Mark ready.
- **(3) Dependants.**
  - **ADR 0008 and ADR 0013.**
    - Template parts are *merged text* from the template library, frozen as `TenderPackDocument.renderedText` at submission.
    - That frozen text is what the documents print, the supplier's Tender Table Document inspection
      (`supplier/bids/[id]/table-document`, `src/components/tender-document.tsx`, FR-DOC-010) and the inspection log show.
  - **The template library holds text bodies, not files.** "Template" has nothing to download until a template carries a file (GAP-T1).
  - **The Appendix and the notice.**
    - The Appendix is entered data that feeds the contract baseline (LAD, DLP, interim minimums, variation limits).
      It stays a form (SR-12), so not "every" line can be upload-only.
    - The notice of quotation part is the pack's own printable.
  - **Omit and Reopen** (optional parts) are not among the four actions (GAP-T2).
  - **Upload readiness.** `TenderPackPart.state` READY is set by `markPartReady` today. Uploading through the document
    store would set it, or "ready" would be derived from a live file.
  - The opening checklist is built from the mandatory parts marked `returnedByBidder` (`src/lib/opening/checklist.ts`).
    It is unaffected.
  - **Tests.** `tender-docs/{pack,part-view,composition,returned-by-bidder,refresh*}.test.ts`.
- **(4) Path.** Gate plus UI, with a superseding ADR for template parts if they become uploaded files.
  - The smallest version: keep text-merged parts as they are, auto-ready.
  - Make upload parts ready on their first live file.
  - Hide "Open" and "Mark ready".

### SR-12 — Appendix: check on Save

- **(1) Where.** `src/app/sourcing/[id]/appendix/page.tsx:86-104` draws the "Still to enter" card from `a.findings`.
  Saves go through `saveAppendix` and `saveAppendixSection` (`documents/actions.ts:412,522`), using group drawers
  (`appendix/editors.tsx`, `Group = all|officers|pc|insurance|lad|sectional|dlp|interim`).
- **(2) What changes.** No list. On Save, each missing required field shows an error at that field.
- **(3) Dependants.**
  - `appendixComplete` (`src/lib/tender-docs/appendix.ts`) still gates submission (`APPENDIX_INCOMPLETE`) and keeps the
    parts-list row note.
  - `a.findings` also carries warn and info findings, not only missing fields. They need a home, for example a single
    callout or field hints.
  - The "Go to it" anchors (`APPENDIX_CARD`).
  - The page is in `scripts/text-snapshot.mjs` runs; re-take its snapshot.
- **(4) Path.** Not UI-only: `saveAppendix` must return per-field `errors` from the required rule of the group being saved.
  - Group drawers save partially today. Decide whether Save refuses a group with an empty required field (GAP-A1).
  - No schema change.

### SR-13 — Received: online bids

- **(1) Where.**
  - `src/app/sourcing/[id]/bids/workspace.tsx`, `envelope-list.tsx`, `editors.tsx` and `actions.ts`.
  - `src/lib/bids/*`: `BidEnvelope` with channel COUNTER/POST/BOX, `BoxEvent`, `BidWithdrawal` and `ValidityExtension`.
  - ADR 0016: the register records envelopes, never offers.
  - `src/lib/bids/sealed.test.ts` scans the schema so that no price, period or content column exists on these tables.
  - Supplier side, Phase 4d (`/supplier/bids`, `/supplier/bids/[id]`): own-bid status only. It is **deliberately not sealed and not a submission** (log line 1913).
- **(2) What changes.** Received lists bids submitted through the portal, with their documents and the server stamp.
  Nothing is readable before opening.
- **(3) Dependants.**
  - Lateness (`bids/lateness.ts`, to the second, FR-BID-002) carries over.
  - Withdrawals (`withdrawal.ts`) become a supplier act.
  - Validity (`validity.ts`) reads `bidValidityDays`.
  - The award gate (`bidGate`, `page.tsx:270`) reads the register.
  - Late bids go to a committee (CommitteeDecision admission).
  - The company estimate is lodged as a `COMPANY_ESTIMATE` envelope on channel BOX (`lodgeEstimate`, `scope/actions.ts:669`; FR-EST-007/010).
  - Opening start requires it (`ESTIMATE_NOT_LODGED`, `opening/start.ts:85`).
  - **Demo.** `prisma/demo-bids.ts`, `demo-opening.ts` and `demo-my-bids.ts`.
- **(4) Path.** Schema, plus a superseding ADR for 0016.
  - New supplier-side records, e.g. `OnlineBid(exerciseId, supplierAccount/party, submittedAt server-stamped, status)`
    and `OnlineBidFile` through the document store, with declared fields (SR-15).
  - They hold **ciphertext only** before opening.
  - Either an electronic `BidEnvelope` channel with content held sealed (as ADR 0016's consequences foresaw), or a sibling table.
  - `sealed.test.ts` is updated, with an SR-13 citation, to allow the ciphertext columns only. It is never weakened.
  - Purchase gate (SR-10): only a party with a standing paid sale may submit.
- **Spec.** Brings in **FR-BID-001 (M)**, **NFR-SEC-003 (M)** and **FR-VND-013 (M)** (the sealed bid). See GAP-S1.

### SR-14 — Two-officer opening checklist, Pass / Reject

- **(1) Where.**
  - The opening workspace is `src/app/sourcing/[id]/opening/{workspace,lists,editors,actions}.tsx`.
  - Already built, on paper:
    - the checklist, `src/lib/opening/checklist.ts` (FR-OPN-008): the mandatory pack parts a bidder returns, plus addenda;
    - tri-state answers, `OpeningChecklistAnswer`;
    - the per-bid verdict PASS/REJECT, `src/lib/opening/verdict.ts` and `OpenedBid.verdict`;
    - initials, `OpenedBidInitial` (FR-OPN-006);
    - the two authorisations, `unseal.ts` (FR-OPN-003);
    - finalising, `finalise.ts`.
  - Evaluation takes only PASS bids of finalised openings (`src/lib/opening/carry.ts:16`). This already meets "only passed
    bidders appear in Evaluation".
- **(2) What changes.**
  - A matrix: a column per bidder and a row per mandatory document, with a download per bidder ("File").
  - Only the SR-07 officers may act.
  - Both confirm before finalising (answer 5).
- **(3) Dependants.**
  - The three documents (Surat Akuan Pembida, Borang Tender / Sebut Harga, Grand Summary) must come from configuration:
    the `returnedByBidder` part flags in Configuration › Tender documents (`src/lib/tender-docs/config.ts:51`), seeded per
    customer. **Never a literal list.**
  - Paper-only gates that refuse an online opening:
    - `BOX_NOT_LOCKED` in `authorisationFaults` (`unseal.ts`);
    - the box-envelope registration at opening;
    - `ESTIMATE_NOT_LODGED`;
    - `priceAsRead` and the other as-read fields, which an officer types from paper (`openEnvelope`, `correctAsRead`).
  - Verdict grounds: `verdict.ts` refuses a REJECT on completeness alone where the method says "report" (FR-BID-007:
    "shall not reject a bid on completeness grounds"). SR-14's Reject must respect that switch, or the switch is set.
  - **Prints.** `opening/print/page.tsx`.
  - **Demo.** `prisma/demo-opening.ts`.
  - **Tests.** All of `src/lib/opening/*.test.ts`, especially `unseal`, `start`, `state`, `verdict`, `checklist` and `panel`.
- **(4) Path.**
  - The matrix layout is UI.
  - The named officers are a Gate change (SR-07).
  - The online path is a Gate change: `BOX_NOT_LOCKED` does not apply to an online channel, and as-read fields come from
    the decrypted declared fields. It depends on SR-13 and the sealing model.
  - The decision record stays `OpenedBid.verdict`, with no new decision table.

### SR-15 — Grand Summary and Jadual Tawaran download

- **(1) Where.**
  - The Jadual Tawaran is already the opening schedule, `src/lib/opening/schedule.ts` (FR-OPN-005..007). It is frozen at
    finalising as `Opening.scheduleSnapshot`, with a print page at `opening/print/page.tsx`.
  - Its rows hold Bil (opening order), bidder, `registrationClassAsRead`, `priceAsRead`, `completionPeriod` and
    `completionUnit`, plus the estimate benchmark row once disclosed (FR-EST-010).
  - FR-OPN-010's Grand Summary is `src/lib/opening/grand-summary.ts` (qualified / not qualified / lowest), frozen as
    `grandSummarySnapshot`.
- **(2) What changes.** A table with Bil, Nama Pentender, Kelas, Harga (RM), Tempoh Kerja and Committee decision, plus two
  downloads. Both are available only after finalising.
- **(3) Where the figures come from in an online flow.**
  - **Harga and Tempoh Kerja.** These are the bidder's **declared fields on the online bid**: price, completion period
    and unit. They are sealed with the bid, decrypted at the second authorisation, and copied into `OpenedBid` as read.
    This keeps `OpenedBid` the one table holding a bid's figure (its source scan).
    The uploaded Grand Summary or Excel BQ is the bidder's evidence. It is not parsed.
  - **Kelas.** Read from the supplier register's live registration for the work code at opening (a frozen
    `eligibilitySnapshot` already exists), not declared. This needs confirming (GAP-J2).
  - **Committee decision.** `OpenedBid.verdict`.
  - **Readers of the schedule.**
    - The evaluation report and proposal (`evaluation/report/page.tsx`, `proposal/page.tsx`, `src/lib/evaluation/report-view.ts`).
    - The award gate (`openingGateFaults`).
    - The opening History and `sulit-trail`.
- **(4) Path.** Mostly UI over the frozen snapshots: a download route that renders the frozen schedule.
  - It depends on SR-13 for the figures in an online exercise.
  - Paper exercises keep working as they do today.

## 3. What is removed, and what must keep working

Nothing is dropped. Every removal is "no longer shown, edited or gated", and earlier records stay readable in History
and in the frozen packs. For every removed field or panel, record a comparator entry with the SR number as the reason:

- `scripts/compare-screen.mjs`, `DECIDED_ABSENT` (screen `/sourcing`):
  - Specification panel and Signed panel form (SR-08);
  - Bill of quantities (SR-09);
  - Invitation (SR-06);
  - the physical sale fields (SR-10);
  - Still to enter (SR-12);
  - Approval for tendering on the Overview (SR-03).
- `scripts/compare-drawer.mjs`, `DECIDED_FIELDS`. It has no sourcing key today; only `person`, `budget-code` and
  `delegation` exist. Add a key for the window drawer if it is compared.
- `scripts/text-snapshot.mjs` takes sourcing tabs as extra routes on the command line, for example
  `/sourcing/demo_sx16?tab=bids&section=opening`. Snapshot before and after each wave for:
  - `tab=overview`, `scope`, `documents`, `invitation` and `bids` (`received`, `opening`, `schedule`);
  - `/sourcing/[id]/appendix`;
  - `/supplier/register`;
  - `/account` and `/supplier/account`.

## 4. Gaps the document does not answer

- **GAP-R1 (SR-01).** Is a public five-step form (an anonymous applicant uploading files and bank details) meant to
  reverse the 2026-10-07 two-stage ruling?
  - That ruling rests on the F7 code ruling, F11 and the read-only public database role.
  - The minimal reading is a stepper on the public page with steps 2–5 after acceptance. Ruling needed.
- **GAP-I1 (SR-06).** Where these go once the Invitation tab is removed:
  - Publish;
  - the evaluation model choice, which must still be pinned at publication (FR-EVL-006/007);
  - channels and publication records, and publication proof;
  - the notice preview;
  - the invited path's invitee list, name route and letters;
  - the sale register and supplier requests;
  - briefing attendance;
  - addenda;
  - closing changes and extensions;
  - cancellation of a published exercise;
  - the My approvals deep link for window changes.
  - Suggestion: a post-approval "Publishing" section on the Tender documents tab (approval, then publish, then
    addenda and closing changes), and a sale-and-requests view on Bids and opening. This needs the founder's yes.
- **GAP-O1 (SR-03/04/05).** What happens to the Overview's other cards when it becomes "requisition summary and flow only"?
  - The Contract card holds:
    - the method;
    - the contract basis and type;
    - the deliverable;
    - who approves the appointment;
    - the **classification choice** (`ChooseTaxonomyDrawer`, the target of the `TAXONOMY_AMBIGUOUS` link on `page.tsx:311`);
    - the boundary callout;
    - dossier evidence and the coordination record (`OwnerAttachments`);
    - Rules used.
  - SR-04 keeps the approver line, which implies the card stays. Which parts stay?
- **GAP-D1 (SR-05).** Key dates are proposed at submission and recorded by the approver (BD-64-31). Does "entered on
  Scope and estimate" move the proposal earlier, so it is stored on the exercise before submission?
- **GAP-P1 (SR-07).**
  - Must named officers hold a seat on the method's opening committee, with independence checked at naming or at opening?
  - What happens if one is absent on the day: substitution with a recorded authority, as the panel override does now?
  - Is "two" always `panelSize`?
- **GAP-E1/E2/E3 (SR-08/09).** These are spec Musts.
  - Product removal versus a per-basis or per-method switch. AGENTS.md's pattern is that the product ships the switch
    and the customer sets it. RSAJ sets it off.
  - Scope approval (FR-REQ-014) is keyed on a bill version. Re-key it to the uploaded BQ file, or switch it off.
  - Where do prime cost and provisional sums come from for the contract baseline and re-measurement? Officer-entered
    at the baseline (already possible), or declared at upload?
  - Superseded for RSAJ: **FR-EST-001 (S), FR-EST-002 (M), FR-EST-003 (M), FR-EST-004 (S), FR-EST-005 (M)**.
  - Changed: **FR-DOC-010 (M)**, whose Tender Table Document contains the BQ as a file, not as frozen text.
  - **FR-REQ-014 (S)**, scope approval on a bill version, must be re-keyed or switched off.
- **GAP-W1 (SR-10).** "How the fee is paid" (`feePaymentMethods`): keep it, remove it, or derive it from the gateway?
  - The fee-basis lines (FR-ADV-008, minimum RM250 judged from configuration) are not mentioned.
  - The FR-ADV-011 label is for a paper set.
  - FR-ADV-010's "proof of authority sighted" by an officer has no online equivalent.
- **GAP-PAY (SR-10).** There is no payment provider (INT-10).
  - Design a `PaymentGateway` façade with no live adapter.
  - Until a provider exists, either nobody can buy online, or the existing manual adapter applies: an officer records the
    finance receipt, and the release follows (`electronicDocumentRelease`).
  - **Never a fake "paid".**
  - FR-ADV-009 reconciliation to finance stays on D5.
  - The document's "Done when" (a supplier pays online) cannot be met without a provider. Say so.
- **GAP-T1/T2 (SR-11).**
  - Prescribed templates as downloadable files (DOCX or XLSX). Where are they configured? Per part kind in
    Configuration › Tender documents (a Phase 5 file)?
  - Do the merged-text parts (notice, instructions, conditions) become uploaded files? That supersedes ADR 0008/0013 for those parts.
  - What happens to Omit and Reopen for optional parts?
  - Does SR-11's "the system does not display files" also remove the supplier's Tender Table Document inspection (FR-DOC-010)?
- **GAP-A1 (SR-12).** Does Save refuse a group with a missing required field, or save and mark it?
  - Where do the non-blocking Appendix findings (warnings and info) go?
- **GAP-S1 (SR-13).** The sealing standard for online bids. This is the key decision.
  - ADR 0016 rejected option B (a server-held key) and started from option C: two-share sealing, an X25519 key per
    exercise, the private key wrapped under passphrases held by the two opening officers. C maps naturally onto SR-07.
  - It still needs an outside cryptography review (log line 1517) and a recovery path for a lost share.
  - Answer 7 settles the direction of D6 and the SK002 amendment only. The amendment itself is still pending.
  - SR-14 says the officers "can only download these documents". That has two readings, and either one shapes the sealing model:
    - download only, with no viewer inside the app; or
    - only the three mandatory documents are unsealed at the opening check, and the rest only after it.
  - Until the review is done, the product must not claim "sealed". The founder must choose:
    - (a) build C and gate go-live on the review; or
    - (b) ship online submission with database-wall access control only, and say on screen that it is not ciphertext.
  - The company estimate is plain in the database (ADR 0012, and the go-live condition at log line 1852). Does it join the sealed set?
- **GAP-S3 (SR-13): bidder identity before opening.**
  - "Received lists the bids each supplier submitted" names bidders before opening.
  - FR-BID-001 (M) seals "any price, document or **identity attribute**" until opening. ADR 0016 decision 2 and 6.6 OD-2
    name no bidder before opening.
  - The document's "Done when" hides only prices and documents.
  - Ruling needed: before opening, does Received show a count and stamps only, or the bidders' names? If identity is
    sealed, the supplier link on the online bid is part of the sealed content, or is readable only by the platform and not by officers.
- **GAP-F1 (section 3): "each step must be complete before the next one opens".**
  - Today every tab is reachable. Gating happens on the server, at submit and at publish.
  - Ruling needed: does this mean disabled tabs, or server gates only? The design system's `Tabs` has no locked state, and adding one would be a shared-component change.
  - The Overview's process-flow steps (Set up, Documents, Approval for tendering, Advertised, Opening, Evaluation, Award;
    figure 3, built by `page.tsx`) no longer match the target flow. The target adds PR created and approved, "Publish to
    the supplier portal" and "Received".
- **GAP-S2 (SR-13).** Bid withdrawal and replacement before closing, online: allowed, and how many?
  - File-type and size limits per document.
  - Behaviour of a late online bid (refused at the closing second, or recorded late for the committee, as on paper).
  - Alternatives (FR-BID-006).
  - The paper channels during transition: answer 3 says online only for sale. Does submission also stop being on paper?
- **GAP-J1 (SR-14/15).** Three different things are called "Grand Summary":
  - the bidder's returned document (row 3 of figure 13);
  - FR-OPN-010's Layak / Tidak Layak / Terendah table;
  - the SR-15 table, which is the Jadual Tawaran plus the decision.
  - Which download is which? In what format: the frozen print as PDF, or XLSX?
- **GAP-J2 (SR-15).**
  - Figure 14 lists Bil in **price order**. Figure 13 lists **opening order**. FR-OPN-005 says opening order.
  - Figure 14 omits the company estimate benchmark row that FR-EST-010 and FR-OPN-005 require.
  - Is Kelas the register's class or the bidder's declaration?
  - "Committee decision" versus "the two officers decide": who is the committee at an online opening?
- **GAP-C1.**
  - Rejected bidders are told only after evaluation (answer 6). The non-award notice (FR-AWD-010, D7) already waits for
    the award. Confirm that no opening-stage notice is wanted.
  - Configuration files touched by SR-08, SR-09, SR-10, SR-11 and SR-14 (scope, invitation, templates, tender-documents)
    are being edited by Phase 5. Sequence after Phase 5 commits those sections, or edit on top of them.

## 4a. Spec requirements affected

Priorities are read from `docs/requirements/RSAJ-Portal-Requirements-Specification.md`. "For RSAJ" means behind a
customer switch, if GAP-E1 rules for a switch.

**Superseded (for RSAJ)**

| ID | Pri. | Why |
| --- | --- | --- |
| FR-EST-001 | S | BQ authoring, versioning and export. SR-09. |
| FR-EST-002 | M | Provisional flag on BQ lines. SR-09; re-measurement then depends on sums being entered (GAP-E3). |
| FR-EST-003 | M | SMM, departures and a qualified preparer on the BQ header. SR-09. |
| FR-EST-004 | S | Rate schedule drawn into BQ lines. SR-09. |
| FR-EST-005 | M | Specification Setting Panel. SR-08. |

**Changed**

| ID | Pri. | Change |
| --- | --- | --- |
| FR-ADV-003 | M | The notice's items (b), (c) and (g), the places and times for inspection, purchase and submission, become "online through the portal". Item (d), the fee and payment method, is open (GAP-W1). SR-10. |
| FR-ADV-010 | M | The officer's sighting of proof of authority has no online form. SR-10. |
| FR-ADV-011 | M | Annotating a paper set and its label. Online, this becomes an annotation of the release. SR-10. |
| FR-DOC-001 | M | Assembling the twelve parts in printed order, once parts are uploaded files. SR-11. |
| FR-DOC-010 | M | The Tender Table Document holds the BQ as a file, not as frozen text, and its inspection in the app may go (GAP-T2). SR-09, SR-11. |
| FR-REQ-014 | S | Scope approval is keyed on a bill version, so it must be re-keyed or switched off. SR-09. |
| FR-OPN-001, FR-OPN-002, FR-CTE-011 | M, M, S | Per-exercise assignment moves to naming at Scope and estimate. SR-07. |
| FR-OPN-003 | M | Dual control applies to an online unseal, without the box lock. SR-14. |
| FR-OPN-005 | M | Bil order: figure 14 conflicts with "order opened" (GAP-J2). The estimate row must stay. SR-15. |
| FR-OPN-006 | M | Initials per bid and signatures on the Jadual. Figure 13's matrix has no initials (GAP-J3). SR-14. |
| FR-OPN-008 | M | Tri-state answers per document. Figure 13 shows ticks only (GAP-J3). SR-14. |
| FR-EST-007, FR-EST-010 | M, M | The estimate's "lodged copy" goes into the box today, so an online box needs a sealed equivalent. SR-13. |

**Newly in scope**

| ID | Pri. | What |
| --- | --- | --- |
| FR-BID-001 | M | Electronic tender box, sealed submission. SR-13. |
| NFR-SEC-003 | M | Keys that no single administrator can use. SR-13. |
| FR-VND-012 | M | Online purchase and release on confirmed payment. SR-10. |
| FR-VND-013 | M | Prepare and submit a sealed bid. SR-13. |

**Still binding, unchanged:** FR-EVL-006 and FR-EVL-007 (the model is pinned at publication; GAP-I1), FR-BID-002, and
FR-BID-007 (completeness is not a ground to reject at submission).

- **GAP-J3 (SR-14).** Figure 13 shows ticks only, and no initials.
  - FR-OPN-008 asks for a tri-state answer per document: present, absent or not applicable.
  - FR-OPN-006 asks for an initial per bid and signatures on the Jadual.
  - Ruling needed: keep both inside the matrix, or confirm that the figure is a simplification.

## 5. Proposed waves

- **Wave 1. Screen-only, with no schema change. Can start now.**
  - SR-01 data: 16 states through the two-person path. This needs a second active account. It touches no code.
  - SR-01 shape: a `Stepper` only, after GAP-R1.
  - SR-02: account width.
  - SR-03: Overview approval card.
  - SR-04: Overview card warnings only.
  - SR-12: per-field errors on Save. This needs `saveAppendix` to return `errors`; still no schema change.
- **Wave 2. Scope and estimate, and Tender documents. Gate changes, plus one table.**
  - SR-05, SR-06 (after GAP-I1 and GAP-O1), SR-07 (new roster table, after GAP-P1), SR-08 and SR-09 (switches, after
    GAP-E1/E2), and SR-11 (after GAP-T1/T2).
  - Order:
    1. ADR for the switches and the template-file model.
    2. Gates in `src/lib/scope/pack.ts`, `src/lib/tender-docs/pack.ts` and `src/lib/window/publish.ts`.
    3. Screens.
    4. Demo and comparators.
- **Wave 3. Portal side. Schema plus ADRs.**
  - SR-10: payment façade and file release.
  - SR-13: online bid and sealing ADR superseding 0016, after GAP-S1/S2.
  - SR-14: the online opening path.
  - SR-15: declared fields and downloads.
  - SR-14's matrix UI and SR-15's download of the existing frozen schedule can ship earlier for paper exercises.

## 6. Rulings (product owner, for the founder, 2026-10-09)

This section now holds the rulings on every gap above; the "no decision is taken here" status applies to sections 0 to 5 only.

Order of authority: the document, then the specification, then earlier rulings, then the honest default (unset refuses,
and says so in words). The document supersedes only what it names. A spec Must that it does not name stays binding.

### Applies to every wave

- **G1. Pin the mode on the exercise.**
  - Store the specification panel switch (SR-08), the on-screen bill switch (SR-09), the submission channel
    (paper or online, SR-13) and the sale mode (SR-10) on the exercise.
  - Pin them when the exercise is created. Freeze them at submission (switches) or at publication (channel and sale).
  - Never read them live from configuration, so changing a customer's setting never rewrites the gates of an existing
    exercise.
  - Backfill existing exercises to their present behaviour: panel used, bill used, PAPER, COUNTER.
  - Creating an exercise is never refused: an unset setting is pinned as "not set", and submission (or publication) refuses in words until it is set.
- **G2. Configuration switches.**
  - Each new switch lives in Configuration and goes through the two-person path. Unset means refuse, with the words
    "... is not set".
  - The demo seed may set them for the demo organisations.
  - The founder's own organisation waits for a second account that can issue configuration. No direct-write script.
- **G3. Nothing is deleted.**
  - Existing paper envelopes, specification panels, on-screen bills, physical-sale fields and frozen packs stay readable.
  - Show them as read-only "Earlier record" sections, only on exercises that have them.
  - Their acts are offered only on exercises pinned to the old mode (G1).
- **G4. Removals are recorded.** Every removed field or panel gets a comparator entry, with the SR number as its reason.
  Tests change only to match a ruling, with a comment citing the SR number.
- **G5. Sequence after Phase 5.**
  - Configuration files under Phase 5 (scope, invitation, templates, tender documents) are edited only after Phase 5
    commits them, or on top of its changes with only our hunks staged.
- **G6. Who answered section 5.** Answers 2, 3 and 6 are the founder's. Answers 1, 4, 5 and 7 are the analyst's
  suggestions, confirmed by the founder's "change it". The SK002 and SK003 amendments are still pending, and stay a
  go-live dependency.

### Wave 1: screens only

1. **SR-01, the data.** The builder writes no state rows.
   - The 16 states and federal territories are loaded through Configuration › Supplier register › Lists, by the
     two-person path, once a second account can issue configuration.
   - Put this in the hand-over to the founder.
   - Reason: they are configuration, and a direct write fakes the second approval (AGENTS.md maker-checker).
2. **SR-01, the shape (GAP-R1).** Take the minimal reading.
   - Draw the shared `Stepper` with the document's five step names on the public `/supplier/register`, with step 1
     current.
   - Step 1's button reads "Send for checking", not "Submit". Under it, in words: steps 2 to 5 open after CPD checks the
     company and issues the activation code. Name the organisation from its configured name, never "CPD" as a literal.
   - The signed-in wizard keeps the same five names, and "Submit" appears only on step 5.
   - Reason: the document does not say the form is anonymous. Taking files and bank details from anonymous applicants
     would reverse the 2026-10-07 ruling (F7, F11, the read-only public role). This is logged as an interpretation the
     founder may overturn.
3. **SR-02.**
   - Remove `max-w-4xl` from `/account` and `/supplier/account`. Keep the inner `max-w-md` on the password form.
   - Compare against `/configuration/accounts` and `/supplier/company`.
4. **SR-03.** Remove the Approval for tendering card and its prop from the Overview. The `RouteCard` on Tender documents
   stays as the only place it is shown.
5. **SR-04.**
   - Remove the core-routing provenance warning from the Overview outright, with no tooltip. Keep "Who approves the
     appointment".
   - Every other kind of warning on that card stays, for example "no rule matched, the route is assumed".
   - Keep the core-routing warning where the route is submitted or decided: the Tender documents route card,
     requisition, award and window.
   - Reason: AGENTS.md rule 2.
   - Tell the founder the real fix: decide the core-routing choice on that rule in Configuration › Approval matrix.
6. **SR-12 (GAP-A1).**
   - Remove the "Still to enter" card.
   - `saveAppendix` and `saveAppendixSection` check the required fields of the group being saved. If one is empty, they
     refuse the whole group, write nothing, and return an error for each field.
   - The drawer stays open with what was typed.
   - Warning and info findings become hints on their fields.
   - `APPENDIX_INCOMPLETE` still gates submission.
7. **The Overview flow steps (GAP-F1).**
   - Rebuild the Overview's process flow to the document's section 3, each step derived from recorded state: requisition
     raised, requisition approved, exercise draft, scope and estimate, tender documents, approval for tendering,
     published, received, opening, Jadual Tawaran, evaluation, award.
   - "Each step complete before the next opens" is enforced by server gates where a step hands over (submit, publish,
     closing, opening, finalise). Each refusal is said in words, and the tab shows what is still missing.
   - No locked tabs, and no change to `Tabs`.
   - Reason: least scope, reversible, and old exercises stay reachable.

### Wave 2: Scope and estimate, and Tender documents

8. **SR-05 (GAP-D1).**
   - The Details & compliance and Key dates & person in charge cards, with their drawers, move to the top of Scope and
     estimate.
   - Key dates are stored on the exercise as proposed dates before submission. They need new nullable columns.
   - They read "Proposed" until the approver records them at approval (BD-64-31 unchanged).
   - The submit gate requires them.
9. **SR-06 (GAP-I1).**
   - **Scope and estimate** holds, before approval:
     - Notice and fee, renamed from "Prepare the window";
     - bid validity (answer 4);
     - Briefing and site visit.
   - Section order on Scope and estimate: Details & compliance; Key dates & person in charge; Opening officers; Notice and fee; Briefing and site visit; Company estimate as its own section (answer 2), its SULIT handling unchanged.
   - Their item findings join the submit gate. The publish gate keeps them as a backstop, so nothing is weakened.
   - **Tender documents** gains a "Publishing" section after the approval track, holding:
     - the evaluation model choice, still fixed at publication (FR-EVL-006/007);
     - the "Before it can be published" findings;
     - the notice preview and its frozen text;
     - Publish;
     - channels, publication records and proof;
     - invitees and letters;
     - addenda;
     - closing changes and extensions;
     - cancellation.
   - **Bids and opening** gains a first section, "Sales and briefing", for the sale register, supplier requests and
     briefing attendance.
   - Remove the Invitation tab. `activeTabOf` sends an old `?tab=invitation` link to the new home of its section.
   - Repoint all 16 links, including My approvals, the document targets and the topbar crumb.
10. **O1, the Contract card.**
    - The Overview becomes read only: a requisition summary card, which takes the method, contract basis and type,
      deliverable, who approves the appointment, the boundary callout and Rules used, plus the flow.
    - The classification choice (`ChooseTaxonomyDrawer`), dossier evidence and the coordination record move to Details &
      compliance on Scope and estimate.
    - The `TAXONOMY_AMBIGUOUS` link is retargeted there.
11. **SR-07 (GAP-P1).**
    - Add a new audited table of named opening officers per exercise, entered on Scope and estimate.
    - Submission requires exactly `Committee.panelSize` distinct officers, never a literal. An unset size refuses with
      "the number of opening officers is not set". The demo seed sets 2 (FR-OPN-002).
    - Each officer must hold a seat on the method's opening committee in force. Independence (FR-CTE-011) is checked
      when they are named and again at opening start. Administrators are refused.
    - `startOpening` builds the panel from this roster. The Access tab names the officers.
    - Substitution:
      - Only by a controlled change, with a recorded authority and reason, before the closing. The same seat and
        independence checks apply.
      - For an online exercise, the key is rewrapped at that point (ruling 20). With two shares a rewrap needs both current shares, so substitution needs the departing officer to take part. If they cannot, the exercise cannot be opened and the screen says it must be re-tendered, until a reviewed recovery design exists (ruling 21).
      - After the closing there is no substitution and no single-person recovery. The screen says that the exercise
        cannot be opened without both officers and must be re-tendered.
12. **SR-08 (GAP-E1).** Behind a per-organisation switch, "Specification panel used", pinned per G1.
    - When it is off:
      - the panel findings leave the submit gate;
      - the section is hidden;
      - earlier panels stay read-only.
    - RSAJ's setting is off.
    - Log: FR-EST-005 (M) is superseded by Sourcing Requirements v2 SR-08.
13. **SR-09 (GAP-E2, GAP-E3).** Behind "On-screen bill of quantities used", pinned per G1.
    - When it is off:
      - the bill findings leave the submit gate and `markPartReady`;
      - the BQ is a tender document part of upload kind, and its Template is the prescribed BQ Excel;
      - `freezePack` freezes the uploaded file by its hash;
      - the documents print names the file.
    - Scope approval (FR-REQ-014) is keyed to the BQ file version where the method requires it, and lapses if the file is
      replaced. A block that can never clear is not allowed.
    - Prime cost and provisional sums are entered at the contract baseline as ENTERED (already possible). They are not
      parsed from the Excel.
    - The nomination check reports "not checked: no on-screen bill". It never reports a pass.
    - Earlier bills stay read-only.
    - Log: FR-EST-001 (S), FR-EST-002 (M), FR-EST-003 (M) and FR-EST-004 (S) are superseded by SR-09. FR-DOC-010 is
      changed: the BQ is a file.
14. **SR-11 (GAP-T1, GAP-T2).** Every part line offers Template, Upload, Download and Replace. Open, Mark ready, Omit,
    Reopen and "View as frozen" are removed.
    - **Template files** are set per part kind in Configuration › Tender documents (two-person path). With none set, the
      line says "No template set" in words.
    - **Upload parts** are ready on their first live file.
    - **Merged-text parts:**
      - Template downloads the merged draft.
      - An uploaded file, if there is one, becomes the issued part.
      - With no upload, the merged text is issued as it is today, and the part is ready when its merge has no missing field (the existing merge findings); no Mark ready.
      - This needs a new ADR that supersedes ADR 0008 and 0013 only where a file is uploaded.
    - **Optional parts** with no file at submission are recorded as "Not issued" in the submission and the History.
    - **The Appendix** stays a form, with a "Fill in" link. This is a decided difference: its entries feed the contract
      baseline.
    - **Suppliers** download the released files. The in-app inspection log becomes a download log (FR-DOC-010 changed).
15. **The wave 2 order.**
    1. The ADR for the switches and template files.
    2. The gates: `scope/pack.ts`, `tender-docs/pack.ts` and `window/publish.ts`.
    3. The screens.
    4. The demo, the comparators and the text snapshots, taken before and after.

### Wave 3: the portal side

16. **SR-10, the fields (answer 3, GAP-W1).**
    - Remove the four physical fields and "How the fee is paid" from the Notice and fee drawer. The columns stay.
    - Remove the four publish findings, citing SR-10, for exercises pinned to online sale.
    - Retire their merge fields from the whitelist, so the template screen refuses a template that uses them.
    - The fee basis lines and their configured minimum (FR-ADV-008) are unchanged.
    - The FR-ADV-011 label becomes a release record naming the buyer and the time.
    - The FR-ADV-010 "sighted" check becomes a reading of the signed-in person's standing on the supplier record.
17. **SR-10, payment (GAP-PAY). SUPERSEDED IN PART BY THE FOUNDER, 2026-10-09:** "create a demo simulation for online
    payment, the integration will be done later. the user can click any of payment tools and simulate the payment. no
    need real provider for now." What replaces the bullets below where they conflict:
    - The `PaymentGateway` façade gets one adapter now: a **payment simulator**. The supplier picks a payment method
      (online banking (FPX), credit or debit card, e-wallet; the list is configuration) and chooses "Pay successfully"
      or "Payment fails" on a simulated provider page.
    - A simulated success records the purchase as paid **with the channel "Simulated"**, a simulated reference and the
      method chosen. It releases the documents exactly as a real payment would, so the flow can be demonstrated end to end.
    - Honesty: the simulated page, the receipt, the supplier's purchase, the officer's sale register and every export say
      "Simulated payment". A simulated payment never counts as a finance receipt and never reaches a finance export.
    - The simulator is turned on by a configuration switch (nullable; unset refuses in words and falls back to the
      officer-recorded receipt below). The demo seed and the founder's demo turn it on. It must be switched off before
      go-live; the go-live checklist says so.
    - The officer-recorded finance receipt stays as the second writer of "paid". The source scan proves these two are
      the only writers.
    - A real provider (FPX, card gateway) is a later adapter behind the same façade, on the founder's go-ahead.
    Original ruling, kept where it does not conflict:
    - Add a `PaymentGateway` façade in `src/lib/integration/` with no adapter, and no stub outside tests.
    - "Buy documents" creates a purchase in the state "awaiting payment".
    - The only writer of "paid" is the officer-recorded finance receipt (existing manual adapter), as a signed act. A
      source scan proves there is no other writer.
    - The supplier screen says, with the organisation's configured name: "Online payment is not connected yet. Pay the fee as [organisation] instructs; the documents are released when [organisation] records your receipt." Never "CPD" as a literal.
    - The published notice must not promise online payment while no provider exists.
    - `electronicDocumentRelease` stays unset for the product. The demo seed sets it.
    - Only a supplier with a released purchase may submit a bid.
    - Log: SR-10's Done-when ("pays online") and FR-VND-012 are not met until a provider exists (INT-10).
18. **SR-13 (GAP-S3).**
    - Before opening, Received shows only the count, the sequence and the server stamp of each submission.
    - It shows no bidder names. Names, prices and files appear after the opening is authorised.
    - Reason: FR-BID-001 (M) seals identity, ADR 0016 OD-2 names no bidder before opening, and the document does not ask
      for names before opening.
19. **SR-13 (GAP-S2).**
    - A supplier may withdraw or replace a bid before the closing. Each act is server-stamped and logged.
    - Replaced submissions stay sealed and are never decrypted.
    - A bid after the closing second is accepted, sealed, marked late and sent to the committee, as on paper (FR-BID-002,
      FR-CTE-008).
    - An alternative is a separate bid, only where the pack permits one (FR-BID-006).
    - Accepted file types per part are configured. The document store's platform limit applies.
    - Paper submission continues only on exercises already pinned to paper.
20. **SR-13 (GAP-S1), the sealing standard.** Option C from ADR 0016: an X25519 key pair per exercise, with the private
    key wrapped under two shares held by the two officers named under SR-07. Option B stays rejected. A new ADR replaces
    ADR 0016. Access has three states:
    - **Before both officers authorise the unseal:** no file byte and no declared figure is served to anyone, including
      administrators. The database holds ciphertext only.
    - **After the unseal:** only the two named officers may download, and only the mandatory opening documents. This is the one exception to "no price before finalising": the bidder's own Grand Summary carries its price, and SR-14 requires the officers to check it.
    - **Declared figures (price, period, identity on the schedule)** are shown on no screen and in no response until finalising. The ADR makes finalising the first point at which they exist in plain text in the database, or states exactly why not.
    - **After finalising:** everyone else with the capability.
    - **Publish refuses** until the exercise key pair exists and both named officers have set their shares.
    - Every attempt is logged, refusals included.
    - The company estimate's lodged copy is sealed under the same key (FR-EST-007/010). The retained copy keeps the F10
      residual.
    - Update `sealed.test.ts` with an SR-13 citation, to allow ciphertext columns only. Add tests that administrators
      are refused.
    - Update `signin-threat-model.md` with this design, including "the server sees shares as typed".
21. **The go-live gate for online submission.**
    - Online submission sits behind an unset switch. It can be set only after:
      - the outside cryptography review, including the recovery design;
      - CPD's SK002/SK003 amendment.
    - Until then:
      - the demo may run it;
      - the screen claims nothing beyond "encrypted under two officers' keys; independent review pending";
      - there is no single-person recovery.
22. **SR-14 (GAP-J3, answer 5).**
    - The matrix has a column per bidder and a row per mandatory document. Each cell has a download and a tri-state
      answer: present, absent or not applicable (FR-OPN-008).
    - Each officer's confirmation of a column is their initial (FR-OPN-006).
    - Pass or Reject needs both named officers. The method's completeness switch in `verdict.ts` is respected.
    - Only the SR-07 officers act. For online exercises, the box lock check does not apply, and figures come from the
      declared fields, not typed in.
    - Evaluation takes only passed bids (already the case).
23. **The three opening documents.**
    - A configured opening-check flag on part kinds in Configuration › Tender documents decides which documents are
      checked.
    - The names Surat Akuan Pembida, Borang Tender / Sebut Harga and Grand Summary go only into the RSAJ or demo seed.
      They never go into the empty-organisation setup, and never into a code list.
24. **SR-15 (GAP-J1, GAP-J2).**
    - **Where each column comes from:**
      - Harga and Tempoh Kerja: the bidder's declared sealed fields, written to `OpenedBid` in plain text only at finalising (ruling 20);
      - Kelas: the supplier register's frozen eligibility snapshot for the work code ("No class on the register" when there
        is none);
      - Committee decision: `OpenedBid.verdict`, decided by the two officers.
    - Rows stay in opening order (FR-OPN-005), and the company estimate benchmark row stays (FR-EST-010). Figure 14 is an
      illustration.
    - **The two downloads** take their titles from the labels the existing frozen schedule print uses, not new literals:
      - "Jadual Tawaran" is the frozen `scheduleSnapshot`;
      - "Grand Summary" is the frozen FR-OPN-010 `grandSummarySnapshot`.
    - Both are CSV built from the frozen snapshots, with no new dependency, plus the existing print page for the signed
      copy.
    - Both are offered only after finalising.
    - Paper exercises get them in the same way, and may ship before the rest of wave 3.
25. **Rejected bidders (GAP-C1, answer 6).**
    - No notice is sent at the opening stage.
    - The supplier's My bids shows "Opened; the result follows the evaluation" and never shows the verdict.
    - The notice belongs to the evaluation and award round.

### Wave 2b: open points (product owner, for the founder, 2026-10-12)

12a. **Office files in the document store (ADR 0035 item 11, commit 77fe072c): accepted for staff uploads, amended.**
    - Staff may upload .xlsx and .docx, recognised by the names in the ZIP's central directory and never unpacked. Macro, encrypted, ZIP64 and
      legacy .xls/.doc files stay refused. Each organisation still lists the types in its own upload rules, which ship unset. Without this,
      SR-09's "upload the completed BQ Excel" cannot be met.
    - Amendment 1 (code change, honesty). The `ARCHIVE_NOT_ACCEPTED` words say the portal "cannot tell apart" an Office file. That is now false
      for staff. A refused Office file must say why in words: macro-enabled, password-protected, or not readable as a workbook or Word document.
      It must say what to do instead: save as .xlsx or .docx without macros or a password, or as PDF. The supplier portal still refuses every
      Office file, so its words must stay true there too. Use two fault codes or one sentence true on both sides, with a test for each side.
    - Amendment 2 (code change; a product-owner tightening that no requirement asks for, which the founder may lift). On the same reasoning as the macro refusal, refuse an archive whose directory lists ActiveX controls
      (`activeX/`) or embedded OLE objects (`/embeddings/`). Say so in words. Pictures (`media/`) stay allowed. Add tests. There is no malware
      scan yet, so the store must not take in executable content it cannot inspect.
    - NFR-SEC-007 (M) requires every upload to be scanned for malware. Scanning is already an open go-live condition. Office files join it by
      name (backlog entry, document only).
    - Amendment 3 (code change, honesty). The supplier portal reads the same upload rules (`DocumentStorePolicy.allowedMediaTypes`, through
      `loadUploadSettings`), and its registration screen lists them to the supplier (`src/lib/portal/registration/view.ts`). On `perolehan`
      it now tells suppliers that .xlsx and .docx are accepted, and then refuses them. The supplier-facing list must show only the types the
      supplier path recognises (one pure function, tested). Configuration › Documents must say beside the two Office types that they apply to
      staff uploads only, until the wave 3 ruling below.
    - **Suppliers (SR-13): not now.** In practice a supplier returns the priced BQ as the prescribed Excel, so online bids will need .xlsx (and
      may need .docx). That is decided in the wave 3 sealing ADR (ruling 20), which must cover:
      - the same recogniser, one function shared with the staff path;
      - accepted types configured per part (ruling 19), shipping unset;
      - the supplier routes reading the file's tail;
      - type checking and the malware scan running on the plain bytes **before** sealing, since nothing can inspect ciphertext. This makes
        scanning a precondition of the ruling 21 go-live gate;
      - figures still coming only from the declared fields, never parsed from the Excel (rulings 20 and 24).

12b. **"Per part kind" (ruling 14): confirmed as the configured part.** "Per part kind" means a row of Configuration › Tender documents, not
    the closed `PartRole` list, because two parts of one role can be different forms (ADR 0035 item 9). Ruling 23's "opening-check flag on
    part kinds" is read the same way, so wave 3 does not diverge. No code change.

12c. **G2 breach (`npm run demo:switches` on the founder's database `perolehan`): the writes stand, disclosed. The mode is retired.**
    - What was written, all audited and attributed to the demo loader (audit ids `demo_swau1` to `demo_swau7`), with no exercise pin changed
      (all 23 exercises keep both pins "used"). There were three configuration changes, not two (the builder's report left out the first):
      - the upload rules, which gained .xlsx and .docx;
      - the scope policy, where both switches went from "not set" to "not used";
      - a template file on the two bill-of-quantities parts.
    - This broke G2 and the SR-01 ruling (log, 2026-10-09: "No direct-write script" on the founder's database). It is recorded as a breach,
      not an ambiguity.
    - **Not undone now.** Writing the earlier values back today would itself be a one-person write of configuration, the very thing G2
      forbids. The founder's organisation holds only invented demonstration data. The trail names the writer and the reason, and the
      configuration screens' History shows it; no Configuration screen (Scope, Documents, Tender documents) claims that two people issued it.
      The 2026-10-01 case of a one-person write to the demo organisation was disclosed and accepted, and the value was put back by a demo
      reload. A reload is no longer possible: `demo:wipe` is retired and the loaders are additive (ADR 0034 D11). Today the only undo is
      another one-person configuration write. That is why the writes stand, and the rule stands.
    - **Once the founder has his second account**, he reviews the three writes. He then confirms them, or reverses or changes any of them
      through Configuration by the two-person path. The scope form already offers "Not set". Nothing is deleted, and the database is not
      reset. Put this in the hand-over.
    - **The script from now on (code change):**
      - Configuration rows (any table edited through Configuration's two-person path) are written by the demo only inside `demo:load` on a
        fresh database, as `demoStarted` reports it. That is the seed G2 allows.
      - The standalone `switches` mode is retired as `demo:wipe` was: it prints why and exits non-zero, writing nothing.
      - No additive step run on an already-loaded database writes a configuration row. Where a step's demonstration needs a setting that is
        not set, it says which setting and where, in words, and writes nothing for it.
      - Additive business-row steps (the 2026-10-06 ruling 4 precedent) are unaffected.
      - Add a test that the retired mode writes nothing and exits non-zero.
      - "Demo organisation only" cannot be enforced as written. `demoIsLoaded` reads the whole database, and the founder's organisation is
        itself the demonstration's. The fresh-load rule above is the enforceable form.

12d. **The demo's own exercises stay pinned "used": confirmed.** They were authored with panels and on-screen bills. G1 forbids rewriting the
    gates of an existing exercise, and G3 keeps their records. Only exercises created after a setting is issued take it. No code change.
    - Optional, not part of this ruling: one new demo exercise pinned off, with its own `demo_` id, made through the product's own create
      act and only in `demo:load` on a fresh database. It would show the SR-08, SR-09 and SR-11 behaviour without hand-authoring.

12e. **"Take the organisation's setting": confirmed.** Without it, G1 would leave an exercise created while a setting was unset blocked
    for ever.
    - Checked in `src/lib/scope/switches.ts`, its tests and `takeScopeSettings`:
      - it refuses while the organisation's own setting is not set, naming which;
      - it refuses from the first submission and on a cancelled exercise;
      - it never changes a pin that is set;
      - it copies the configured value only, with no free choice;
      - it writes the before and after in the same transaction, under the exercise's lock.
    - Taking one switch while the other's setting is unset takes the one and reports the other in words. That is accepted.
    - Minor tidy, not blocking: the action restates the two switch labels. It should use `SWITCH_LABEL`.

### Wave 3a: open points (product owner, for the founder, 2026-10-12)

17a. **A restricted tender sold online (review M1): the supplier register evidences the restriction. The tender is not kept counter-only.**
    - **Why not counter-only.**
      - The sale mode is copied from the organisation's setting when an exercise is created. It is taken only while unset (G1, 12e), and no act sets an exercise to COUNTER by choice.
      - So in an organisation that sells ONLINE, a restricted tender pins ONLINE and `ONLINE_RESTRICTED` refuses its publication for ever. That is a block that can never clear (ruling 13; wave 2b review M2).
      - A counter path would also need the physical fields that answer 3 removed.
      - FR-VND-012 (M) makes the online purchase "subject to the pre-sale checks at FR-ADV-010", so the specification expects these checks online.
      - Ruling 16 already replaced the officer's sighting of authority with a reading of the register. This extends the same reading to the restriction.
    - **What evidences it.** Only the organisation's configured evidence document (`SupplierPolicy.restrictionEvidenceTypeId`, BD-615-1), lodged on the supplier's record and VERIFIED by an officer. The declared claim (`bumiputeraClaimCode`) is never read for this.
    - **At the purchase** (pure, tested; the outcomes mirror the counter's `saleFaults`):
      - The evidence type is not set: refused, in words that name the setting.
      - No verified evidence document is in force on the day of purchase (none lodged, lodged but not verified, found not in order, or expired): refused. The attempt is kept with its reason (FR-ADV-010: "refused with the reason recorded").
      - In force today but it lapses before the closing day: the purchase is allowed with a warning. It says a renewal must be lodged and verified before the closing day, or the bid will be found not evidenced. This mirrors the counter's `CERT_EXPIRES_BEFORE_CLOSING`.
      - The sale keeps the register's reading frozen (`eligibilitySnapshot`). The sale register shows "Restriction: verified on the supplier register" with the document's reference and validity, in place of the certificate-sighted fields. It never says "original sighted".
    - **At the opening.** For a sale made from an online purchase, `restrictionFinding` reads the register's restriction reading for the closing day, frozen on the opened bid. It never reads the sale's sighting columns, which are empty for an online sale. For a counter sale nothing changes.
      - A verified document in force on the closing day: EVIDENCED. None: NOT_EVIDENCED, which is eliminatory, as on paper.
      - The closing-day edge follows the register's `expiryOnClosingDayCounts`, shown on screen. An exercise is pinned to one sale mode, so its buyers are never judged under two rules.
      - A configuration gap (evidence type or closing-day rule not set) is a blocking fault at the opening, in words, as `RESTRICTION_NOT_ANSWERED` is. It is never a finding.
      - A renewal lodged before the closing and not yet verified is "not assessed". It is never EVIDENCED and never quietly NOT_EVIDENCED. That bid's verdict waits, with the reason in words. While it reads not assessed, the reading is taken again, audited and frozen again, each time the officer acts on the bid. The wait ends when the document is verified (EVIDENCED) or found not in order (NOT_EVIDENCED), so the opening can always finish (ruling 13). The last reading taken decides the verdict and is the one shown.
    - **Remove the three refusals** (`ONLINE_RESTRICTED` at taking the setting, at publication and in the policy save, and the BLOCK in `onlinePurchaseChecks`) in the same change as the purchase and opening sides, never before.
      - Today an online sale reaches the paper opening, where an empty sighting reads NOT_EVIDENCED. Lifting the refusal alone would eliminate every online buyer.
      - Tests change only to match this ruling, citing 17a.
    - **Hand-over.** CPD's SK002 amendment (G6, already a go-live dependency) must say that an officer's verification of the evidence document on the register stands for showing the certificate at the counter (SK002 7.5.1(b),(c)).
    - **Code:** a separate fix, not part of wave 3b. It does not wait for wave 3b, and it must land before any organisation sells online.

17b. **Undoing an online sale (review M2): the refusal stands for now, with true words. A controlled reversal is needed before any organisation sells online for real.**
    - **What is wrong with refusing alone.** Without the simulator, an online purchase is paid only by an officer typing the finance receipt against it (`recordPurchaseReceipt`).
      - A receipt typed against the wrong purchase gives documents and bid standing to a supplier who did not pay.
      - It also uses up the number, because receipts are unique across all sales, voided ones included. The supplier who did pay cannot be recorded as paid, and so cannot tender.
      - The refusal leaves that in place, and that is a correctness fault.
      - Prisma's lack of partial indexes is not the reason to refuse: migration `20261102200000` already writes raw-SQL triggers.
    - **Now (a small separate fix):** the `ONLINE_SALE` words must say only what is true. "The procurement lead" is a role the product does not have, and nothing in the product can put the sale right. Say instead:
      - the sale stands;
      - it cannot be reversed in the portal yet;
      - the opening still judges the buyer's standing and eligibility;
      - any refund follows the organisation's own finance procedure outside the portal, and is not recorded here.
    - **The reversal** (a separate fix, not wave 3b; a go-live condition for online selling, entered in the backlog):
      - **For which sales:** sales from a purchase paid by a finance receipt or by the simulator. A real provider's refund comes with that adapter (INT-10), behind the same façade.
      - **Who:** a two-person act. A signed-in officer proposes it with a reason. A different signed-in officer approves it, and that officer did not record the receipt. Reuse an existing two-person pattern (the configuration change, or the opening's dual authorisation). If neither fits a sale, the ADR says why.
      - **When:** while the window is open and the buyer holds no bid, as the counter's void (`WINDOW_CLOSED`, `ENVELOPE_HELD`). After that it is refused in words, and the opening judges the bid.
      - **Effect, in one audited transaction under the window lock:**
        - the sale is voided with its reason;
        - the purchase moves PAID to VOIDED. This is a new transition the trigger explicitly allows, not a loosened guard;
        - one live purchase per supplier and window is enforced by a raw-SQL partial unique index, so the supplier may buy again;
        - the release and the bid standing end. Downloads already made stay logged.
      - **The receipt:** where the reversal corrects a receipt typed against the wrong purchase, the number moves to the right purchase, which is awaiting payment, in the same audited transaction. The voided sale's column is cleared, and the old value stays in the audited before and after. The unique index on receipt numbers is unchanged (OD-11), and the counter's one-person void is unchanged.
      - Not part of this ruling: a voided counter sale also keeps its receipt number, so a counter receipt typed in error cannot be moved. That is a separate open point for the founder.
      - **Money:** the product moves none. If the organisation refunds, an officer types finance's refund reference; the system never makes one up. With none typed, the record reads "No refund recorded". Whether a fee is refunded is the organisation's policy (compare FR-ADV-016) and is never assumed.

17c. **A bid does not also require the finance receipt (review S9). `holdsBidStanding` stands as built.**
    - A counter sale already requires the officer's collector and payment method. A missing receipt number is only a warning (`RECEIPT_NOT_RECORDED`): the fee was taken, and the number is finance's paperwork.
    - An online purchase stands only once it is PAID, by the gateway or by a recorded finance receipt, and its sale is written only then. So online standing already requires a confirmed payment.
    - Requiring the receipt would split the bid gate from the opening's `LIVE_SALE`. A buyer who paid could then be refused a bid because of back-office lag, or the paper opening's rule would have to change, which nothing asks for.
    - Receipt gaps already surface in the reconciliation list (`receiptExceptions`, FR-ADV-009).
    - The open point of the wave 3a review (log, 2026-10-12, item 3): a counter sale counts for a bid whatever `electronicDocumentRelease` says. The release setting governs only the online documents.
    - **Code:** none now. In wave 3b:
      - `holdsBidStanding` and the live-sale reading inside the opening's `saleFinding` (not its invitee-list check) are one function, or a test pins them equal;
      - the "Product owner to confirm" comment is replaced with a citation of 17c.

### Wave 3b: ADR 0036 open questions (product owner, for the founder, 2026-10-12)

These rule on the open questions of ADR 0036 (`docs/notes/architecture/0036-online-sealed-bids.md`), its two untaken-question decisions, and
its pin and switch. Where a ruling corrects the ADR, the ADR is changed to match before step 3 of the wave 3b build plan; the list is at the
end. Order of authority as above: the document, then the specification, then earlier rulings.

20a. **Q1, identity hidden on every screen but not in the database: accepted for building and for DEMONSTRATION. For LIVE it is a recorded
    gap against a Must, not a met requirement.**
    - FR-BID-001 (M) says no user, administrators included, can read "any price, document or identity attribute" before the opening, and
      its test is that "a privileged database query returns ciphertext". The design meets that for price and documents. It does **not** meet
      it for identity: `OnlineBid.supplierId`, the file and bid account links, the audit actor, `ActAttribution` and `SealedAccessEvent` are
      plain.
    - Why it is not sealed now: the supplier account is the attribution of a signed act (AGENTS.md: every change audited), it is in the
      access log and in the sessions, and bidders are a subset of the buyers the office already sees on the sale register. Sealing the link
      alone would hide little and cost the audit trail.
    - So: the ADR stops saying "accept". It says FR-BID-001's identity clause is **not met against a privileged query**, recorded as
      deferred with this reason. The customer's written acceptance of the honest limits (threat model §G, must-have 6) names this clause
      explicitly. The outside review is asked whether a blinded supplier link is worth its cost. No screen says identity is encrypted
      (D13 already).
    - A source scan pins the list of plain identity columns on the sealed tables, so it cannot grow unnoticed.

20b. **Q2, until when late online bids are taken: until the main opening is started, not until it is unsealed. This corrects the ADR.**
    - The paper register already closes at the start of the opening (`exerciseFaults`, `AFTER_OPENING`: "the register is now the
      opening's"). D12 makes the online envelope part of the same register, so one register keeps one closing rule. The unseal is a second
      rule with no source.
    - The online trigger is named: for ONLINE, `openingStarted` reads the main `Opening` row's start (`startOpening`). It does not read the
      box's `UNLOCKED_FOR_OPENING` event, which an online opening never writes, so without this the online register would never close.
      `submitFaults` takes that start in place of `unsealedAt`. `LATE_CLOSED` says so in words, and every refusal is a `SealedAccessEvent`.
    - `startOpening` (through `inOpening`) already locks the exercise and its envelope rows. The online submit must take the same locks (it
      allocates its envelope sequence under `lockEnvelopeRows`), so a submission is either before the start or refused.
    - Unchanged: a late bid is accepted, sealed, marked late, counted and sent to the committee (FR-BID-003, FR-CTE-008). A supplier with a
      live in-time bid may not add a late one (FR-BID-005).

20c. **Q3, who sees bidder names between the unseal and finalising: the named officers only (the ADR's default). Confirmed.**
    - Ruling 20 is the later and more specific: identity on the schedule is shown on no screen until finalising. Ruling 18's "after the
      opening is authorised" is read as being for the officers who conduct it, who need the names to work the SR-14 matrix, as the
      committee reads names aloud at a paper opening.
    - Everyone else with the capability sees names at finalising. Suppliers never see another bidder (FR-VND-013).

20d. **Q4, officer keys: per exercise (the ADR's default). Confirmed.**
    - A guessed, stolen or forgotten passphrase then costs one exercise, not every exercise the officer sits on. Substitution and re-key
      stay local to the exercise. A per-person key can be added later as a wrap, so this is reversible.

20e. **Q5, rate limits and caps: product behaviour, as constants in `limits.ts` with their reasons, on the SEC-2 precedent. Three layers.**
    - **Rate limits:** per account, product constants (the wave 3a SEC-2 ruling). If a customer needs different numbers, that is a
      decision to propose.
    - **Caps** (draft files, submissions): per supplier per exercise, product constants, never a pool shared between suppliers, so one
      bidder cannot use up another's room (threat S17). A cap never blocks a withdrawal and never removes a standing bid. At the cap the
      words say that the last submission stands.
    - **Upload concurrency** (`BID_UPLOAD_MAX_CONCURRENT`): deployment configuration, a memory guard shared across the deployment. Its BUSY
      answer says in words to retry, and that the submission's own stamp, not the upload's, decides lateness.
    - The size of each part stays the customer's configuration (`bidMaxBytes`), as D7 has it. The numbers are logged when built.

20f. **Q6, a lost share after a submission: re-tender. Re-keying and asking bidders to resubmit is not adopted. Referred to the founder
    with the recovery question.**
    - Ruling 11 already says that, until a reviewed recovery design exists, the exercise must be re-tendered.
    - Re-key-and-resubmit voids bids that suppliers submitted in good faith with no committee decision (the authority over tenders is the
      Board's, FR-BID-003). It depends on a notice the product cannot send (threat S18). It would also move the published key fingerprint
      mid-window.
    - It is a recovery design, so it goes into the outside-review pack beside the k-of-m threshold, as an option for the founder.

20g. **Q7, re-lodging the company estimate on a re-key: acceptable under FR-EST-007, on four conditions.**
    - The lead check reads the date of the estimate's current version (`leadTime` on `preparedOn`), never the lodgement date. So a
      re-lodgement of the **same version** does not trip it. A new version is judged as any amendment is (FR-EST-009).
    - The re-lodgement is the lodging officer's own act under the existing lodge rules, before the closing, with a reason. It is never
      done by the server from the retained copy.
    - A re-key **shreds every share of the retired key** in the same transaction. Otherwise the superseded lodgement stays decryptable
      while its shares exist, and FR-EST-007's "exactly two controlled copies" is broken. The same shred makes the discarded draft parts
      unreadable.
    - A re-key is refused after the closing.
    - Until it is re-lodged, `ESTIMATE_NOT_LODGED` blocks the opening's start, in words, as it does today.

20h. **Q8, alternatives: no live main bid is needed. This also amends ruling 19 on alternatives that are not permitted.**
    - FR-BID-006 records each alternative as a separate bid, and the spec gives a bid an "alternative-bid flag and parent". No source makes
      an alternative depend on a conforming bid. The paper register lets an alternative envelope name a parent, or not.
    - **The parent link.** An online alternative may name a parent. If it does, the parent must be the same supplier's own live bid on the
      exercise, or the submission is refused in words. This is the analogue of paper's `PARENT_NOT_A_BID`, and it replaces `NO_MAIN_BID`.
      - A replace of the parent re-points the link to the replacement.
      - A withdrawal withdraws only what it names. The screen lists the linked alternatives so the supplier can withdraw them in the same
        act. An alternative the supplier keeps has its link cleared in the same recorded act, and it stands alone. No link ever points at a
        REPLACED or WITHDRAWN bid.
      - The row's current parent is the one the opening uses. The manifest seals the parent as it was at submission, and the unseal's check
        compares everything else. The ADR names that column as the one that may move, and the trigger allows it to move only by these two
        acts.
    - **Amends ruling 19.** Ruling 19's "only where the pack permits one" is changed to FR-BID-006's acceptance criterion: where the
      documents do not permit alternatives, an alternative is **recorded and marked Not Considered**, not refused. That is the paper
      behaviour (`alternativeStatus`). The specification ranks above an earlier ruling. The supplier is told before submitting that it will
      not be considered. `ALTERNATIVES_NOT_PERMITTED` leaves `SubmitFault`.
    - **Not stated** (`alternativesPermitted` null): publication of an ONLINE exercise refuses until it is stated (`publishSealingFaults`,
      the unset-refuses pattern). The case never reaches a bidder. The door keeps `ALTERNATIVES_NOT_STATED` as a defensive refusal only.

20i. **Q9, LIVE withdrawn after an incident: it does not stop submission on exercises already published (G1 holds). The incident path is
    per exercise.**
    - Withdrawing LIVE refuses new publication of ONLINE exercises. A published exercise keeps its pin.
    - What an incident does to a published ONLINE exercise uses the existing acts: a closing extension or a cancellation, each with its
      authority and reason. The switch screen lists the published ONLINE exercises still taking bids, so whoever withdraws LIVE sees what
      to act on.
    - **The mode is frozen at publication too**, beside `submissionChannel`. Otherwise turning DEMONSTRATION to LIVE would promote a
      demonstration exercise, whose receipts say "not for real tenders" and whose files read NOT_SCANNED, into a real one.
    - The deployment's permission for demonstration (`SEALED_BIDS_DEMONSTRATION_ALLOWED`) is read live, as the payment simulator's is. It
      is the deployment's guard, not the customer's policy.

20j. **Q10, signed receipts: not now. For the outside-review pack and the backlog.**
    - The receipt digest lets a bidder check that what was opened is what it submitted. A deployment signature would add evidence against
      a forged or misreported bid (threats S6, S11), but it brings key custody and rotation that no requirement asks for yet.
    - Until then, no screen calls the receipt "signed" or "proof". It is "your receipt; it records what the portal told you".

20k. **Q11, a panel above 2: every named officer (n-of-n, n = `Committee.panelSize`). Confirmed. No fixed two.**
    - "A fixed two of them" needs either a literal 2 (AGENTS.md rule 1) or a new threshold the customer would have to set, and a threshold
      needs a different split from n-of-n XOR, which the outside review has not seen. n-of-n is the reading of "both" (SR-07, FR-OPN-003,
      ruling 20) that adds no number.
    - FR-OPN-002 already makes a size other than 2 a controlled change with recorded authority.
    - The Opening officers screen says in words that every named officer is needed to open, and that each extra officer is one more who
      can make the exercise unopenable. k-of-m stays the founder's, with the review.
    - Noted, not ruled here: paper's `opensTheBox` keeps the literal `=== 2`. That is a separate backlog item.

20l. **Q12, Received showing the late flag before the opening: yes. Confirmed.**
    - The flag is the server's finding from the stamp and the closing, both of which are already shown, so it adds no information.
      FR-BID-003 requires late bids to be counted and segregated. Ruling 18's "only" limits what is shown about the **bidder**, and the flag
      says nothing about who.

20m. **The ADR's untaken question: a non-invitee refused at submission. Confirmed, because it refuses nothing new.**
    - On the invited path, the online purchase already blocks a non-invitee (`src/lib/portal/bids/checks.ts`, INVITED), and the counter's
      `recordSale` applies the same test. So a non-invitee cannot hold a live sale, and SR-10 already refuses a bidder with none.
    - The door's invitee refusal therefore removes no bid that the method's `unpurchasedBidConsequence` would have reported to the Board.
    - Its words must be the true reason. The live-sale part of the door test is the 17c function (`saleStands`), not
      `saleFinding` read as LIVE_SALE. The opening still judges `saleFinding` as defence in depth.

20n. **The ADR's untaken question: the passphrase at every download. Confirmed.**
    - Caching an unwrapped officer key between requests means keeping it in server memory across requests (wider S6, and wrong across
      instances) or sending it to the browser. Either breaks D3's "one request".
    - A later download of several files in one request, under one passphrase, is compatible with this ruling. A cached key is not.

20o. **The pin `submissionChannel` (PAPER | ONLINE) and the three-state switch (unset | DEMONSTRATION | LIVE): confirmed, with
    additions.**
    - The pin follows G1 and 12e: pinned at creation, taken only while unset, frozen at publication, existing exercises backfilled PAPER.
      An unset pin refuses publication in words.
    - The switch is configuration on the two-person path (G2). Unset refuses in words.
    - **LIVE requires**, in addition to the review reference, the SK002/SK003 amendment reference and a configured scanner, **a reference
      for the customer's written acceptance of the honest limits** (threat model §G must-have 6, including 20a). That is a recordable fact
      per organisation, like the other two.
    - Must-haves 4 (the public-copy database role) and 5 (core dumps, swap, HTTPS, body logging) are deployment facts the portal cannot
      verify. The switch screen lists them as "not checked by the portal", so issuing LIVE never reads as "every condition met".
    - Under LIVE, a scanner that is unavailable or fails at upload refuses the file in words. NOT_SCANNED is recorded only under
      DEMONSTRATION (NFR-SEC-007).

20p. **What ADR 0036 must change to match.** The ADR is the solution-architect's to edit; these rulings change nothing in it directly.
    - D1: freeze the mode at publication beside the channel (20i). Add the acceptance reference to LIVE, and the "not checked by the portal"
      list (20o). Under LIVE, a scan failure refuses (20o; also D6).
    - D7, late bids: "until the main opening is started", with the online `openingStarted` named (20b). `submitFaults` takes the start, not
      `unsealedAt`.
    - D7, alternatives: no main bid needed. A not-permitted alternative is recorded and marked Not Considered. Publish refuses ONLINE while
      alternatives are not stated (20h). Drop `ALTERNATIVES_NOT_PERMITTED` and `NO_MAIN_BID` from `SubmitFault`, and add a fault for a named
      parent that is not the supplier's own live bid. A withdrawal clears a kept alternative's link. The row's current parent is the one the
      opening uses, and the manifest holds the parent at submission (20h).
    - D8: the door uses `saleStands` for the sale, and the invitee check is described as matching the purchase's (20m).
    - D9: replace "accept" for identity with the recorded FR-BID-001 gap, the scan pinning the plain identity columns, and the review
      question (20a).
    - D11, re-key: shred every share of the retired key in the same transaction. Refuse it after the closing. Re-lodge the same estimate
      version by the lodging officer's act (20g).
    - D11, re-key after publication: `publishedKeyFingerprint` is frozen, and every upload checks the live key against it (threat S10). The
      ADR must re-freeze the fingerprint as a recorded publication change, shown on the opportunity with its history. Otherwise a re-key
      after publication refuses every upload for ever (ruling 13).
    - D11, "their suppliers are told": no notice can be sent (threat S18). This becomes words on the supplier's own submit page, saying
      that their draft parts were discarded because the key changed.
    - D11, a lost share after a submission: re-tender stands. Re-key-and-resubmit is listed only as a recovery option for the review and the
      founder (20f).
    - D13: limits are three layers, per account, per supplier per exercise and deployment concurrency, with the BUSY words (20e).
    - D10: the officer screens say that every named officer is needed (20k).
    - Receipt words: never "signed" or "proof" (20j).
    - "Open for the product owner": each question points to its ruling here. The build plan's step 21 says "Q1 to Q10" and should say Q1 to
      Q12.

20q. **What the wave 3b build plan must change to match.** Step 3 writes the plan's contracts verbatim, so the plan
    (`docs/notes/plans/wave-3b-build-plan.md`) changes with the ADR, before step 3:
    - **§1.2:**
      - `SubmitFault` loses `ALTERNATIVES_NOT_PERMITTED` and `NO_MAIN_BID`, and gains the parent fault (20h);
      - `LATE_CLOSED`'s comment reads "ends when the main opening is started" (20b).
    - **§1.3:**
      - `submitFaults` takes the main opening's start in place of `unsealedAt` (20b);
      - `liveIssueFaults` gains the acceptance reference (20o);
      - `rekeyFaults` gains the closing (20g);
      - `publishSealingFaults` gains `alternativesPermitted` (20h).
    - **§1.4:**
      - `BidSealingPolicy` gains the acceptance reference and its date (20o);
      - `SourcingExercise` gains the frozen mode beside `submissionChannel` (20i);
      - the share shred is allowed on a re-key as well as on substitution, so the `ExerciseKeyShare` comment changes (20g);
      - the trigger lets `OnlineBid.parentOnlineBidId` move only by a replace or a withdrawal (20h).
    - **Step 7:** "LIVE cannot be issued with a reference missing" covers the three references, and the "not checked by the portal" list is
      shown (20o).
    - **Step 8:** a re-key after publication re-freezes the published fingerprint as a recorded change, shreds the retired key's shares and
      is refused after the closing (20g, 20p).
    - **Step 10's done-when:**
      - "a late bid after the unseal is refused" becomes "after the main opening is started";
      - "an alternative is refused where `alternativesPermitted` is not true" becomes "is recorded and marked Not Considered where it is
        false";
      - add: a named parent that is not the supplier's own live bid is refused.
    - **Step 16:** re-lodging is of the same version, by the lodging officer's act (20g).
    - **Step 21:** "Q1 to Q10" becomes "Q1 to Q12".
    - **§4:** Q1, Q3 and Q6 are ruled. Q6 and k-of-m are referred to the founder with the outside review (20f, 20k).

These rule on ADR 0036's Q13–Q18 (product owner, for the founder, 2026-10-13). Each confirms the stated default: Q13, Q14, Q15, Q17 and
Q18 with conditions or a change, and Q16 with required words. Where a ruling changes the ADR, the build plan or the threat model, the list is in 20x. Those changes land before step 3 of the
build plan, on the same terms as 20p and 20q.

20r. **Q13, the 17b reversal and "the buyer holds no bid" (H1): the default is confirmed. Before the opening the reversal reads no bid, in
    either channel. A reversed buyer's sealed bid stands, and the opening judges it.**
    - **This is 17b's own reading, not a departure from it.** 17b's "When" says "as the counter's void (`WINDOW_CLOSED`, `ENVELOPE_HELD`)".
      Before the opening `ENVELOPE_HELD` reads no bid on either channel, because paper envelopes name no party (`voidSaleFault`). Reading
      `OnlineBid` would make the online register tell staff who has bid. That is the identity FR-BID-001 (M) and ruling 18 withhold, and threat
      S21.
    - **The review's other option is rejected:** a reversal that withdraws the bid. The Received count would drop, and that would name the
      bidder (ADR 0036 D9).
    - **What the opening does with the bid.** It judges the bid by `saleFinding`, which finds no live sale. The method's
      `unpurchasedBidConsequence` applies, and an unset consequence blocks in words where such a bid exists (`verdict.ts`). So nothing
      resolves quietly. The Board sees the bid and the finding.
    - **Conditions on the 17b reversal when it is built** (a separate fix, still a go-live condition for online selling):
      - Its screen never says or implies that the buyer holds no bid. It says, in words, that whether this buyer has bid is not shown before
        the opening. It adds that any bid stays sealed, and that the opening will judge it with no live sale under the method's rule.
      - The supplier's own purchase screen says the purchase was reversed. This is the supplier's own information. A reversed supplier can
        still withdraw its own bid before the closing.
      - The reversal joins the S21 database test: before the opening it answers the same way for every buyer, with and without online
        submissions.
    - No code path reads `OnlineBid` into the void guard or the reversal (plan step 10 already says so).

20s. **Q14, My Bids after the opening (H2 against ruling 25): confirmed, with one change. My Bids shows the opened receipt digest itself, and
    asks the supplier to compare it with the receipt it kept.**
    - **Why the change.** A server sentence "your receipt was the one opened" compares two server rows: the supplier's stored receipt digest
      and the roll. A writer who fabricated or swapped a bid can make them agree (threat S11; ADR 0036 D13, "the running server is
      trusted"). The only check the server cannot fake alone is the supplier comparing the opened digest with the receipt it printed or saved
      when it submitted. So the screen shows the digest, in full, and says what to compare it with.
    - **The four states**, in words, from the opening's start, when the roll is frozen:
      1. In the opening's list, not yet opened (between the start and the unseal). The screen shows the receipt digest in the list.
      2. The supplier's bid was opened. The screen shows the receipt digest that was opened and asks the supplier to compare it with its own
         receipt.
      3. It is in the roll as late, so it was not opened at the main opening. It is sent to the committee (FR-BID-003). If the committee
         admits it, it moves to state 2 at the supplementary opening.
      4. No receipt of the supplier's is in the roll. The screen tells the supplier to contact the organisation now, quoting its receipt. The
         organisation is named from configuration, never as a literal.
      - Replaced and withdrawn bids say they were not opened, as expected.
    - **No verdict, and no notice** (ruling 25 stands). The words are extended, not replaced: "Opened; the result follows the evaluation" stays.
      Nothing is sent to the supplier. Never "verified", "signed" or "proof" (20j).
    - The words come from one pure function, tested for each state. A component restates none of them.

20t. **Q15, after the unseal (H3 against ruling 20): option (a) with option (b) is confirmed. One officer finalises cryptographically, and
    every named officer must sign.**
    - **"Both officers" is still met.** The unseal stays n-of-n cryptographically (20k). For finalising, the founder's answer 5 is "both must
      confirm". That is a confirmation, and a signature by every named officer is exactly that.
    - **"Only the mandatory documents" is still met in the product.** SR-14's "the officers can only download these documents" governs what
      officers can do in the product. The download route enforces it: OPENING_CHECK grants only, named officers only, and a scan proves that
      FINALISE grants are read only by `finaliseOnline`.
    - **Ruling 20's other line still holds.** Declared figures are plain in the database only from finalising.
    - **Why the extra exposure is worth it.** Under n-of-n at finalising, one officer who has seen the Grand Summary prices could force a
      re-tender by "forgetting" a passphrase. That cannot be attributed, and cannot be put right. Under (a), the remaining blocker is a refusal
      to sign. That is a recorded, attributable act, as at a paper opening (S14), and a later controlled path can address it without new
      cryptography. Each officer already reads each Grand Summary price at the opening check.
    - **The residual, stated exactly.** After the unseal and before finalising, one named officer can read every opened bid's declaration and
      files, and the lodged estimate figure. To do so they need a database copy, the deployment's pepper (D4; required under LIVE, 20v) and
      their own passphrase.
      - ADR 0036 D13's honest limits say exactly this, including the pepper.
      - The customer's written acceptance (threat model §G, must-have 6) names it.
    - **The H3 window and ruling 13.** Option (b) puts the deactivation of a named officer between the unseal and finalising on the two-person
      path. Even when two people approve it, that opening can then never be finalised, because the deactivated officer cannot sign and
      substitution is refused after the closing (ruling 11).
      - The deactivation screen lists the openings it would leave unfinalisable, and says they must be re-tendered. It does this in this
        window as well as before the unseal.
      - The way out is the existing cancellation, with its authority. So the block is stated and clearable, never silent.

20u. **Q16, an ordinal on Received before the opening (against ruling 18's "sequence"): confirmed. This amends ruling 18.**
    - SR-13's done-when asks only for "the submission date and time". The sequence was ruling 18's addition. Gaps in it show staff how many
      replacements and withdrawals have happened, and when. The ordinal shows none of that.
    - **The sequence appears once the opening starts.** The supplier's own receipt and My Bids keep showing its own sequence.
    - **Words.** The column says it is the order of the bids now standing, not the receipt number, and that it can change before the closing.
      The receipt number is shown once the opening starts.
    - **What the ordinal does not hide.** Someone who watches Received over time still sees a stamp vanish and a new one appear on a replace,
      and the count drop on a withdrawal. Threat S22's "Left" column says so.
    - **Reversible:** keeping the sequence is a one-line change in `receivedView`.

20v. **Q17, the LIVE additions (against 20o): confirmed. LIVE also requires `SEALED_BIDS_LIVE_ALLOWED`, a configured pepper, and the recorded
    attestations for must-haves 4 and 5. Two conditions on the pepper.**
    - **Why.** Each addition only tightens a gate that already refuses while it is unset.
      - The deployment flag follows SEC-1 (`PAYMENT_SIMULATOR_ALLOWED`) and 20i. The deployment's guard sits beside the customer's policy.
      - The pepper answers S2: a dump alone no longer allows offline passphrase guessing.
      - Each attestation is a recorded STATED fact with who and when. It is shown as "attested, not checked by the portal", never as a
        verification (20o, the provenance pattern).
    - **Condition 1: a missing pepper is not a wrong passphrase.** Each wrap stores its `pepperId`. Where the deployment does not hold that
      pepper, the act is refused before any unwrap, with its own fault, in words. The words say this exercise was sealed under a pepper this
      deployment does not hold, and that the deployment must restore it. That refusal never counts toward the officer's passphrase lockout,
      and never says the passphrase is wrong. Otherwise a deployment fault would lock out honest officers under a false reason.
    - **Condition 2: the pepper is never rotated or removed while any exercise wrapped under it is not finalised or cancelled.** The deployment
      notes say so beside the custody and backup line. Losing it, or rotating it early, makes those exercises unopenable (D4, D11).
    - **Not changed:** a published LIVE exercise keeps its pin when the flag is later cleared (20i).

20w. **Q18, which attempts are logged (against ruling 20's "every attempt is logged"): confirmed for anonymous requests, with a bound on
    signed-in refusals too.**
    - **An anonymous refusal is not an access.** NFR-SEC-003 and FR-VND-013 log access to sealed content. A request refused before the
      session check (no session, cross-site, no form token) reached nothing sealed and names no actor. Writing it to the append-only table
      would let an anonymous flood fill it (S19). So ruling 20's "every attempt" is read as every attempt by a signed-in actor.
      - Anonymous refusals are left to the deployment's edge access log, if it keeps one (method, path, status; never a body, must-have 5).
    - **The same hole for signed-in actors.** As D10 is written, every signed-in refusal writes a row, including each per-account rate refusal.
      One signed-in account could then fill the table, and S19's "None known" would be false. The wave 3a SEC-2 precedent writes nothing for
      a 429, but sealed content is held to ruling 20. So the **first** rate refusal per account per rate window writes a `SealedAccessEvent`,
      and the rest are refused without a row. The rate counter is a throttle whose rows are deleted, not a record, so nothing claims they are
      counted. Every other signed-in refusal writes a row, as D10 says.
    - **Words.** No screen or document says "every attempt is logged" without this qualification. Where the access log is described, it says
      "every attempt by a signed-in person; where the rate limit refuses repeated attempts, the first in each window is logged".

20x. **What ADR 0036, the build plan and the threat model must change to match 20r–20w.** These rulings edit none of them. The
    solution-architect makes these changes before step 3, as with 20p and 20q.
    - **ADR 0036:**
      - Status block, "Conflicts": "(Q13–Q17)" becomes "(Q13–Q18)".
      - D9, the void guard: 17b's bid clause is read as the counter void's `ENVELOPE_HELD`, which reads no bid before the opening on either
        channel. The reversal screen says whether a buyer has bid is not shown, and the reversal joins the S21 test (20r).
      - D9, Received: the ordinal's words; the sequence from the opening's start (20u).
      - D10, My Bids: shows the opened digest and asks the supplier to compare it with its own receipt, in four states, with no verdict
        and no "verified" (20s).
      - D10, the logging bullet: the first rate refusal per account per window writes a row, and the rest write none (20w).
      - D4: a missing pepper is its own fault, refused before unwrap and not counted toward the lockout. The pepper is never rotated or
        removed while an exercise wrapped under it is open (20v).
      - D11, deactivation between the unseal and finalising: the screen lists the openings left unfinalisable and says re-tender (20t).
      - D13, honest limits: "one officer with a database copy **and the deployment's pepper**" (20t).
      - Questions: Q13–Q18 move to "Ruled", pointing to 20r–20w.
    - **Build plan:**
      - Line 18, "Open defaults": now ruled. Q13–Q18 point to 20r–20w.
      - §1.1: `unwrapKey` no longer folds the pepper mismatch into null. The caller checks the wrap's `pepperId` against the held pepper first,
        with its own fault, not counted (20v).
      - §1.3: `myBidOpenedWords` takes the supplier's state (in the list and not yet opened, opened, late in the roll, not in the roll, replaced or
        withdrawn) and returns
        words that carry the opened digest (20s). `receivedView`'s words come with it (20u).
      - Step 4's done-when: a pepper-id mismatch is told apart from a wrong passphrase and does not count (20v).
      - Step 6: the deployment notes add the pepper's no-rotation rule and the edge-log note (20v, 20w).
      - Steps 9 and 10: a rate refusal writes a `SealedAccessEvent` once per account per window, and the rest write none. Handler tests
        cover it (20w).
      - Step 11, My Bids: the four states and the opened digest (20s).
      - Step 12, Received: the ordinal's words (20u).
      - Step 17: deactivation between the unseal and finalising lists the openings left unfinalisable and says re-tender. A test covers it
        (20t).
      - Step 21: "Q1–Q12 cited as ruled (20a–20o) and Q13–Q17 as open" becomes "Q1–Q18 cited as ruled (20a–20w)".
      - §4: Q13–Q18 move to "Ruled".
    - **Threat model §G:**
      - S14: the deactivation words in the H3 window (20t).
      - S19: the rate-refusal bound (20w).
      - S20: anonymous refusals are left to the edge log (20w).
      - S21: the 17b reversal joins the test (20r).
      - S22: what the ordinal does not hide (20u).
      - Must-have 6: names the one-officer residual after the unseal (20t).
      - Must-have 7: the pepper's no-rotation rule (20v).
    - **Accepted for building** once these land. No ruling here reverses a default, so steps already planned stand.

These rule on four points raised by the review of wave 3b stage A, steps 1 to 6 (product owner, for the founder, 2026-10-13): S8 (the
pepper's end condition), S9 (the channel unset for existing organisations), the database clock, and the Malay of the supplier's words. Each
names the plan step its code belongs to. Where a ruling changes the ADR, the build plan, the threat model or the deployment notes, the list is
in 20ac, on the same terms as 20p, 20q and 20x.

20y. **S8, the pepper's end condition: restated. The pepper is kept, unchanged, until no opening of any exercise wrapped under it can still
    follow. This corrects 20v's condition 2 ("not finalised or cancelled").**
    - **Why.** A late bid admitted by its committee is opened at a supplementary opening, which starts only once the main opening is
      finalised (FR-CTE-008; `supplementaryFaults`, `MAIN_NOT_FINALISED`). That opening is n-of-n, and its own finalising needs one officer's
      passphrase (ADR 0036 D3, D10), so both need the pepper. Rotating it at the main finalise would leave an admitted late bid unopenable,
      and the award blocked for ever by `ADMITTED_UNOPENED`, with cancellation the only way out.
    - **The condition, on the exercise's own facts.** No opening can still follow when either:
      1. the exercise is cancelled; or
      2. its main opening is finalised, and every late online bid in the roll that is not withdrawn is either not admitted (its committee
         decided NOT_CARRIED), or admitted and opened at a supplementary opening that is itself finalised.
      - An admission not tabled, pending or deferred keeps the pepper. A decided admission is final, because a second matter is refused
        (`lateMatterFault`, `ALREADY_DECIDED`).
      - **An award implies case 2**, because the award gate already requires it (`lateAdmissionFault`; `openingGateFaults`,
        `ADMITTED_UNOPENED`). That holds only if step 12's envelope readers feed online late envelopes into `needsAdmission` and
        `admittedEnvelopeIds`, which step 12 must show. The award is a sign of the condition, not the condition.
    - **Why finalising is the end, not the file move.** After finalising, the mover works from `releasedDek`, which needs no passphrase and
      no pepper. A late bid that is never admitted stays sealed for ever, and nothing needs to open it.
    - **Scope.** Every exercise with any officer wrap under that pepper's id. That includes a DEMONSTRATION exercise whose officers set their
      shares while the deployment had a pepper configured. An exercise wrapped with no pepper is not affected.
    - **One pepper at a time.** The deployment holds one `SEALING_PEPPER`, so a new pepper replaces the old one. It may replace it only once no
      exercise wrapped under the old one can still be opened. The deployment notes' "may be added for new exercises" is corrected to say so.
    - **Not relaxed.** An exercise with no submission can be re-keyed under a new pepper. That is the remedy if a pepper is lost early, not a
      reason to rotate early.
    - **So the deployment can follow the rule**, the bid sealing screen lists, read only, the exercises that still need the pepper this
      deployment holds. The list comes from one pure function with its tests. A rule the operator cannot check is not honest.
    - **Code.** The deployment notes change now, in the stage A fix round (step 6). The pure rule (`pepperStillNeeded`, in
      `src/lib/sealing/`) and its list on the step 7 bid sealing screen land with step 15, once the main finalise exists.

20z. **S9, the channel unset for existing organisations: option (c). The organisation's channel stays unset until it is set by the
    two-person path, and publication refuses in words until then. No migration writes it, and unset is never read as PAPER.**
    - **This is already ruled.** G1 names the submission channel: an unset setting is pinned "not set", and publication refuses in words
      until it is set. G2: unset means refuse. 20o repeats it. Migration A (`20261103000000`) follows them: every exercise is backfilled
      PAPER, and the organisation's setting ships unset.
    - **"Paper paths are untouched" holds for what it means.** Every exercise that exists is PAPER and keeps its gates, and no paper act
      changes. It never promised that a new exercise needs no setting. Its words are tightened (20ac).
    - **What it adds for an existing organisation.** Since wave 3a, `WindowPolicy.documentSaleMode` ships unset on the same row, and an
      exercise made while it is unset is refused at publication (`SALE_MODE_NOT_SET`). The wave 2b scope switches are the same.
      - For an organisation whose sale mode is still unset, nothing new: the channel is set in the same two-person change of the same row.
      - For one that has already set its sale mode, the channel is one more setting on that row, refused in words until it is set. That is
        G1's rule for every pinned mode, not a contradiction of the ADR.
    - **(a) is rejected.** A migration writing the organisation's channel would be the first migration to write a customer's policy row.
      The two sibling migrations (`20261101100000`, `20261102000000`) backfill exercise pins only, which is the present behaviour of things
      that exist. The channel for future exercises is the customer's policy choice (paper or online, with SK002/SK003 still pending). A
      migration row would be a configuration change that no one issued, shown in Configuration's History as such: the harm 12c records.
      12c's text does not allow configuration writes "through a migration backfill". It allows them only inside `demo:load` on a fresh
      database. The backfill precedent is G1's, and it covers exercise pins only.
    - **(b) is rejected.** Reading unset as PAPER quietly promotes an unset value (AGENTS.md, "gaps stay honest"; G2). It would also leave
      the exercise's pin null for ever, while every online branch keys off it.
    - **Two code changes, so the refusal is never a dead end (ruling 13):**
      - **Step 8: "Take the organisation's setting" for the channel (12e)**, on the `takeSaleMode` pattern. It is allowed only while the
        exercise's pin is unset, before publication and on an exercise not cancelled. It is refused while the organisation's own setting is
        unset, naming it. It copies the configured value only, and writes the before and after under the exercise's lock. The plan does not
        have it yet.
      - **`CHANNEL_NOT_SET`'s words say why and where**, as `SALE_MODE_NOT_SET`'s do. The organisation had not set it when the exercise was
        made. Take the organisation's setting on the exercise. If the organisation's is not set either, it is set under Configuration, on the
        window policy, by two people. The finding shows in the publication checklist, not only at the refusal. Step 8 (the words may be
        fixed now, in the stage A fix round, since `ceremony.ts` is step 5's).
    - **The demo seed: step 18 as planned**, only inside `demo:load` on a fresh database (12c). G1 decides it: an exercise is pinned when it is
      made, from its organisation, so the online demonstration exercise is made through the product's create act (12d's preference) and takes
      ONLINE from the window policy. No new demonstration exception to G1 is made.
      - The demonstration's window policy sets the channel to ONLINE, and the bid sealing mode to DEMONSTRATION. The channel is set only
        through `channelSettingFaults`, as the editor sets it, never around it.
      - The demonstration's authored exercises are pinned PAPER explicitly, never left unset, so they keep the paper paths they were
        authored with (12d).
      - Where the deployment does not allow demonstration bids at load, `channelSettingFaults` refuses ONLINE. The seed then sets the
        channel to PAPER, says in words that the online demonstration needs `SEALED_BIDS_DEMONSTRATION_ALLOWED`, and skips step 18's online
        acts.
      - If the flag is cleared later, a new demonstration exercise is refused at publication in words (`ONLINE_NOT_ALLOWED`). That is
        clearable, by the flag or by a two-person change of the channel (ruling 13).
      - On an already-loaded database the seed writes no configuration, and names the settings that are not set.
    - **Hand-over.** The founder's database `perolehan` is loaded, so nothing is written there. Read on 2026-10-13: its one window policy
      (`demo_wp1`) has both `documentSaleMode` and `submissionChannel` unset. Once he has a second account, he sets both in one two-person
      change of the window policy. Until then, a new exercise there is refused at publication, in words, for each.

20aa. **The database clock: `clock_timestamp()`, the moment of the act. Confirmed, with conditions.**
    - **Why.** `now()` is the start of the transaction. In a transaction held open, the trigger's bound and a stamp read inside it both sit
      at the transaction's start, so the skew measures nothing: a bid inserted at 12:30 could carry an 11:59 stamp. `clock_timestamp()` is
      the moment the trigger runs, so a stamp is at most `MAX_STAMP_SKEW_SECONDS` older than its own insert. That is what H2's "the trigger
      owns the stamp" and FR-BID-002's "the server's clock" require.
    - **Conditions:**
      - `sealed_clock()` reads `clock_timestamp()` and is declared VOLATILE. STABLE would misstate it. Each trigger reads it once into its
        own variable, as trigger 1 does, so both bounds come from one reading.
      - Every judgement against the closing on the sealed tables reads it: trigger 1 (the stamp), trigger 2 (a replace, and a withdrawal's
        `statusAt`), trigger 7 (a key retired after the closing), and trigger 8 (`LODGEMENT_CLOSED`). A database test pins it on the live
        definitions, not on the migration files (the applied file keeps its `now()`): `sealed_clock` is volatile (`provolatile = 'v'`), and no
        sealed trigger function's source contains `now()`, `CURRENT_TIMESTAMP` or `transaction_timestamp()`.
      - **A new migration replaces the function.** `20261103110000` has been applied (log, step 2), and an applied migration is not edited
        (log 2089).
      - The application's own stamp (step 10) is `SELECT date_trunc('second', clock_timestamp())`, in its own statement, before the password
        check. `startOpening`'s `SKEW_NOT_ELAPSED` reads the same clock (step 13).
      - **The lock-wait edge.** A submit whose transaction waits on the exercise's locks for longer than the skew is now refused (PA010),
        where under `now()` it would have stood. The skew is not widened. The refusal is caught and said in words: the bid was not taken;
        submit again; the new stamp decides whether it is late. It writes a `SealedAccessEvent`, and it counts toward no lockout. The act's
        transaction holds the locks only for its own small writes, so this is rare.
    - **Code.** The new migration and its trigger test belong to the stage A fix round (step 2): a stamp older than the skew at the moment
      of insert is refused, even when it is within the skew of the transaction's start. Step 10: the stamp statement, and a handler test of
      the stale-stamp refusal in words. Step 13: the start reads the same clock.

20ab. **The supplier receipt, My Bids and Received words in Malay: confirmed, in both languages, through the existing `Words`. The Malay is
    reviewed on the customer's side before LIVE, inside the NFR-LNG-001 go-live condition. It is not a new LIVE gate.**
    - **Why.** NFR-LNG-001 (M) covers every label and message. The supplier portal's words already carry both languages (`portal/labels.ts`,
      and the routes' `messageMs`). The 2026-10-09 ruling (log 1936) says new words beside the bilingual tables keep both languages, and no
      second pattern. Plan §1.3's English-only declarations were the plan's slip.
    - **Conditions:**
      - Use `Words` and `w()` from `@/lib/contract/labels`, as `portal/labels.ts` does. No new `{ en, ms }` type.
      - Plan §1.3's declarations change to match, because step 3 wrote them verbatim. `RECEIPT_WORDS` becomes `{ title: Words; meaning: Words }`.
        `RECEIVED_WORDS` becomes `{ ordinalLabel: Words; ordinalNote: Words; sequenceLabel: Words }`. `myBidOpenedWords` returns
        `{ headline: Words; detail: Words; digest: string | null }`.
      - `RECEIVED_WORDS` is read on a staff screen. It carries both languages too, which is what the layer will need. The screen renders the
        language its siblings render until the NFR-LNG-001 programme.
      - **The scans cover the Malay.** Step 5's words scan and step 19's scan for "signed", "proof" and "verified" also look for the Malay:
        at least `tandatangan` (covering "ditandatangani"), `bukti`, `disahkan`, `mengesahkan` and `pengesahan`. Otherwise 20j and 20s are
        only half enforced.
      - The Malay says no more than the English: the same facts and the same limits. The organisation is named from configuration in both.
        The digest is never translated, and is shown in full in both.
    - **Customer review.** It is not needed for the build or for DEMONSTRATION. Before LIVE, yes, through the existing go-live condition:
      NFR-LNG-001 is already one (backlog; log 1936), and the product may not go live until it is met. The sealed-bid supplier words are
      named in that pass, in both languages, for review by the customer, whose working forms are in Malay and whose SK002/SK003 amendment
      adopts what a receipt means. No new LIVE column, and no new `liveIssueFaults` fault.
    - **Code.** The stage A fix round (steps 3 and 5): the types, the Malay, and the Malay in the scan. Step 19: the cross-cutting scan
      covers the Malay.

20ac. **What ADR 0036, the build plan, the threat model and the deployment notes must change to match 20y–20ab.** These rulings edit none of
    them. The solution-architect makes the ADR, plan and threat-model changes. The stage A fix round makes the deployment notes change.
    - **ADR 0036:**
      - D4, the pepper bullet: 20y's condition, with its two cases, and the one-pepper replacement.
      - D5, the trigger bullet: `clock_timestamp()`, the moment of the act, not `now()` (20aa).
      - D1, the demo bullet: the channel is set through `channelSettingFaults`; the authored exercises are pinned PAPER; where the flag is
        missing at load, the channel is PAPER and the online acts are skipped, in words (20z).
      - Consequences, "Paper paths are untouched": every exercise that exists is PAPER and keeps its gates, and no paper act changes. A new
        exercise takes the organisation's channel as it takes the sale mode, and publication refuses in words while it is unset (20z).
      - Questions: S8, S9, the clock and the Malay point to 20y–20ab.
    - **Build plan:**
      - §1.3: the three words declarations as `Words` (20ab).
      - §1.4, triggers 1 and 2: `clock_timestamp()` in place of `now()`; step 2 gains the database test of the live definitions (20aa).
      - Step 6: the pepper line reads as 20y.
      - Step 8: the take-the-channel act and the `CHANNEL_NOT_SET` words. Done when: an exercise made while the organisation's channel is
        unset is refused at publication in words; it takes the setting once the setting is issued; the take is refused after publication and
        on a cancelled exercise (20z).
      - Step 10: the stamp from `clock_timestamp()`. Done when: the stale-stamp refusal is in words and counts toward no lockout (20aa).
      - Step 12's done-when: online late envelopes reach `needsAdmission` and `admittedEnvelopeIds` (20y).
      - Step 13: `SKEW_NOT_ELAPSED` reads the same clock (20aa).
      - Step 15: `pepperStillNeeded` and its read-only list on the bid sealing screen (20y).
      - Steps 5 and 19: the words scans cover the Malay (20ab).
      - Step 18: stands as planned (ONLINE under DEMONSTRATION), set through `channelSettingFaults`; the authored exercises are pinned
        PAPER; the PAPER fallback in words where the flag is missing at load (20z).
      - Step 21: the rulings cited run to 20ab, and the NFR-LNG-001 backlog row names the sealed-bid supplier words (20ab).
    - **Threat model §G:** must-have 7, and the lost-pepper residual in S2 and S14, read as 20y.
    - **Deployment notes** (`docs/notes/sealed-bids-deployment.md`, the pepper section): the third bullet reads as 20y, with the two cases,
      the one-pepper replacement and the screen's list.
    - **Accepted for building** once these land. No ruling here reverses a default.
