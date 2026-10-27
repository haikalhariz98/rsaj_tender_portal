# Phase 1 — Sukuk core: the funding source, carried from requisition to payment

**Status:** Approved, 2026-10-28. Written by the solution architect; FS-1 to FS-12 ruled by the product owner on 2026-10-27,
with amendments 14 to 17, 19 and 20 folded in below. The decision record is ADR 0046
(`docs/notes/architecture/0046-funding-source.md`), accepted.

**Source:** `docs/requirements/RSAJ Portal Requirements Requisition to Project Close-out.docx`. This plan uses:
- SF-01 to SF-05;
- RP-03;
- PR-04;
- the D365 configuration table's FundingSource row: "SUKUK26T1 (Sukuk Tranche 1 2026, RM100m, 5 years, 4.5%), INTERNAL, GRANT, NA".

The roadmap is `docs/notes/plans/roadmap-2026-10-27.md`, Phase 1 and founder decisions 2 and 3.

**Binding direction (founder):**
- Additive, never replacing.
- The funding source is a new record. `FundingRoute` keeps its meaning and its routing role, untouched.
- D365 is on hold, so every figure comes from the portal's own records.
- Simple; English only; desktop only; dropdowns over typing; codes never on screen.
- Values are organisation data, shipped in packs only.

## 1. What each requirement gets

| Req | Delivered by | Not delivered |
| --- | --- | --- |
| SF-01 carry the source | Picked once on the requisition. Read from there by the tender, the award and the case before signing. Held on the contract once a split is recorded. The certificate and its payment read the contract. | The D365 PO (on hold) |
| SF-02 eligibility | An eligible-category list on each source. Refused when a requisition leaves Draft, when its source is changed, and when a split is recorded. | — |
| SF-03 per-source figures | Dashboard › Use of proceeds: envelope, committed, certified, paid, unallocated | Reconciliation to D365 actuals (seam named in §8) |
| SF-04 impact data | Impact measures (Settings) and an Impact card on the project | Green or SRI report formats |
| SF-05 multi-source split | By percentage, on the project | By BQ section (priority C, deferred) |
| PR-04 requester picks the source | The requisition form's Funding source dropdown | "Pick the project": the portal has no project master before award |
| RP-03 use-of-proceeds report | The same Dashboard tab, with a per-source drill-down to projects | "Reconciled to D365 actuals" (on hold) |

## 2. Decisions (FS-1 to FS-12)

These are the product owner's to rule. Each states the default the build takes if no ruling comes.

- **FS-1. A new record, beside the route.** `FundingSource` answers where the money comes from. `FundingRoute` answers how the
  matter is procured. The two are independent:
  - no rule reads one from the other;
  - a requisition may carry both, either or neither.
- **FS-2. No `kind` column.** No rule branches on a source being sukuk (eligibility is per source and generic), and the label
  already says what it is ("Sukuk Tranche 1 2026"). A column nobody reads is a field somebody has to type. For the same reason
  there are no tranche, tenor or profit-rate columns: the label carries the tranche (amendment 17).
- **FS-3. Eligibility keys on a project category, a new short organisation list.**
  - SF-02 says "project categories", and RSAJ's own examples (land acquisition, water tank construction) are purposes, not
    contract types. A contract type (Work, Supply…) cannot express them.
  - `ClassificationTaxonomy` was considered and rejected. Its values sit on the exercise and are mapped from the contract type,
    so the requisition (where the source is picked) does not have one.
  - The requisition gets an optional **Project category** dropdown, shown only when the organisation has categories.
- **FS-4. Eligibility is three-state, as quorum is.** It is held by `FundingSource.categoriesRestricted`, which is
  `Boolean?`:
  - **Only these** (`true`): the source names its eligible categories. A requisition with this source must name one of them.
    Saving `true` with an empty list is refused, because it would block every requisition.
  - **Any category** (`false`): no category is needed and no warning is shown. This is Internal's case.
  - **Not set** (`null`): any category passes, and the requisition shows the warning "Eligibility not set for {source}". It is
    never a silent pass and never a block.
  - Nothing reads the label to decide this. Eligibility is per source.
- **FS-5. Where the source lives, and how later stages carry it. Derived first, recorded on the contract.**
  - `Requisition.fundingSourceId` (nullable) is the one place it is picked.
  - The tender, the award and the case before signing read it through `exercise.requisitionId`, which is non-null.
  - A contract's funding is resolved by `caseFunding`:
    - its own `FundingAllocation` rows where any exist;
    - otherwise the requisition's source at 100%;
    - otherwise **Not set**.
  - `issueAward` is **not** touched. Nothing is copied at award, so there is no backfill and no second writer of the contract.
- **FS-6. A recorded fact does not move.**
  - The requisition's source and category may change through a reasoned act until a contract exists under it, as the funding
    route may today (`changeFunding`).
  - Once any contract under the requisition exists and is not cancelled, a change of source, or of a category already set, is
    refused ("Change the funding on the project"). From then on the contract's split is the record.
  - **Amendment 14.** An unset category may still be recorded through the same reasoned act once a live contract exists:
    filling a gap is not moving a fact. The source stays as it is in that act.
