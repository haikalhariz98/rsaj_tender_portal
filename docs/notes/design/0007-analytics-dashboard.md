# 0007 — Dashboard: the organisation-wide figures

Status: proposal by the UX lead, 2026-10-24, ruled by the product owner the same day (DB-1..DB-10, decisions log). The rulings
are carried into this note: v1 reads no SULIT field (DB-2), one predicate governs every Budget surface (DB-3), the screen is
"Dashboard" at `/dashboard` (DB-8), and Home is unchanged (DB-9). Bound by note 0005 (minimal words), English only, desktop
only (1280 to 1920 wide), light theme, the design system in `src/components/ui`.

**The founder (2026-10-24):** "maybe we have a like a power bi dashboard (create our own dashboard instead of integration with
power BI) for reporting to report on budget, pipeline, requsition and others", then "please build the dashboard with your own
suggestion. only report pending RSAJ requirements".

So the formal reports (FR-RPT-001 to -012) still wait for RSAJ. This note designs the analysis surface: figures, charts, filters
and a click through to the list.

## 1. The job to be done

- **The users** are the Head of Contracts & Procurement, department and section heads, finance, and the procurement executives
  who prepare management papers. They come once or twice a week, and the day before a management meeting.
- **The questions:**
  - How much budget is gone?
  - What is in the pipeline, and where is it stuck?
  - How many requisitions came in, and how fast were they approved?
  - What did we award and pay this year?
- **What goes wrong today:** Home answers "what is waiting on me" and three pipeline counts, and nothing else. To get a
  department's figure, someone opens each list, counts by eye and builds a chart in Excel. Those numbers then disagree with the
  lists the next morning.
- **What the Dashboard is not:**
  - **Not personal.** Home's "Needs you" stays the place for one's own work.
  - **Not a report pack.** It has no fixed layouts, no Board export and no compliance findings. Those are FR-RPT's, and RSAJ has
    not specified them.

## 2. Recommendation

- **The product:** one new staff screen, **Dashboard**, at `/dashboard` (DB-8). It is five tabs of read-only figures over the
  records the reader can already open. Its code stays in `src/lib/insights/**` (the module's name, not a screen's word).
- **Each tab** has one filter bar, a row of at most six figure tiles and two or three charts.
- **Every tile and every bar is a way into a list.** It is a link to the list that holds those records, or to the tab that
  explains the figure. A figure you cannot open is a figure nobody trusts.
- **Where it lives:** the sidebar's Work group, second item: Home · **Dashboard** · My approvals · Inbox. It uses the `chart`
  icon already in `ICONS`.
  - It is not a new group. It is one destination, and it is not a process step (object-centric rule).
  - The name is "Dashboard", the founder's word (DB-8). Home no longer uses it on screen; `Dashboard()` in `src/app/page.tsx`
    and `src/lib/dashboard.ts` are code names and stay. "Reports" stays free for FR-RPT.
- **Who sees it:** every staff member, with no new permission (DB-1).
  - Every count is one the reader could reach by opening the lists, under the same visibility rules. Restricted exercises are
    left out (FR-MTD-007), and so are restricted cases before issue (AC-18).
  - **v1 reads no SULIT field** (DB-2, §6). There are no estimated-value tiles and no count/value switch.
  - The Budget tab, the Overview's "Budget used" tile and the Budget page itself follow one predicate (§6.3, DB-3).
  - Suppliers never see it.
- **Home is unchanged** (DB-9). It gains no link; step I-5 is dropped. The two screens split the work:
  - Home: "Needs you", what happened, sittings coming up;
  - Dashboard: totals, trends and breakdowns.

## 3. What good products show first (benchmark, 2026-10-24)

