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