- **FS-7. Split rules (SF-05).**
  - **Shape.** One to five sources. Each share is a percentage with at most 2 decimals, greater than 0. The shares sum to exactly
    100.00, with no source repeated. Each source must be in force and eligible for the case's category.
  - **Saving.** Saving replaces the whole split, under the contract's lock. One audit row is written with the before and the
    after (by source label) and a required reason.
  - **Lock.** The split is fixed once money is certified: any ISSUED certificate of a payable kind (`PAYABLE_KINDS`), or any
    `SupplyInvoicePayment` on the contract. The refusal reads "Funding is fixed once a payment is certified." A later change of
    split is open question Q4. No re-split machinery is designed now.
- **FS-8. The arithmetic of committed, certified and paid** (per contract, then split). The stages are disjoint by construction:
  - **Requisitions are not counted in "committed".**
    - The requirement document calls a requisition's reservation a pre-encumbrance (PR-06). The commitment is the PO raised at
      award.
    - The requisition's estimate is SULIT, and the Dashboard reads no SULIT field (DB-2, `sulit-scan.test.ts`).
    - The tab shows instead a **count** of the source's requisitions awaiting award, linked to the list.
    - This also avoids double counting a requisition that ends in several contracts (`PARTIALLY_FULFILLED`).
  - **Committed:**
    - a contract that is not CANCELLED: `contractSum` plus the nets of its issued adjustments of the contract sum. This is
      FR-PAD-003's one reading, `readIssuedAdjustments`, so an approved variation counts once its adjustment certificate is
      issued.
    - a TERMINATED contract: its certified figure plus the retention still held on its latest issued interim certificate
      (`retentionMain` + `retentionNsc` + `retentionNs` of that certificate's frozen figures); the remainder is released
      (amendment 15). When that retention cannot be read the contract refuses by name. With no issued interim certificate the
      retention held is zero. A terminated supply contract has no certified figure, so it counts its paid figure.
    - a CANCELLED contract: excluded from everything.
  - **Certified:** the sum over the contract's ISSUED certificates of a payable kind of `PAID_FIGURE`'s figure.
    - That figure is `recommended` for an interim certificate and `advanceAmount` for an advance.
    - `recommended` is already net of retention, LAD and advance recovery (`interim.ts`), so advance plus interim certificates
      do not double count.
    - Retention released through interim certificates is inside `recommended`.
    - The final certificate (`FINAL`) arrives with Phase 2 and is not counted yet.
  - **Certified for a supply contract** (payment route `DELIVERY_ORDER_INVOICE`) is **not held**.
    - Its claims carry no figure (ADR 0045 D7).
    - The source's certified figure is marked partial, with an info popover: "Supply contracts carry no certified figure. Their
      payments count under Paid."
    - Paid may therefore exceed certified on a source. That is not an error.
  - **Paid:** the sum of `FinancePayment.amount` (via its certificate) and `SupplyInvoicePayment.amount`, on the contract,
    each read at its latest `PaymentCorrection` (`CORRECTIONS` / `asCorrected`, Phase 0).
  - **A figure that cannot be read refuses by name and is never counted as nothing.** For example, an issued adjustment whose net
    is missing (`AdjustmentNetMissing`), or a certificate with no frozen figure. The source's row says "Cannot be read" and names
    the contract.
- **FS-9. The split's arithmetic, to the sen.** Each of committed, certified and paid is split separately:
  - Shares are basis points (60.00% is 6000); the amount is integer sen.
  - Each source first gets `floor(amount × bp / 10000)`.
  - The sen left over go one each to the largest fractional remainders. Ties go by source `sortOrder`, then by code.
  - So the parts always sum exactly to the whole, and the same inputs always give the same parts.
  - A negative amount is split by its magnitude and negated.
- **FS-10. Unallocated = envelope − committed.**
  - With no envelope (Internal, Grant…), unallocated is **Not set**, never zero.
  - A negative result shows the amount over, with a warning Callout ("Committed exceeds the envelope by RM…"). It is not clamped.
  - Whether SF-03's "budget" is the envelope or the sum of project budgets is open question Q2.
- **FS-11. Who reads and who writes.**
  - The Use of proceeds tab exists only for `mayReadBudget` readers, like the Budget tab (DB-3).
  - No SULIT field is read. Contract sums, issued figures and payments are not in `SULIT_FIELDS`; the estimate is not read at
    all.
  - Restricted cases a reader may not see are left out silently (`caseVisibilityWhere`), as on every Dashboard figure (§6.2).
  - Recording a split or impact figures:
    - is a record act: `staffForAct("TRANSACTION")` (no administrator account), by anyone who sees the case's contract stages;
    - writes no Person column, so it needs no act slot; the audit row names the actor.
  - The settings are configuration. They go through `stageEdit` and `defineOperations`, so the two-person switch covers them when
    it is on.
- **FS-12. Impact figures (SF-04).**
  - **Measures:** an organisation list `ImpactMeasure` (label, unit), retired rather than deleted.
  - **Values:** one value per measure per contract, `ProjectImpact.value` Decimal(18,4), not negative, editable, audited.
  - The card is hidden while the organisation has no measures.
  - No "expected" or "achieved" pair: one figure, as SF-04 asks.

## 3. Contracts (written before any implementation)

### 3.1 Schema: one additive migration, `funding_sources`

New tables, plus nullable columns on `Requisition`. No backfill, no change to any existing column's meaning, and nothing on
`FundingRoute`, `Contract` or `Certificate`.

```prisma
/// Where a matter's money comes from (ADR 0046). Not how it is procured: that is FundingRoute.
model FundingSource {
  id             String       @id @default(cuid())
  organisationId String
  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)

  /// The key the finance system knows (SUKUK26T1). Fixed once saved; never rendered.
  code   String
  nameEn String

  /// The use-of-proceeds envelope. Null: none set (Internal, Grant), which is not an envelope of zero.
  envelope      Decimal? @db.Decimal(18, 2)
  // No tranche, tenor or profit rate (amendment 17): nothing reads them; the label carries the tranche.

  /// SF-02 (FS-4). Null: not set — any category passes, with a warning. False: any category, no warning.
  /// True: only `eligibleCategoryCodes` (never empty while true; the editor refuses it).
  categoriesRestricted  Boolean?
  /// ProjectCategory codes this source may fund. Read only while `categoriesRestricted` is true.
  eligibleCategoryCodes String[]    @default([])
  eligibilityProvenance Provenance?

  governingSource String     @default("")
  provenance      Provenance @default(ASSUMED)
  notes           String     @default("")
  sortOrder       Int        @default(0)
  retiredOn       DateTime?

  requisitions Requisition[]
  allocations  FundingAllocation[]

  @@unique([organisationId, code])
  @@index([organisationId, sortOrder])
}

/// What a project is for, as eligibility reads it (SF-02). The customer's own list.
model ProjectCategory {
  id             String       @id @default(cuid())
  organisationId String
  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  code           String   // fixed once saved
  nameEn         String
  governingSource String     @default("")
  provenance      Provenance @default(ASSUMED)
  sortOrder      Int       @default(0)
  retiredOn      DateTime?
  @@unique([organisationId, code])
}

/// One source's share of a contract (SF-05). The rows of one contract are its whole split; absent: the requisition's source at 100%.
model FundingAllocation {
  id              String        @id @default(cuid())
  organisationId  String
  organisation    Organisation  @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  contractId      String
  contract        Contract      @relation(fields: [contractId], references: [id], onDelete: Restrict)
  fundingSourceId String
  fundingSource   FundingSource @relation(fields: [fundingSourceId], references: [id], onDelete: Restrict)
  /// CHECK: > 0 AND <= 100.
  sharePct        Decimal       @db.Decimal(5, 2)
  recordedAt      DateTime
  @@unique([contractId, fundingSourceId])
  @@index([fundingSourceId])
}

model ImpactMeasure {
  id             String       @id @default(cuid())
  organisationId String
  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  code           String   // fixed once saved
  nameEn         String   // "Storage added"
  unit           String   // "ML" — shown after the value
  governingSource String     @default("")
  provenance      Provenance @default(ASSUMED)
  sortOrder      Int       @default(0)
  retiredOn      DateTime?
  values         ProjectImpact[]
  @@unique([organisationId, code])
}

model ProjectImpact {
  id             String        @id @default(cuid())
  organisationId String
  organisation   Organisation  @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  contractId     String
  contract       Contract      @relation(fields: [contractId], references: [id], onDelete: Restrict)
  measureId      String
  measure        ImpactMeasure @relation(fields: [measureId], references: [id], onDelete: Restrict)
  /// CHECK: >= 0.
  value          Decimal       @db.Decimal(18, 4)
  updatedAt      DateTime      @updatedAt
  @@unique([contractId, measureId])
}

// Requisition, added:
  /// Where the money comes from (SF-01, PR-04). Optional. Not the funding route.
  fundingSourceId     String?
  fundingSource       FundingSource? @relation(fields: [fundingSourceId], references: [id], onDelete: Restrict)
  /// ProjectCategory.code (SF-02). Optional; required only by a source whose eligibility is set.
  projectCategoryCode String?
```

- **CHECKs** are written in the migration SQL:
  - `FundingSource.envelope >= 0`;
  - `FundingAllocation."sharePct" > 0 AND <= 100`;
  - `ProjectImpact.value >= 0`.
- **Back-relations** are added on `Organisation` and `Contract`.
- **Reference styles.** The source on a requisition is a foreign key, because it carries money and is Restrict-protected. The
  category is a code, like `contractTypeCode` and `siteCode`, and `eligibleCategoryCodes` follows the
  `AppointmentLetterVariant.contractTypeCodes` precedent.

### 3.2 Pure rules: `src/lib/funding/**`

```ts
// src/lib/funding/types.ts
import type { Sen } from "@/lib/money";
export interface SourceRef { id: string; code: string; label: string; sortOrder: number; envelope: Sen | null; categoriesRestricted: boolean | null; eligibleCategoryCodes: readonly string[]; retiredOn: Date | null }
/// A share in basis points: 60.00% is 6000. A split's shares sum to 10000.
export interface Share { sourceId: string; bp: number }
export type CaseFunding =
  | { state: "SPLIT"; shares: Share[] }              // the contract's own FundingAllocation rows
  | { state: "FROM_REQUISITION"; shares: [Share] }   // no rows: the requisition's source at 10000
  | { state: "NOT_SET" };
export type Eligibility = { state: "ELIGIBLE" } | { state: "UNRESTRICTED" } | { state: "NOT_SET" } | { state: "CATEGORY_MISSING" } | { state: "NOT_ELIGIBLE"; categoryCode: string };

// src/lib/funding/eligibility.ts
export function eligibilityOf(source: Pick<SourceRef, "categoriesRestricted" | "eligibleCategoryCodes">, categoryCode: string | null): Eligibility;

// src/lib/funding/split.ts
export function percentToBp(pct: string): number | null;                  // "60", "60.5", "33.33" -> bp; >2 dp, <=0 or >100 -> null
export function splitSen(amount: Sen, shares: readonly Share[], order: readonly SourceRef[]): Map<string, Sen>; // FS-9
export type SplitFault = "EMPTY" | "TOO_MANY" | "BAD_PERCENT" | "DUPLICATE_SOURCE" | "NOT_100" | "NOT_IN_FORCE" | "NOT_ELIGIBLE" | "CATEGORY_MISSING" | "LOCKED";
export function splitFaults(i: { rows: { sourceId: string; pct: string }[]; sources: readonly SourceRef[]; categoryCode: string | null; locked: boolean; on: Date }): SplitFault[];
export const MAX_SPLIT_SOURCES = 5; // a technical ceiling for the drawer, not policy

// src/lib/funding/case-funding.ts
export function caseFunding(allocations: readonly { fundingSourceId: string; sharePct: string }[], requisitionSourceId: string | null): CaseFunding;
/// FS-7's lock: money is certified on the contract.
export function splitLocked(i: { issuedPayableCertificates: number; supplyPayments: number }): boolean;

// src/lib/funding/proceeds.ts
export interface ContractMoney {
  contractId: string; label: string;              // contract number · title, for drill-down and refusals
  status: string;                                 // ContractStatus
  supplyRoute: boolean;                           // paymentRoute === DELIVERY_ORDER_INVOICE
  contractSum: Sen;
  adjustments: IssuedAdjustmentsRead;             // from readIssuedAdjustments (src/lib/adjustment/ppjhk.ts)
  certified: { ok: true; sen: Sen } | { ok: false; certificate: string };   // via paidFigureOf
  paid: Sen;
  funding: CaseFunding;
}
export interface Figures { committed: Sen; certified: Sen; certifiedPartial: boolean; paid: Sen }
export interface SourceProceeds extends Figures { sourceId: string; envelope: Sen | null; unallocated: Sen | null; contracts: number; refused: { contractId: string; label: string }[] }
export function contractFigures(c: ContractMoney): { ok: true; figures: Figures } | { ok: false; reason: string };   // FS-8
export function proceedsBySource(sources: readonly SourceRef[], contracts: readonly ContractMoney[]): { bySource: SourceProceeds[]; notSet: Figures & { contracts: number } };
```

- **One extraction, so the paid figure is read in one place.** `paidFigureOf(kind, issueSnapshot): Sen | null` goes into
  `src/lib/payment/finance.ts`, beside `PAID_FIGURE`.
  - `finance-write.ts` and `portal/projects/workspace-store.ts` each read it inline today. Both switch to the helper, with no
    change in behaviour.
- **Requisition faults** extend `requisitionFaults` in `src/lib/requisition/fields.ts`. They block leaving Draft and are shown
  on the page:
  - `Lookups.fundingSources` and `Lookups.projectCategories` are added;
  - `RequisitionDraft.fundingSourceId` and `projectCategoryCode` are added;
  - the new faults are `{ field: "fundingSourceId"; code: "NOT_IN_FORCE" | "NOT_ELIGIBLE" }`,
    `{ field: "projectCategoryCode"; code: "NOT_IN_FORCE" | "CATEGORY_REQUIRED" }` and
    `{ field: "fundingSourceId"; code: "ELIGIBILITY_NOT_SET" }`;
  - `ELIGIBILITY_NOT_SET` is added to `WARNING_CODES`, so it is shown and never blocks.

### 3.3 Server reads: `src/lib/funding/store.ts`

```ts
export async function sourcesOf(client: Tx, organisationId: string): Promise<SourceRef[]>;
/// For headers: "Sukuk Tranche 1 2026" | "Sukuk Tranche 1 2026 60% · Internal 40%" | null (Not set).
export async function fundingTextForRequisition(client: Tx, requisitionId: string): Promise<string | null>;
export async function fundingTextForContract(client: Tx, contractId: string): Promise<string | null>;
/// The Dashboard tab: one row per source with money or in force, plus "Not set"; hidden cases excluded.
export async function proceedsFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<ProceedsFigures>;
```

`ProceedsFigures` (exported from `src/lib/insights/store.ts` with the other tab figures) holds:
- `tab: "proceeds"`;
- `rows: SourceProceeds[]`;
- `notSet`;
- `selected` (the per-project rows when `q.source` is set: label, href, share, committed, certified, paid);
- `awaitingAward: { count, href }`.

`sulit-scan.test.ts` is extended to scan `src/lib/funding`.

### 3.4 Address and facets

- `ListFacets.source` and `FACET_KEYS` gain `source`. `parseListQuery` reads it with the same `CODE` shape, and `listHref`
  writes it.
- `facetChoices` gains `sources`, and `codeFacet`'s key union gains `"source"`.
- `facetWhere` gains **requisition:** `fundingSource: { code }`.
- **Amendment 19.** Only the Requisitions list gains the facet now (the awaiting-award link needs it). The Tenders and
  Projects facets, and their exercise and award wheres, are deferred.
- `InsightsQuery.source`, `InsightsChoices.sources` and `INSIGHTS_TABS` gain `"proceeds"`, with `TAB_FILTER.proceeds = "source"`.
  - `parseInsightsQuery` admits `proceeds` only when `c.budget` is true, as it does for `budget`.
  - `insightsHref` writes `source`.

## 4. Screens

All use `src/components/ui`. Labels only, never codes. Minimal words; explanations go behind the info popover.

1. **Settings › Contracts & payments › Funding** (`/configuration/funding`, a new folder in `SETTINGS_SECTIONS`). The page has
   `PageHeader` and `Tabs`, with three tabs.
   - **Funding sources.** A `DataList` with: Name, Envelope, Eligible categories (labels, "Any category" or "Not set"), Provenance tag, and a
     Retired chip.
     - The drawer holds: Name; Code (shown in the drawer only, fixed once saved); Envelope; Eligible categories, a dropdown of Not set / Any category / Only these, which with "Only these" shows checkboxes of
       the organisation's categories; Provenance (dropdown); Source; Notes.
     - The list also offers Retire and Restore.
   - **Project categories.** A `DataList`, a drawer (Name, Code, Provenance), and Retire.
   - **Impact measures.** A `DataList`, a drawer (Name, Unit, Code, Provenance), and Retire.
2. **Requisition form** (`requisition-form.tsx`):
   - a **Funding source** dropdown (sources in force, plus "None"), placed under Funding route;
   - a **Project category** dropdown, shown only when the organisation has categories;
   - the warning or block from §3.2 shown inline.
3. **Requisition detail:**
   - Funding source and Project category appear as facts;
   - after Draft, a **Change funding source** drawer (source, category, reason) runs the `changeFundingSource` act. It is
     refused while approval is open and once a contract exists (FS-6).
4. **Headers.** Each gets a `PageHeader` fact, **Funding**, from the store helpers. "Not set" is muted.
   - the tender (`/sourcing/[id]`), from the requisition;
   - the case (`/projects/[id]`), keyed by award or by contract, through `fundingTextForContract` once a contract exists;
   - the certificate (`/projects/[id]/certificates/[certId]`), from its contract.
5. **Project overview › Funding card.**
   - It shows each source's label and share, and "From the requisition" when no split is recorded.
   - **Edit split** opens a drawer: rows of source dropdown and percent, Add source, a running total, and Reason.
   - When locked, the card says "Fixed once a payment is certified" and offers no button.
6. **Project overview › Impact card.** `KeyValues` show each measure as "value unit". **Edit** opens a drawer with one input per
   measure in force. The card is hidden while no measure exists.
7. **Dashboard › Use of proceeds** (tab `proceeds`, `mayReadBudget` only).
   - **Subtitle:** "To date". The year control does not apply to this tab and is not drawn.
   - **Main list:** a `DataList` with one row per source: Source, Envelope, Committed, Certified (marked partial when FS-8 says
     so), Paid, Unallocated (warning `Badge` when negative), and a last row for **Not set**.
   - A row opens `?tab=proceeds&source=CODE`. That view shows a `Meter` of committed against the envelope, and a `DataList` of
     the source's projects: Project, Share, Committed, Certified, Paid, each linking to `/projects/[id]`.
   - It also shows "{n} requisitions awaiting award", linking to `/requisitions?source=CODE&stage=approved`.
   - **Two info popovers (amendment 16):** on Certified, "Certified is net of retention held."; on Unallocated, "Unallocated
     does not include approved requisitions."
8. **List facet.** A **Funding source** dropdown on Requisitions, built with `codeFacet`. Tenders and Projects are deferred
   (amendment 19).

The build stops short of:
- per-source pages outside the Dashboard;
- an export of the tab;
- a funding column on list exports;
- search by source.

## 5. Packs and demo data

- **RSAJ pack.** A new part, `prisma/rsaj/starter-pack/funding.ts`, added to `PARTS`.
  - **FundingSource**, STATED. The requirement is "SF-01, SF-03, PR-04" and the source is "RSAJ Portal Requirements
    (2026-10-27), D365 configuration: FundingSource values".
    - `SUKUK26T1`: nameEn "Sukuk Tranche 1 2026", envelope "100000000.00".
    - `INTERNAL` "Internal", `GRANT` "Grant" and `NA` "Not applicable". No envelope (the document states none).
    - **SUKUK26T1's eligibility is not loaded:** `categoriesRestricted` stays null and `eligibleCategoryCodes` stays empty.
      The document's SUK-LAND and SUK-TANK are project groups in D365's DEV03 test environment, configured for the sukuk
      demonstration. That is not a statement of RSAJ's eligibility policy. Loading them, even as ASSUMED, would ship a test
      environment's setting as a production rule, which AGENTS.md forbids. See open question Q1.
    - **INTERNAL, GRANT and NA:** `categoriesRestricted: false` with `eligibilityProvenance: "ASSUMED"`. SF-02 limits "a
      sukuk funding source" only, so this is a reading of the document, and the tag says so. Without it, every Internal
      requisition would carry the "not set" warning for good.
  - **ImpactMeasure**, rows ASSUMED: `storage_added` "Storage added", unit "ML"; `households_served` "Households served", unit
    "households". The source is "SF-04 (the requirement's own examples)". They are labels, not thresholds, and the tag says they
    are a reading.
  - **No ProjectCategory rows.**
  - The pack plumbing:
    - `FundingSource` and `ImpactMeasure` are added to `ALLOWED_MODELS` (`src/lib/starter/plan.ts`) and to the `Models` map in
      `prisma/rsaj/starter-pack/shape.ts`;
    - `rsaj-pack.test.ts` asserts the values, the provenance per row and the citation. It also asserts that SUKUK26T1's
      eligibility is unset and that the other three are "any category", ASSUMED;
    - the pack's "data only" scan stays green.
- **Development fill** (`prisma/dev-fill.ts`), all values invented and marked as demo:
  - FundingSource `demo_fs1` "Demo Sukuk 2026", envelope RM50,000,000, restricted to `demo_pc1`;
  - `demo_fs2` "Internal", no envelope, any category;
  - ProjectCategory `demo_pc1` "Water storage" and `demo_pc2` "Office works";
  - the same two impact measures.
  - `ProjectCategory` is added to `ALLOWED_MODELS` for the fill only. The RSAJ pack test asserts the RSAJ pack writes none.
- **Demo records** (`prisma/demo-funding.ts`, `npm run demo:funding`, and the end of a full load). The writes are direct,
  audited as `DEMO_ACTOR`, and skipped where already set:
  - two demo requisitions with contracts get `demo_fs1` and `demo_pc1`;
  - one demo requisition with a contract gets `demo_fs2`;
  - one of the demo_fs1 contracts gets a split of 60% `demo_fs1` and 40% `demo_fs2` (the demo contract already holds certified
    interim certificates and a payment, so the view shows all five figures);
  - one approved requisition with no award yet gets `demo_fs1` (the "awaiting award" count);
  - two impact values on the split contract.

## 6. Build steps

One heavy builder, in order. The builder reads `node_modules/next/dist/docs/` for any Next API it touches. Every step ends with
`npm run typecheck`, `npm run lint` and the step's own tests. The full `npm test` runs at steps 4, 7 and 9, with the dev server
off.

**Step 1. Schema and contracts.**
- **Owns:**
  - `prisma/schema.prisma` (the five models, the two Requisition columns, the back-relations);
  - `prisma/migrations/<ts>_funding_sources/`, generated with `npx prisma migrate diff --from-config-datasource --to-schema
    prisma/schema.prisma --script`, then the CHECKs added by hand to the SQL. **Amendment 20:** `<ts>` sorts after the latest
    existing folder (`20261206000000_quotation_number_key`), not by today's date, and the tree is committed before this step;
  - `src/lib/funding/types.ts`.
- **Done when:** the migration applies to the dev database, and the existing migration tests and typecheck pass.
- **Tests:** a db test, `src/lib/funding/schema.db.test.ts`. It checks that the CHECKs reject a share of 0 or 100.01, a negative
  envelope and a negative impact value, and that a used source cannot be deleted (Restrict).

**Step 2. Pure rules.**
- **Owns:**
  - `src/lib/funding/{eligibility,split,case-funding,proceeds}.ts` and their `.test.ts`;
  - `paidFigureOf` in `src/lib/payment/finance.ts`, with the two callers switched.
- **Done when:** every FS-4, FS-7, FS-8, FS-9 and FS-10 rule has a test.
- **Tests:**
  - **Eligibility:** all five states. Unrestricted needs no category.
  - **`percentToBp`:** "33.33" gives 3333; "33.333", "0", "100.01" and "abc" give null.
  - **`splitSen`:** 100.01 at 50/50 gives 50.01 and 50.00 by order; 33.33/33.33/33.34 sums exactly; a single 100%; a negative
    amount; property-style sums over 200 seeded amounts.
  - **`contractFigures`:**
    - an adjustment added to the sum;
    - TERMINATED counts certified plus the retention held on its latest issued interim certificate, refusing when that
      retention cannot be read; a terminated supply contract counts paid;
    - CANCELLED is excluded;
    - a supply route gives a partial certified;
    - a missing adjustment net refuses;
    - an advance plus interim certificates are not double counted.
  - **`proceedsBySource`:** "Not set" collects contracts with no funding; unallocated is null without an envelope and negative when
    over.
  - **`paidFigureOf`:** existing finance and portal tests stay green, unchanged.

**Step 3. Settings › Funding.**
- **Owns:**
  - `src/app/configuration/funding/{page.tsx,core.ts,actions.ts,operations.ts,editors.tsx}`;
  - the registration line in `_editors/operations.ts`;
  - the `folders` and `advanced` entries in `SETTINGS_SECTIONS` (`src/lib/nav.ts`, section `contracts-payments`);
  - the entity names in `src/app/configuration/history.ts`.
- **Behaviour:**
  - saves are audited with before and after, through `stageEdit`;
  - the code is fixed once saved;
  - an eligible category must be one of the organisation's codes;
  - "Only these" with no category ticked is refused;
  - retiring a source does not touch the records that name it.
- **Done when:** the three lists save, retire and restore, and the existing scans pass: `registry-scan`, `config-nav`,
  `history-entities`, `english-only-scan` and `permission-gates`.
- **Tests:** `core.db.test.ts` (save, the code fixed, an unknown category refused, a retire audited).

**Step 4. Requisition.**
- **Owns:**
  - `src/lib/requisition/fields.ts` (+ test), `repo.ts` (`loadLookups`), and `labels.ts` (field labels and fault words);
  - `src/app/requisitions/{actions.ts,requisition-form.tsx,editors.tsx,[id]/page.tsx,page.tsx}`.
- **What changes:**
  - `createRequisition` and `editDraft` read the two fields;
  - a new act, `changeFundingSource`, mirrors `changeFunding`'s guards and adds FS-6's contract check;
  - the list gets its source facet.
- **Done when:**
  - a draft with an ineligible source cannot leave Draft;
  - an unset eligibility shows a warning and lets it leave;
  - the change is refused once a contract exists.
- **Tests:**
  - `fields.test.ts` cases;
  - `src/app/requisitions/funding-source.db.test.ts`: the change audited with its reason, refused while approval is open,
    refused with a contract; with a contract, an unset category may still be recorded while a set category and the source
    stay locked (amendment 14).
  - Run the full `npm test`.

**Step 5. Carried through the headers.**
- **Owns:**
  - `src/lib/funding/store.ts` (`sourcesOf`, `fundingTextFor*`);
  - the `PageHeader` facts in `src/app/sourcing/[id]/page.tsx`, `src/app/projects/[id]/page.tsx` (both keyings) and
    `src/app/projects/[id]/certificates/[certId]/page.tsx`.
- **Done when:** the three headers show labels and never a code, and a source-less case reads "Not set".
- **Tests:**
  - `src/lib/funding/store.db.test.ts` for the text: single source, split, from the requisition, not set.
  - A `text-snapshot` diff of the three pages, before and after, shows only the added fact.

**Step 6. Split and impact on the project.**
- **Owns:**
  - `src/app/projects/[id]/funding-actions.ts`, `funding-card.tsx` and `impact-card.tsx`;
  - their placement in the project overview, compared with the sibling cards.
- **What changes:** `recordFundingSplit` and `recordImpact`. Both are `staffForAct("TRANSACTION")`, take the contract lock, and
  respect case visibility.
- **Done when:** FS-7's rules refuse with the words in §2, and each save writes one audit row with before and after by label.
- **Tests:** `src/app/projects/funding-split.db.test.ts`:
  - the sum is not 100;
  - a duplicate source;
  - an ineligible source;
  - locked after an issued interim certificate;
  - locked after a supply payment;
  - a replace audited with its reason;
  - an impact value is upserted and audited.

**Step 7. Use of proceeds and facets.**
- **Owns:**
  - `proceedsFigures` in `src/lib/funding/store.ts`;
  - `src/lib/insights/{query,store}.ts` (the tab, `source`, `ProceedsFigures`);
  - `src/lib/list-query.ts` and `src/lib/list-facets.ts`;
  - `src/lib/insights/where.ts` (`facetWhere`);
  - `src/app/dashboard/{page.tsx,panel.tsx,view.ts}`;
  - the facet line in `src/app/requisitions/page.tsx` (Tenders and Projects deferred, amendment 19);
  - `src/lib/insights/sulit-scan.test.ts` (scan `src/lib/funding` too).
- **Done when:**
  - the tab is absent for a reader without `mayReadBudget`;
  - its figures match the pure function on a fixture;
  - a hidden case is excluded;
  - the drill-down rows sum to the source row;
  - the "awaiting award" count is built from the very where of the list it links to (`facetWhere.requisition` plus that list's
    approved stage), so the count and the list agree by construction (I-6), and `where.test.ts` holds them equal;
  - the Requisitions facet narrows its list and its export alike.
- **Tests:**
  - `src/lib/funding/proceeds.db.test.ts` (fixture: two contracts, one split, an adjustment, interim and advance certificates,
    a finance payment, a supply payment, a cancelled contract, a restricted exercise);
  - `query.test.ts` (tab gating, `source` parsing);
  - `where.test.ts` (the requisition facet where);
  - `list-query.test.ts`.
  - Run the full `npm test`.

**Step 8. Packs and demo.**
- **Owns:**
  - `prisma/rsaj/starter-pack/{funding.ts,index.ts,shape.ts}`;
  - `src/lib/starter/plan.ts` (`ALLOWED_MODELS`);
  - `src/lib/starter/rsaj-pack.test.ts`;
  - `prisma/dev-fill.ts`;
  - `prisma/demo-funding.ts`, `prisma/demo.ts` (the `funding` command and the full-load hook), and `package.json` (the
    `demo:funding` script).
- **Done when:**
  - `npm run pack -- rsaj` on an empty organisation loads the four sources and two measures;
  - the dev fill and the demo give a populated tab;
  - a second run writes nothing.
- **Tests:** `rsaj-pack.test.ts`, `rsaj-pack.db.test.ts`, `dev-fill.db.test.ts` extended.

**Step 9. Gates and siblings.**
- Run in full: `npm run lint`, `npm run typecheck` and `npm test`.
- Walk the screens:
  - Settings › Funding against Settings › Budget;
  - the project overview cards against their neighbours;
  - the Dashboard tab against the Budget tab.
- Diff the `text-snapshot` runs of every touched screen.
- **Done when:** all of the above is green and the diff shows only the added fields.

## 7. Deliberately not done

- **D365:**
  - reconciliation of these figures to D365 actuals (RP-03's "reconciled" clause);
  - the PO carrying the source (SF-01's PO hop);
  - the INT-00 master-data feed of FundingSource values.
  The seam is in §8.
- **Not built:**
  - a split by BQ section (SF-05, priority C);
  - a re-split after money is certified (Q4);
  - a forward-dated split;
  - certified figures for supply claims;
  - the final certificate and close-out figures, which come with Phase 2.
- **Policy switches not shipped:**
  - "Funding source required on a requisition" (CFO decision 1 is open; Q5);
  - eligibility checked against anything but the project category.
- **Other currencies and FX:** none. RM only, as everywhere.
- **Outside the Dashboard tab:** exports of the tab, search by source, a source column on list exports, and green or SRI report
  formats.
- **Not touched:** `FundingRoute`, `issueAward` and the certificate issue paths.

## 8. The reconciliation seam (for Phase 5, not built)

When D365 returns, a per-source comparison follows the `FinanceVariance` pattern:
- **What is compared:** `compares = "use of proceeds: committed | paid"`;
- **The key:** the source's `code` (the FundingSource value D365 knows);
- **The two figures:** `portalAmount` from `proceedsBySource`, and `financeAmount` from the adapter or typed by hand.

`FinanceVariance` is keyed by `budgetCodeCode` today, so that phase adds a nullable `fundingSourceCode` beside it. Nothing in this
phase depends on it.

## 9. Open questions for the product owner

- **Q1. SUKUK26T1's eligible categories.** Which project categories may the sukuk fund? The document's SUK-LAND and SUK-TANK are
  DEV03 test groups. Until RSAJ names them, the source's eligibility is unset and every requisition picking it shows the warning.
  If RSAJ confirms "land acquisition" and "water tank construction", they load as STATED categories plus eligibility.
- **Q2. What "budget" means in SF-03.** Is it the envelope (RM100m), or the sum of the sukuk projects' budgets (RM90m in DEV03)?
  The default is the envelope, with unallocated = envelope − committed.
- **Q3. Approved requisitions before award.** Should the tab show the reserved total of approved requisitions to SULIT-entitled
  readers? The default is no: a count and a link only (FS-8).
- **Q4. Re-splitting after money is certified.** Does RSAJ need to move a contract's remaining funding (sukuk exhausted, say)
  after payments? The default is a locked split. A yes needs a forward-dated split, applied by date, as a superseding decision.
- **Q5. Is the funding source mandatory?** CFO decision 1 is open. The default is optional. A yes ships as a requisition-controls
  switch, unset until the customer sets it.