| Product | What leads | What we borrow |
| --- | --- | --- |
| Procurify Spend Insights | Budget against actual, with committed spend beside the allocation, by department and account code, year to date. Every figure drills to the orders behind it. It has a separate permission ("View budget insights"). | Budget tab: allocated, committed and spent side by side, by department, with drill-down. |
| Generic procurement KPI guides (Coupa's own tile set was **not** confirmed: its documentation was not found) | Spend under management, and cycle time from requisition to order. Visuals are a stage funnel and a cycle-time trend. | The pipeline funnel and median days to approval. We do not borrow spend under management: there are no off-system purchases in our data to measure against. |
| Power BI procurement templates (ZoomCharts samples) | An executive overview page, then a supplier and spend page and an operations page. KPI cards across the top, slicers for year and department, ranked bars for top suppliers. | The page shape: tiles, then charts, under one filter bar, with tabs per subject. We do not borrow savings or maverick spend (§10). |

What every one of them leads with is **money against budget, the stage funnel and time to approve.** Those lead here too.

## 4. The screen

```
PageHeader  "Dashboard"  (info popover: "Figures across the organisation. Open any figure to see its records.")
            meta: "FY 2026 · 1 Jan–31 Dec 2026" · "As at 24 Oct 2026"
Tabs        Overview · Budget · Requisitions · Tenders & quotations · Projects & payments
Filter bar  [Year ▾] [Department ▾] [+ one per tab: Funding route ▾ | Method ▾]   Reset
Tiles       up to 6 Stat tiles, one row (3 + 3 under 1440 px)
Charts      2-column grid of Cards; each chart: CardHeader title + "Table" toggle, CardBody chart
```

- **The tabs** are links to `?tab=<id>`, using `Tabs` (`src/components/tabs.tsx`) with a server-rendered panel. Only the selected
  tab's queries run.
- **The filters** are a `next/form` GET, the pattern step 7 uses. They are kept in the address, so a view can be shared and
  survives a refresh: `/dashboard?tab=requisitions&year=2026&unit=<code>&route=<code>`.
  - A pure `parseInsightsQuery` drops any value that is not a known year, unit, route or method. A bad address shows the
    defaults and never an error. A filter that does not apply to the tab is dropped too, so it can never narrow a figure
    unseen.
  - Each control is a `Select` of labels, never codes.
  - Filters that do not apply to a tab are not drawn.
  - Reset links to `/dashboard?tab=<tab>`.
- **The financial year** is the `BudgetPeriod` rows of the chosen year: from the earliest `startsOn` to the latest `endsOn`,
  which is exclusive as every period's is (a record dated on it belongs to the next year). Month slots run from the range's
  first month to its last, so a July-start year runs July to June.
  - The default is `defaultYear(periods)`, the open year, which is what Budget shows.
  - **No periods set:** the Year control reads "Financial year not set". Year-bound tiles show an empty state that links to
    Settings · Budget periods (§7).
  - The calendar year is never quietly assumed (the three-state rule). Snapshot tiles ("now") still show.
- **Days and months** are the organisation's days (`organisationTimeZone`, `organisationDay`).
  - A day column (`raisedOn`, `paidOn`) is read as stored (`storedDay`); an instant (`issuedAt`, `closedAt`) is read in the
    organisation's zone (`dayIn`), so an award issued at 31 Dec 20:00 UTC is a 1 January award in Kuala Lumpur.
  - **Time zone unset:** UTC is used and the header meta says "(UTC: time zone not set)", as Budget does.
- **Department** means the requesting unit, `requestingUnitCode`, flat, with no roll-up of sections (DB-10), followed down
  the case:
  - an exercise's department is its requisition's;
  - an award's, contract's and payment's department is its exercise's requisition's;
  - a budget code's department is its `owningUnitCode`;
  - records with none are grouped as "No department", and that group is never dropped.
  - **One unit list feeds the filter for every tab** (`departmentUnits`): the units of kind Department, as the requisition
    form offers them for "Requesting department". A test holds the budget codes' filter and the requisitions' filter to the
    same list.
  - **Known gap:** the budget code editor lets a code be owned by any unit (a section or a division too). Such a code shows
    under its own unit's name in the by-department chart but no Department filter reaches it, since there is no roll-up. If
    RSAJ owns budgets at section level, that is the roll-up switch DB-10 already defers.
  - Unit labels come from every unit, retired ones included, so an old record never shows a code.
- **Tile labels say their time basis:** "Raised in FY 2026" or "Open now". A snapshot tile ignores the Year filter and says
  so by its label; there is no separate disclaimer.
- **Money is compact** (`formatCompactRM`) on tiles and axes. It is exact in the chart's table and in the bar's `<title>`
  tooltip.

## 5. The tabs

**Drill-down v1 against v2.** Until step 7 lands and the lists take filters (step I-6, DB-4), a tile or bar links only where a
list view holds exactly the same records. Anything else opens its chart's table instead. The rule is that the count on a tile
equals the count on the list it opens. A test holds each linked pair to it.

### 5.1 Overview

Its job is the one-glance answer for a management meeting. It has a Year filter and a Department filter.

| Tile | Definition | Opens |
| --- | --- | --- |
| Budget used now | The Budget screen's header figure: `totalsAcross(all codes, movements, organisation's today).utilisation`. The Year filter does not change it (§5.2). The hint is "RM x of RM y". "No allocation" where null, never 0 %. Drawn only for a reader who passes the Budget predicate (§6.3); for anyone else the row closes up. | Budget tab |
| Requisitions raised in FY | The count of `Requisition` with `raisedOn` in the FY and `status ≠ DRAFT`. | Requisitions tab |
| Open tenders now | The count of `SourcingExercise` matching `SOURCING_PIPELINE_WHERE` and `exerciseNotHidden`: Home's Sourcing card. | Tenders tab |
| Awarded in FY | The Σ of `Award.awardedValue` for awards with status `ISSUED` or `ACCEPTED` and `issuedAt` in the FY, under `caseVisibilityWhere`. The hint is the count. | Tenders tab |
| Paid in FY | The Σ of `FinancePayment.amount` with `paidOn` in the FY, on a visible case. | Projects tab |
| Approvals waiting now | The count of open approval steps, read as `/approvals` reads them (`officeQueue`, `approvalRouteNotHidden`). The hint is "oldest N days", using `oldestWaitingDays`. This tile ignores the Department filter, and its hint says "All departments". | `/approvals` |

Charts:

1. **Pipeline now:** horizontal stage bars in the case's order.
   - The stages are: With C&P (`REQUISITION_PIPELINE`), Preparing, In market, Evaluating (`EXERCISE_PHASE`), Awarding,
     Signing and On site (`casePipelineWhere`).
   - The bars are counts. **Their totals equal Home's three cards, by test.**
   - Links: Awarding, Signing and On site go to the `/projects` stage views now. The other bars, With C&P included (it spans
     eight statuses and no requisitions view matches it), link once I-6 lands.
2. **Money through the year:** monthly columns, two series: awarded (by `issuedAt`) and paid (by `paidOn`). It is not
   cumulative. The table gives month, awarded and paid.

### 5.2 Budget

Its job is "how much is gone, and where". It has a Year filter and a Department filter (`owningUnitCode`). It is drawn only for
a reader who passes the Budget predicate (§6.3, DB-3).

The Budget screen's Availability tab already draws these figures (`availability-panel.tsx`, `src/lib/budget/analysis.ts`), so
this tab **reuses its functions, not its rule in words**: the tiles are `figuresFor` over **all** codes as at the organisation's
today (the screen's rule, checked in the code on 2026-10-24); the **Year filter drives only the through-the-year chart**, as the
screen's `?year=` does. A test holds the two screens' figures equal (I-3).

| Tile | Definition |
| --- | --- |
| Allocated | `totalsAcross(...).allocated`: original, plus revisions, plus transfers in, less transfers out. |
| Committed | `.committed`: commitments not released by today. |
| Spent | `.actualSpend`. |
| Available | `.available`. A negative figure is shown in the `err` tone and never clamped. |
| Used | `.utilisation` against `BudgetSettings`' warning threshold, through `thresholdState`. At or over is shown in `warn`. Not set is neutral, with "Threshold not set" in the info popover. |
| Codes at or over warning | The count of codes whose `thresholdState` is `AT_OR_OVER`. "Threshold not set" where `NOT_SET`, never 0. |

- **Every tile** opens `/configuration/budget?tab=availability&year=<FY>`.

Charts:

1. **By department:** stacked horizontal bars of spent, committed and available, one bar per department, largest allocation
   first. The data is `utilisationByUnit(codes, movements, today)`, the screen's own.
2. **Used through the year:** `spendByPeriod(the FY's periods, codes, movements)`, the screen's own: a line of cumulative
   spent plus committed at each period's end, against the cumulative allocation. It shows the burn rate without a forecast.
3. **Most used codes:** the top 10 codes by `utilisation`, as bars with the warning threshold drawn as a tick where it is set.
   Each label reads "code · description".

### 5.3 Requisitions

Its job is how many came in and how fast they were approved. It has Year, Department and Funding route filters.

| Tile | Definition | Opens (v1) |
| --- | --- | --- |
| Raised in FY | As on Overview. | (I-6) |
| Approved in FY | Of those, the ones with an `ApprovalInstance` of `matterKind REQUISITION` and `status APPROVED`. | (I-6) |
| Waiting for approval now | `status = PENDING_APPROVAL` (snapshot). | `/requisitions?view=pending` |
| Over budget now | `status = OVER_BUDGET` (snapshot). | `/requisitions?view=over` |
| Median days to approval | For the approved instances with `closedAt` in the FY: the median of the organisation days between `raisedOn` and `closedAt`, in calendar days. The hint is "across N". No tone is applied, because no target is configured (ruling R5). | chart table |

There is no estimated-value tile: the estimate is SULIT and v1 reads no SULIT field (DB-2, §6). Five tiles.

Charts:

1. **Raised and approved by month:** columns, two series. Raised is counted by `raisedOn`, approved by the instance's `closedAt`.
2. **By department:** horizontal bars of counts. There is no value measure (DB-2).
3. **By funding route:** horizontal bars of counts. Labels come from `FundingRoute.nameEn`, and records with none are grouped
   as "No funding route".

### 5.4 Tenders & quotations

Its job is what is out to market and what it produced. It has Year, Department and Method filters.

| Tile | Definition |
| --- | --- |
| Open now | Home's Sourcing card: `SOURCING_PIPELINE_WHERE` and `exerciseNotHidden`. |
| Preparing | The exercises among them in `EXERCISE_PHASE` `PREPARING`. |
| In market | The same, for `IN_MARKET`. |
| Evaluating | The same, for `EVALUATING`. |
| Awarded in FY | As on Overview. The hint is the count. |

There is no estimated-value tile: an open exercise's estimate is SULIT and v1 reads no SULIT field (DB-2, §6). Five tiles.
The awarded value is not SULIT (§6.1).

Charts:

1. **Open by method:** horizontal bars per `SourcingMethod.nameEn`, stacked by phase.
2. **Awarded by month:** columns of value, with the count in the tooltip.
3. **Awarded by method:** horizontal bars of value, for awards issued in the FY.

None of these tiles has an exact list view in v1. The tab's tiles link once I-6 adds `stage` and `method` to `/sourcing`.

### 5.5 Projects & payments

Its job is what is on site, what is paid, and what is owed. It has Year and Department filters.

| Tile | Definition | Opens (v1) |
| --- | --- | --- |
| Live projects now | Awarding, Signing and On site, through `casePipelineWhere`: Home's Contracts card. | (I-6) |
| On site now | The `ON_SITE` stage. | `/projects?view=on_site` |
| Contract value on site | The Σ of `Contract.contractSum` for the on-site cases. Its info popover says "Original sums. Variations are not added." | `/projects?view=on_site` |
| Paid in FY | As on Overview. | chart table |
| Waiting for payment now | The count of `Certificate` with `status ISSUED`, `kind` `INTERIM_PAYMENT` or `ADVANCE_PAYMENT`, and no `financePayment`. The hint is "oldest N days", from `issuedAt`. The kinds are the ones the supplier workspace treats as payable. | (I-6) |
| Variations open now | The count of `Variation` with `status SUBMITTED` or `SUPPORTED`. The hint is the Σ of `estimate`. | (I-6) |

Charts:

1. **Paid by month:** columns.
2. **Projects by stage:** horizontal bars for Awarding, Signing, On site, Completed and Closed. **Every bar links now** to its
   `/projects?view=` stage view, and its count is held equal to that view's count by test.
3. **Top suppliers by awarded value:** the top 10 for the FY, from live awards. The name is `vendor.registeredName`, or else
   `awardeeName`. A bar links to `/suppliers/<vendorId>` where the award is linked to the register, and does not link otherwise.

## 6. SULIT and visibility

### 6.1 Which figures are SULIT (checked against `SULIT_FIELDS`, `src/lib/sulit-fields.ts`)

**v1 reads no SULIT field** (DB-2). A source scan holds every file under `src/lib/insights/**` to naming no field of the
registry at all (I-1), with a planted control so the scan cannot pass empty.

| Figure | Field | In the registry? | On the Dashboard |
| --- | --- | --- | --- |
| Estimated value (requisition, exercise) | `estimatedValue` | **Yes** (scope requisition, also exercise) | **Not read in v1.** No tile, no chart, no count/value switch. |
| Awarded value | `Award.awardedValue` | No. The supplier portal's Results publishes it. | Shown. |
| Contract sum | `Contract.contractSum` | No. | Shown. |
| Paid | `FinancePayment.amount` | No. | Shown. |
| Variation estimate | `Variation.estimate` | No. | Shown. |
| Budget code totals | the movement ledger | No. A code's committed figure is made from requisition estimates (`committedEstimate` is SULIT in its audit row). | §6.3, DB-3. |
| Savings, scores, performance %, company estimate, opening and corrected prices | the evaluation's and the opening's figures | Yes | **Never read.** Held by the same scan. |

### 6.2 Restricted records, and why no total is withheld

- **Restricted exercises,** and restricted cases before issue, are **left out of every count and sum, silently.** This is what
  Home and every list do. A note saying "3 hidden" would tell the reader that restricted exercises exist, which FR-MTD-007
  forbids ("neither shown nor counted").
- **No figure on the Dashboard is SULIT,** so no tile is ever "Withheld" and no access event is written. Every figure is the
  same for every reader who may open the same lists.
- **Kept on file for v2 (DB-2):** if a SULIT total is ever wanted, the design is per-record gates in list mode
  (`sulitGates(..., { list: true })`) for holders of `sulit.read.organisation`, a sum over the granted ids only with "n
  withheld", and the whole tile withheld for everyone else, administrators included. Per record, because a Department filter
  can narrow a total to one requisition, at which point reading the total is reading that value (NFR-AUD-004). It needs a
  new ruling before it is built.

### 6.3 Budget: one predicate for every Budget surface (DB-3)

- **Today:** `/configuration/budget` is behind Settings in the sidebar (`maySeeSettings`), but the page itself only requires a
  staff member, so anyone can open it by address.
- **The leak:** a code with one commitment shows that requisition's estimate as its committed figure.
- **The ruling:** one predicate, `mayReadBudget` (`src/lib/insights/query.ts`): the reader may see Settings
  (`maySeeSettings`) **or** holds `sulit.read.organisation`. It governs, all three together:
  1. the Dashboard's Budget tab (not drawn; a direct `?tab=budget` falls back to Overview);
  2. the Overview's "Budget used" tile (not drawn; the tile row closes up);
  3. the Budget page itself (`/configuration/budget`), which refuses a reader who fails it, as the other Settings pages do
     (step I-3).
- **For the security auditor:** administrators pass the predicate through Settings and so see committed figures, on the Budget
  page as today and on the Dashboard. Whether a committed figure is SULIT has gone to RSAJ; if it is, all three surfaces
  change together, because they share the predicate.

## 7. States

| State | What shows |
| --- | --- |
| Loading | `src/app/dashboard/loading.tsx` is a skeleton: six tile blocks and two chart cards at their final sizes, so nothing jumps. A tab change navigates, so the skeleton shows again. |
| Organisation has no records | One `EmptyState` per tab, for example "No requisitions yet" with a link to the list. It is not a row of zeros. |
| Filter matches nothing | The tiles show 0 (a real nought), and each chart says "Nothing for these filters", with a Reset link. |
| Financial year not set | Year-bound tiles and charts show "Financial year not set", with a link to Settings · Budget periods. Snapshot tiles still show. |
| Time zone not set | UTC, said once in the header meta (the Budget precedent). |
| Threshold not set | The Used tile is neutral, and the tick on Most used codes is not drawn. |
| No allocation | "No allocation", not 0 %. |
| No permission for Budget (fails `mayReadBudget`) | The tab and the Overview's Budget used tile are not drawn. A direct `?tab=budget` falls back to Overview, and does not show a refusal page. |
| A query fails | That tab's `error.tsx`: "These figures could not be loaded. Try again." It has a Retry button and keeps the filters. Other tabs are unaffected. |
| One series all zero | The chart is drawn with a flat line. It is not replaced by an empty state, because "nothing paid this year" is an answer. |

## 8. Charts

No chart library is installed (`package.json`: exceljs and pdf-lib only).

**The recommendation is hand-rolled, server-rendered SVG** in one file, `src/components/ui/chart.tsx`, with three primitives:

| Primitive | For | Notes |
| --- | --- | --- |
| `BarList` | ranked categories (department, method, route, supplier), and the stage funnel (order kept, not sorted) | Horizontal, drawn as HTML rows rather than SVG, so a row that is a link is a real link a screen reader reaches (a link inside `<svg role="img">` is hidden from it). The label sits on the left, the value on the right, the bar between is `aria-hidden`, and long labels are truncated with the full text in `title`. Up to 3 stacked segments. Each row is an `<a>` when it has an `href`. An optional threshold tick. |
| `MonthColumns` | anything by month of the FY | 1 or 2 series side by side. Every month of the year has a slot, including empty ones, so a gap reads as a gap. |
| `TrendLine` | Used through the year | One line plus an optional reference line. Periods that have not come yet are not drawn. |

- **Why hand-rolled:**
  - The charts are server components. Only finished numbers ever reach the browser, and no row does.
  - It needs no client JavaScript, and the colours come straight from the `@theme` tokens (brand indigo, slate, `warn`,
    `err`).
  - About 300 lines replace a dependency of more than 100 kB that would have needed client components and theming.
  - AGENTS.md already does icons this way.
- **What it gives up:** animation and brushing. Neither answers a question here.
- **Accessibility and exact numbers:**
  - Each chart card has a **Table** toggle (`Disclosure`) showing the same series as a `table.tsx` table, with exact figures.
  - `MonthColumns` and `TrendLine` draw an `<svg>` with `role="img"` and an `aria-label` that summarises it ("Paid by month, highest October, RM 2.1m").
- **No donut or pie charts:** a horizontal bar compares the same parts more accurately. There are no 3D charts, no dual axes
  and no legend beyond two series.

## 9. Data approach

- **Layout:**
  - `src/lib/insights/` holds the pure functions and their tests;
  - `src/lib/insights/store.ts` (server only) holds the queries;
  - the page calls the store and renders. Nothing in `src/app/dashboard` restates a rule.
- **The where-builders are shared, not copied:**
  - The Dashboard's `insightsWhere.requisitionsRaised(organisationId, filters, range)`, and its equivalents for the other records, compose with the existing
    `SOURCING_PIPELINE_WHERE`, `casePipelineWhere`, `exerciseNotHidden` and `caseVisibilityWhere`.
  - The lists' filters (I-6) call the same builders, so the count on a tile and the count on its list come from one where.
  - `organisationId` comes from the actor and is on every query. Budget movements carry none, so they are scoped through
    `budgetCode: { organisationId }`.
- **Queries:**
  - Counts and sums use Prisma `count`, `groupBy` and `aggregate`.
  - Month buckets read narrow columns (`{ raisedOn }`, `{ paidOn, amount }`, `{ issuedAt, awardedValue }`) for the FY's
    records, and bucket them in a pure `byMonth(rows, months)`, each row carrying its organisation day (`storedDay` for a day column, `dayIn` for an instant). At RSAJ's scale that is a few thousand small rows,
    held server-side only.
  - Prisma cannot group by month, and raw SQL would bypass the generated types.
  - Each tab runs 5 to 9 queries in one `Promise.all`.
- **Money** is `Decimal` to sen at the boundary (`senFromDecimal`), summed as `Sen`, and formatted last.
- **No cache across readers:** the figures depend on the reader (hidden exercises, the Budget predicate). The pages are `force-dynamic`, as
  Home is.
- **Indexes:** none up front.
  - `Requisition (organisationId, raisedOn)` and `(organisationId, status)` already exist, as do `Award (organisationId, status)`
    and `BudgetMovement (budgetCodeId, occurredOn)`.
  - The candidates are `FinancePayment (organisationId, paidOn)` and `Certificate (organisationId, status)`. Add them only if
    I-7's timing at 10× demo data fails (the ST-2 precedent: one schema step, only on a measured failure).
  - The target is one tab in under 1 s at 10× demo volume.

## 10. Not built, and why

- **A Suppliers tab.** The Suppliers list's own status counts already answer "registered, waiting, barred". Supplier analysis
  (grades, document currency) is FR-RPT-008's, and RSAJ will specify it. Top suppliers by awarded value sits on Projects.
- **Savings, win rate, mean score, best performer.** These are SULIT or evaluation information, and they are the prototype's
  `/reports` exclusions already in `DECIDED_FIELDS`.
- **Overdue and ageing judged against a target.** No target is configured (ruling R5), so waits show as plain days, with no
  tone.
- **The amount certified.** It lives in `Certificate.issueSnapshot` JSON, not a column. A sum would mean reading every issued
  certificate's snapshot. Paid (`FinancePayment`) and Waiting for payment (a count) answer the question that is actually asked.
  Add it once FR-RPT-004's contract financials exist.
- **LAD, delay and the revised contract sum.** These are per-contract computations owned by FR-RPT-004 and -006.
- **Export from the Dashboard.** Every figure opens its list, and the list exports (step 7). A second export path would be a
  second surface to review.
- **A customisable widget builder** (§11).
- **Overlap with FR-RPT:** the Pipeline (FR-RPT-002) and Spend (FR-RPT-012) charts are the same questions in rough form. When
  RSAJ specifies those reports, they reuse `src/lib/insights/**` rather than restating it.

## 11. The alternative rejected: a configurable dashboard builder

- **What it would be:** a Power BI-like canvas where each user adds, moves and configures widgets over any field.
- **Rejected because:**
  1. It turns every user into a report author. The founder asked for simple.
  2. Free choice of field and aggregate is exactly how a SULIT value ends up summed into a widget. A fixed set of figures can be
     reviewed field by field; an open builder cannot.
  3. Its cost (layout persistence, a widget schema, per-user state) buys nothing the five tabs do not answer.
- **Revisit** if RSAJ's users ask for a figure the tabs lack. The answer is then a new tile, not a builder.

## 12. Build list

Ownership:

- **Step 7 owns:** `src/lib/list-query.ts`, `src/lib/search/**`, `src/lib/ui/list-cells.ts`, `src/components/data-list.tsx`,
  `src/components/shell/topbar.tsx`, and every list `page.tsx` and `rows.ts` (Requisitions, Tenders & quotations, Projects,
  Suppliers, Committees), plus the export routes.
- **The Dashboard owns:** `src/lib/insights/**`, `src/components/ui/chart.tsx` and `src/app/dashboard/**`, one line in
  `src/lib/nav.ts`, and, for the DB-3 gate only, `src/app/configuration/budget/page.tsx`.
- **Running in parallel:** at most two builders run at once (laptop memory), and step 7 uses both in 7-b, 7-c and 7-d. So
  the Dashboard fills the free slot in **7-a** (I-1, I-2) and **7-e** (I-3). Its other steps queue behind step 7.

| Step | Files | Work | Tests | Done when |
| --- | --- | --- | --- | --- |
| **I-1** Pure core (domain-engineer) | new: `src/lib/insights/{query,year,months,where,tiles}.ts`, their tests, and `sulit-scan.test.ts` | `parseInsightsQuery`, `departmentUnits` and `mayReadBudget` (the DB-3 predicate). `financialYear(periods, year)` returns a range or `NOT_SET`. `monthSlots`, `byMonth`, `median`, `daysToApproval`. `insightsWhere.*` composing the existing pipeline and visibility filters, the organisation on every one. Tile folds over groupBy rows (the pipeline bars, groups with "No department"). | Unknown year, unit, route or method is dropped, and so is a filter the tab does not take. A year with no periods gives `NOT_SET`. A record dated on the last `endsOn` is outside the year. A July-start year has its twelve slots July to June. An award issued 31 Dec 20:00 UTC falls in January in Asia/Kuala_Lumpur. Median of an even count. A department total and "No department" add up to the total. Budget codes and requisitions draw their Department filter from the same unit list. The unfiltered pipeline wheres equal Home's, and the same groupBy rows fold to Home's three totals. **Source scan:** no file under `src/lib/insights` names any field of `SULIT_FIELDS`, with a planted control. | `npm test` passes on the insights tests; the type check as the tree allows. |
| **I-2** Charts (frontend-engineer) | new: `src/components/ui/chart.tsx`, `chart.test.ts` (the suite runs `*.test.ts` only) | `BarList` (HTML rows), `MonthColumns`, `TrendLine` (SVG), and the Table toggle (`Disclosure`, no client script). Token colours only, no `dark:`. | Twelve slots for a twelve-month FY. A negative value draws from the axis. `href` renders an `<a>`. The `aria-label` summary. The table equals the series. | Rendered on a scratch page beside `Stat` and `Card` and checked against siblings. `npm run lint` passes. |
| **I-3** Store and Budget gate (domain-engineer, security review) | new: `src/lib/insights/store.ts`, `store.db.test.ts`; `src/app/configuration/budget/page.tsx` (the gate) | The queries per tab (§5), none reading a SULIT field. The Budget predicate (§6.3) on the Budget page, the Budget tab and the Budget used tile. | `test:db`: Overview pipeline totals equal `pipelineCounts` (Home). A restricted exercise moves no count. Another organisation's rows never count. Projects-by-stage counts equal the `/projects` view counts. The Budget tab's tiles and charts equal `availability-panel.tsx`'s inputs for the same data and year. A reader who fails `mayReadBudget` is refused the Budget page. | `npm run test:db` passes. The security-auditor signs off §6. |
| **I-4** Screen (frontend-engineer) | new: `src/app/dashboard/{page,loading,error}.tsx` and `tabs/*.tsx`. `src/lib/nav.ts`: one item. `sidebar.test.ts`: one case. | PageHeader, filter bar (`next/form`), tabs, tiles (`Stat` with `href`), chart cards, the §7 states. | A snapshot of each tab's visible text. Nav order is Home, Dashboard, My approvals, Inbox. `?tab=budget` without the predicate falls back to Overview. | Text snapshot, sibling-screen check against Home and Projects, typecheck, lint and test all pass. |
| ~~I-5~~ | — | **Dropped** (DB-9): Home is unchanged. | — | — |
| **I-6** Drill-down filters (after step 7-e) | `src/lib/list-query.ts` (adds `unit`, `from`, `to`, `method`, `route` and `stage` facets), each list's `rows.ts` (calls `insightsWhere`), and each list page (removable filter chips) | Unlinked tiles and bars become links. The list shows the filter as chips ("Department: Water Supply ×"). Exports honour the facets. | For every linked tile, its count equals the list's total under the same address, as a `test:db` table over all tiles. | Every tile and bar in §5 links. |
| **I-7** Close-out (devops, ux-reviewer) | `scripts/` volume run, screenshots | Time each tab at 10× demo data, and add the §9 index only on a failure. Review at 1280 and 1920 widths. | n/a | Every tab is under 1 s, and the ux-reviewer passes it. |

## 13. Decisions (ruled by the product owner, 2026-10-24)

- **DB-1, who sees the Dashboard. Accepted.** Every staff member, with no new permission, under the lists' own visibility
  rules. Every count is already reachable on the lists.
- **DB-2, SULIT totals. Changed: v1 reads no SULIT field.** The estimated-value tiles (Requisitions, Tenders) and the
  count/value switch are dropped; the I-1 scan holds `src/lib/insights/**` to naming no field of `SULIT_FIELDS`. The
  per-record design (§6.2) stays on file for v2 and needs a new ruling before it is built.
- **DB-3, Budget's audience. Changed: one predicate for all three surfaces.** `mayReadBudget` (Settings reader, or holder of
  `sulit.read.organisation`) governs the Dashboard's Budget tab, its Budget used tile and the Budget page itself, which today
  any staff member can open by address while a code with one commitment discloses that requisition's estimate. "Is a
  committed figure SULIT?" has gone to RSAJ; if it is, the three change together. Administrators pass through Settings and see
  Committed, as they do on Budget today; the security auditor reviews both screens.
- **DB-4, drill-down filters on the lists. Accepted.** I-6 after step 7. Until then a tile links only where a list view holds
  exactly the same records.
- **DB-5, the financial year's source. Accepted.** `BudgetPeriod`, with an honest "Financial year not set"; the calendar year
  is never assumed.
- **DB-6, charts. Accepted.** Hand-rolled server SVG (§8), not a library.
- **DB-7, no Suppliers tab and no certified-amount tile in v1. Accepted** (§10). Revisit with FR-RPT-004 and -008.
- **DB-8, name and place. Changed:** "Dashboard" at `/dashboard`, second in Work (the founder's word; Home no longer uses it).
  The code stays in `src/lib/insights/**`.
- **DB-9, Home's pipeline cards. Changed:** Home is unchanged; step I-5 is dropped.
- **DB-10, the Department filter. Accepted.** The requesting unit (`requestingUnitCode`), flat, with no roll-up of sections
  into departments; whether a section's work counts under its department is RSAJ's policy, added as a switch if they ask.
  The filter's one unit list is the Department units, as the requisition form offers them; a budget code owned by a section
  or division is not reached by it (§4, the known gap).

## 14. Test with real users before committing

1. **With the Head of C&P:** give them the Overview and ask "what would you say at Monday's meeting?" If they reach for
   Excel, a tile is missing.
2. **With a department head:** ask them to filter to their department and check the numbers against what they believe. A
   mismatch means the department mapping (DB-10) is wrong for RSAJ.
3. **With a requester who may not read Budget:** check that the Overview without its Budget used tile, and without the Budget
   tab, reads as complete rather than broken.
4. **The click-through:** click any linked tile and ask whether the list matches. Any doubt is a defect.
5. **The six-tile row at 1280 px:** if it feels crowded, drop to five tiles per tab, not to smaller type.
