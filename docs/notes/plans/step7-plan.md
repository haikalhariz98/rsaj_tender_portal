# Step 7 plan: global search, server-side list queries and exports

- **Date:** 2026-10-24.
- **Author:** solution architect.
- **Decision record:** ADR 0044 (global search, server-side list queries and list exports).
- **Scope, as the founder set it (2026-10-24, verbatim):** "can we skip the email smtp, because later I want to integrate with
  azure entra and outlook, not now. Report also not required now until we get ful requirements from RSAJ, maybe we have a like
  a power bi dashboard (create our own dashboard instead of integration with power BI) for reporting to report on budget,
  pipeline, requsition and others. Please proceed witj global search and export. then wave V."
- **So step 7 is three things:**
  1. global search;
  2. server-side search, views and paging on the five lists that page on the server but still filter one page (batch C #3);
  3. exports of the whole filtered list.

  The plan builds no email and no Reports area (§6).
- **Approval:** the founder approved the programme on 2026-10-23 and gave full permission to proceed on 2026-10-24.
  The product owner rules ST-1 to ST-18 (§5).
- **Standing rules (simplification plan, unchanged):**
  - Desktop only. English only. Minimal words; explanations go in popovers.
  - No customer value in product code.
  - One schema step in flight at most. **This plan has none** unless 7.8 measures a failure (ST-2).
  - Every screen step ends with:
    - `npm run typecheck`, `npm run lint` and `npm test`;
    - `npm run test:db` for the store steps;
    - a `scripts/text-snapshot.mjs` before and after, diffed;
    - a sibling-screen check (AGENTS.md).

## 1. What exists, and what is wrong with it

- **The top bar has a disabled search button** (`src/components/shell/topbar.tsx`, "Search", `cursor-not-allowed`). Nothing
  searches across records.
- **Five lists page on the server** with `?page=n`, then search, filter and sort **only the rows of that page** in the client:
  - Requisitions: `listRequisitions`, 100 a page;
  - Tenders & quotations: `listExercises`, 100;
  - Projects: `listCases`, 50. Its views are already server-side;
  - Suppliers: `listSuppliers`, 100, with `page` and `apage` tabs;
  - Committees: `listSittings`, 50.

  A search for a requisition on page 3 finds nothing on page 1. The client then pages the 100 again in 25s, so there are two
  pagers.
- **Export is client-side** (`DataList.exportCsv`). It writes the rows the browser holds, so on a server-paged list it
  **silently exports one page**. It leaves SULIT columns out (`exportColumns`) and guards formula cells (`src/lib/csv-cell.ts`).
  It writes no UTF-8 byte-order mark, so Excel misreads non-ASCII names.
- **FR-REQ-002's acceptance is not met:** "A search on a PROC… value returns the complete case history end to end."
- **Reused as they are:**
  - visibility: `hiddenExercises` / `exerciseNotHidden` (FR-MTD-007), `caseVisibilityWhere` (AC-18), the actor's
    `organisationId` (ADR 0034 D10), and `SULIT_FIELDS` (`src/lib/sulit-fields.ts`);
  - route guards: `staffRoute()` for route handlers, and `downloadRequestFault` (`src/lib/documents/request-guard.ts`) to refuse
    a download started from another site;
  - libraries: `exceljs`, already a dependency and used by `src/lib/requisition/line-import-file.ts`;
  - forms: `next/form` (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md`), for GET forms that
    update search params with client navigation and work without JavaScript.

## 2. Contracts (written in 7.1, before anything uses them)

```ts
// src/lib/list-query.ts (pure)
export const Q_MIN = 2;
export const Q_MAX = 100;
export interface ListQuery<V extends string = string> {
  q: string | null;          // trimmed, inner whitespace collapsed; null when shorter than Q_MIN
  words: string[];           // q split on spaces, each kept literal (no wildcard meaning)
  view: V | null;            // only one of the list's own view keys; anything else is null
  page: number;              // from 0; a bad value is 0
  size: (typeof PAGE_SIZES)[number]; // 10 | 25 | 50 from src/lib/paging.ts; default 25
}
/// The most rows one export writes: a technical ceiling, not customer policy (ST-10). A repo's full-set read takes one more, to tell "over".
export const LIST_EXPORT_MAX_ROWS = 5000;
export function parseListQuery<V extends string>(sp: Record<string, string | string[] | undefined>, views: readonly V[]): ListQuery<V>;
/// The list's own address with q, view, page and size; empty parts left out. Used by the pager, StatusCounts and Export.
export function listHref(base: string, q: Partial<Pick<ListQuery, "q" | "view" | "page" | "size">>): string;
```

```ts
// src/lib/search/fields.ts (pure). The ONE list of what a search may match, for global search and every list's q.
export type SearchEntity = "requisition" | "exercise" | "project" | "supplier" | "sitting";
/// Prisma paths, relation paths allowed. Identifiers and titles only: never a SULIT field, a creditor or bank column, or an
/// evaluation, opening or sealed-bid column. A source test holds it to that.
export const SEARCH_FIELDS: Readonly<Record<SearchEntity, readonly string[]>> = {
  requisition: ["reference", "title", "erpRequisitionNo", "erpNoteNo"],
  exercise:    ["reference", "title", "requisition.reference", "requisition.erpRequisitionNo"],
  project:     ["reference", "erpCommitmentNo", "contract.number", "exercise.reference", "exercise.title", "exercise.requisition.erpRequisitionNo"],
  supplier:    ["reference", "registeredName", "registrationNo", "erpVendorCode"],
  sitting:     ["reference", "committee.nameEn"],
};
/// The exact-key columns: a whole-value match on one of these opens the case group (ST-4).
export const CASE_KEYS: Readonly<Partial<Record<SearchEntity, readonly string[]>>> = {
  requisition: ["reference", "erpRequisitionNo", "erpNoteNo"],
  exercise:    ["reference"],
  project:     ["reference", "erpCommitmentNo", "contract.number"],
};
```

```ts
// src/lib/search/words.ts (pure; imports Prisma types only)
/// Every word must match at least one of the entity's fields, case-insensitive substring (ST-1). Wildcards in a word are literal.
export function wordsWhere(entity: SearchEntity, words: readonly string[]): object; // a Prisma where fragment, joined by AND, never spread
export function exactKeyWhere(entity: SearchEntity, q: string): object | null;      // null for an entity with no case keys
```

```ts
// src/lib/search/types.ts
export interface SearchHit {
  entity: SearchEntity;
  id: string;
  title: string;
  sub: string;                                // reference and number, as words
  href: string;                               // the record's own page
  status?: { text: string; tone?: "brand" | "ok" | "warn" | "err" | "info" };
  exact: boolean;                             // whole-value match on a case key
}
export interface SearchGroup {
  entity: "requisition" | "exercise" | "project" | "supplier";
  label: string;                              // "Requisitions", "Tenders & quotations", "Projects", "Suppliers"
  hits: SearchHit[];                          // at most SEARCH_GROUP_SIZE (10), exact first, then newest
  total: number;                              // a count under the same where: honest "10 of 34"
  seeAllHref: string;                         // the list with ?q=
}
export interface CaseGroup {                  // FR-REQ-002: the whole case, from the requisition down
  requisition: SearchHit;
  exercises: { hit: SearchHit; projects: SearchHit[] }[]; // only those the reader may see; a hidden one is neither shown nor counted
  /// AC-18: projects the reader may see (contract stages) whose exercise is hidden from them. Shown without the exercise, never naming it.
  projects: SearchHit[];
}
export interface SearchResult { q: string; caseGroup: CaseGroup | null; groups: SearchGroup[] }
```

```ts
// src/lib/ui/list-cells.ts (pure; moved out of the "use client" data-list.tsx so a route handler can use them)
export type { Cell, Column, Row } from "...";   // the types move here; data-list.tsx re-exports them for existing importers
export function cellText(cell: Cell | undefined, lang?: Language): string;
export function exportColumns(columns: readonly Column[]): Column[]; // unchanged: drops every `sulit` column
export function canExport(columns: readonly Column[]): boolean;
```

```ts
// src/lib/export/xlsx.ts (server only; exceljs)
/// One sheet: a header row and the rows. A column's kind decides the cell: "text" is a string cell (identifiers keep
/// leading zeros and are never formulas), "money" a number cell formatted to 2 places, "date" a date cell. Pure input.
export interface SheetColumn { label: string; kind: "text" | "money" | "date" }
export function listToXlsx(sheetName: string, columns: readonly SheetColumn[], rows: readonly (readonly (string | number | Date | null)[])[]): Promise<Buffer>;
```

```ts
// DataList, server mode (7.3). A list the server pages, searches and filters.
server?: {
  q: string | null;
  action: string;                     // the list's address; the search box is a next/form GET to it, name "q"
  keep?: Record<string, string>;      // hidden inputs kept on a search (the current view, the suppliers tab)
  total: number; page: number; size: number;
  // Precomputed with listHref by the page: a function cannot cross to a client component.
  prevHref: string | null; nextHref: string | null; sizeHrefs: Record<10 | 25 | 50, string>;
  exportHref?: string;                // Export becomes a link to this route; absent: no Export button
};
```

- **The export route contract.** Each list has `GET <list>/export?q=&view=` (the suppliers list adds `tab`).
  - It answers an `.xlsx` attachment named `<list>-<organisation's day>.xlsx`.
  - It refuses with plain text, as the document routes do:
    - 401 or 403 from `staffRoute()`;
    - 403 for a cross-site request (`downloadRequestFault`);
    - 413 above `LIST_EXPORT_MAX_ROWS`, in words: "More than 5,000 rows match. Narrow the search or the view, then export
      again."
- **The row builder per list.** Each list's rows are built by one server module, `src/app/<list>/rows.ts`. The page uses it,
  and so does the export route. It takes `{ forExport: boolean }`:
  - with `forExport`, it **does not build SULIT columns** and makes no `sulitGates` call;
  - so an export neither reads nor logs a SULIT value it would not write.

## 3. Build order

Two builders at once, never the same file. There are no schema steps (ST-2).

| Wave | Builder A | Builder B | Schema |
| --- | --- | --- | --- |
| 7-a | 7.1 Contracts and shared pure pieces (domain-engineer) | (none: everything waits on its types) | none |
| 7-b | 7.2 Global search (domain-engineer, then frontend-engineer) | 7.3 DataList server mode; Requisitions and Tenders & quotations (frontend-engineer, with domain-engineer for the repos) | none |
| 7-c | 7.4 Server query: Projects, Suppliers, Committees (frontend-engineer) | 7.5 Export route and XLSX; Requisitions and Tenders & quotations exports (api-engineer) | none |
| 7-d | 7.6 Exports: Projects, Suppliers, Committees (api-engineer) | 7.7 Words and one pack rule: the last "Not emailed", SP-16 in part (domain-engineer) | none |
| 7-e | 7.8 Close-out: volume timings, security review, screenshots, snapshots (devops-engineer, security-auditor, ux-reviewer) | (none) | none, unless the timing fails (ST-2, then 7.8b) |

### 7.1 Contracts and shared pure pieces

- **Agent:** domain-engineer. Serial.
- **Migration:** no.
- **Files it owns:**
  - new: `src/lib/list-query.ts`, `src/lib/search/fields.ts`, `src/lib/search/words.ts`, `src/lib/search/types.ts` and
    `src/lib/ui/list-cells.ts`;
  - `src/components/data-list.tsx`, for the move only: it imports `cellText`, `exportColumns` and `canExport` from
    `list-cells.ts` and re-exports the types. Two changes ride with the move:
    - one behaviour change: the client CSV gets a leading `﻿`;
    - `src/lib/csv-cell.ts`'s `listToCsv` is not touched. The audit trail export's digest is over its own bytes.
- **Work:** the contracts in §2. `wordsWhere` builds `{ AND: words.map(w => ({ OR: fields.map(path => nested(path, { contains: w, mode: "insensitive" })) })) }`.
  - Prisma's `contains` on Postgres is ILIKE. **Check whether Prisma 7 escapes `%`, `_` and `\` in `contains`; do not
    assume it.** If it does not, `words.ts` escapes them itself.
  - The test below decides.
- **Tests:**
  - `list-query.test.ts`:
    - page `"-1"`, `"abc"` and `"1e9"` give 0, and a page beyond the last is clamped by the caller;
    - an unknown view gives null;
    - a size outside 10, 25 and 50 gives 25;
    - q of `" a "` gives null;
    - q of 101 characters gives null;
    - `listHref` drops empty parts and keeps q across pages.
  - `words.test.ts`: two words make two AND terms, and every field path appears in each OR.
  - `fields.scan.test.ts`: no `SEARCH_FIELDS` path's last segment is:
    - a `SULIT_FIELDS` field;
    - a column of the creditor or bank tables;
    - a `nameMs` field (English only);
    - a column of the evaluation, opening, bid or sealing models (read from the Prisma DMMF).

    Every `CASE_KEYS` entry is also in `SEARCH_FIELDS`.
  - `words.db.test.ts` (`test:db`): a requisition titled `50% works` and one titled `500 works`. The word `50%` finds only the
    first, and `a_b` does not match `axb`.
  - The existing `data-list.test.ts` passes unchanged, and one new case checks that the CSV starts with the BOM.
- **Done when:**
  - the types compile;
  - `data-list.tsx` no longer defines `cellText`;
  - every test above passes.

### 7.2 Global search

- **Agent:** domain-engineer (store and pure parts), then frontend-engineer (page and top bar). Runs in parallel with 7.3.
- **Migration:** no.
- **Files it owns:**
  - new: `src/lib/search/store.ts`, `src/lib/search/rank.ts` and `src/lib/search/case-group.ts`;
  - new: `src/app/search/page.tsx`;
  - `src/components/shell/topbar.tsx`;
  - `src/lib/i18n/catalogues/shell.ts`, for the search words only.
- **Work:**
  1. **The store** has `search(actor, q): Promise<SearchResult>`, with every read scoped by `actor.organisationId`:
     - requisitions under `wordsWhere("requisition")`;
     - exercises under `exerciseNotHidden(hidden)` AND `wordsWhere("exercise")`;
     - projects (awards) under `caseVisibilityWhere(hidden)` AND `wordsWhere("project")`. The matchers on `exercise.*` paths
       are AND-ed with `exerciseNotHidden` on the award's exercise, so a hidden exercise's title or reference finds nothing;
     - suppliers under `wordsWhere("supplier")`.

     `hidden` is `hiddenExerciseIds(client, viewer)`, read once. Each kind runs `findMany({ take: SEARCH_GROUP_SIZE, orderBy: newest })`
     and `count()` under the same where, in parallel (`Promise.all`), and **selects only** the columns a `SearchHit` shows.
  2. **The case group (FR-REQ-002).** `exactKeyWhere` runs first on the three entities that have case keys. One exact hit
     resolves its requisition (an exercise's or a project's own requisition), and `case-group.ts` loads the chain:
     requisition → exercises (`exerciseNotHidden`) → awards with their contract (`caseVisibilityWhere`).
     - A hidden exercise is not in the group and not counted.
     - A project the reader may see whose exercise is hidden (AC-18: contract stages only) goes in `projects` at the top
       level. Its line shows the project's own reference and contract number, and never the exercise's title or reference.
     - Two exact hits on different requisitions give no group. The hits show in their groups, `exact: true` first.
  3. **Ranking** (`rank.ts`, pure): exact hits first, then the record's `createdAt` newest first. There is no relevance score
     (ST-1).
  4. **The page** `/search?q=`:
     - a `PageHeader` with the title "Search" and the subtitle `“<q>”`, then the case group as a `Card` in the order
       requisition, tender, project, each line a link with its status `Badge`;
     - one `Card` per group with hits: a `DataList` with `paging={false}` and `searchable={false}`, and a footer link
       "See all 34 in Requisitions" to `listHref(<list>, { q })`;
     - groups with no hits are not drawn, and with nothing at all, an `EmptyState`: "Nothing matches “<q>”." with no
       advice;
     - a q shorter than 2 characters shows the empty state "Type at least 2 characters.";
     - `metadata.title` is "Search" (page-titles test).
  5. **The crumb.** `SEGMENT_LABEL` gains `search: "Search"`, so the crumb tests hold.
  6. **The top bar.** The disabled button becomes a `next/form` `<Form action="/search">` with one input named `q` and the
     same look, in the staff workspace only (ST-5). The supplier workspace shows no search box.
     - The input carries the current q when on `/search`.
     - "/" focuses it unless focus is in a field.
     - It has an `aria-label` of "Search records".
- **Tests:**
  - `rank.test.ts`: exact before newest, and two exact hits keep their dates' order;
  - `case-group.test.ts` (pure assembly from loaded rows): an exercise with two awards, one with a contract; a hidden
    exercise is dropped and the group's count of exercises drops with it;
  - `search.db.test.ts` (`test:db`, two-organisation fixture, like `tenant.db.test.ts`):
    1. a PROC number of organisation A returns A's requisition, its exercise, its award and its contract as one case group;
    2. the same PROC searched by organisation B's actor returns nothing;
    3. a restricted exercise the reader is not named on is missing from the exercise group, from the case group and from
       both counts, and is present for a reader named on it;
    4. searching the digits of a requisition's estimated value returns no hit by that value;
    5. a supplier's registration number with a leading zero finds it;
    6. a contract-stage project under a restricted exercise the reader is not named on is in `caseGroup.projects`, and the
       hit's text holds no word of the exercise's title;
    7. a project is not found through `exercise.title` or `exercise.reference` when that exercise is hidden from the reader;
  - `exercise-scan.test.ts` passes with `store.ts` and `case-group.ts` using the guards. No `READ_AFTER_A_GUARD` entry is added.
  - `tenant-scan.test.ts` and `auth-reach.test.ts` pass, with the page calling `requireStaff` first.
- **Done when:**
  - typing a PROC number in the top bar on any staff page opens the case end to end;
  - the 1280 and 1440 screenshots of `/search` match the list screens' header, card and list styling;
  - the p95 is measured in 7.8.

### 7.3 DataList server mode; Requisitions and Tenders & quotations

- **Agent:** frontend-engineer, with domain-engineer for the repo functions. Runs in parallel with 7.2.
- **Migration:** no.
- **Files it owns:**
  - `src/components/data-list.tsx`, `src/components/data-list.test.ts`;
  - `listRequisitions` in `src/lib/requisition/repo.ts`, `listExercises` in `src/lib/method/repo.ts`;
  - `src/app/requisitions/page.tsx`, `src/app/sourcing/page.tsx`;
  - new: `src/app/requisitions/rows.ts`, `src/app/sourcing/rows.ts`.
- **Work:**
  1. **DataList server mode** (the `server` prop, §2). When `server` is set:
     - the search box is a `next/form` GET to `server.action`, named `q`, with `keep` as hidden inputs, and it does no
       client filtering;
     - client paging is off, and the footer shows "1–25 of 340", the size choice (10, 25, 50) as links, and Previous and Next
       links;
     - the client view selector is not drawn: the page's `StatusCounts` chips are the views, linking with `listHref` and
       keeping q;
     - column sort works only when `total <= size` (the whole result is loaded). Otherwise the headers are inert and the
       order is the server's, newest first (ST-7);
     - Export is a link to `server.exportHref` when given, and not drawn when it is absent. A list's client CSV export goes
       away in server mode, because it would export one page;
     - filters (`filters`) are not offered in server mode. A list that needs one makes it a view.

     Without `server`, DataList behaves exactly as today. Every in-card list is unchanged.
  2. **Requisitions:**
     - `listRequisitions(organisationId, q: ListQuery<"pending" | "drafts" | "over">)`;
     - the where is the organisation AND `wordsWhere("requisition", q.words)` AND the view's status set: pending is
       `PENDING_APPROVAL`; drafts are `DRAFT`, `RETURNED` and `RECALLED`; over is `OVER_BUDGET`;
     - `skip: page * size`, `take: size`, and `total` under the same where. The header counts stay over the organisation;
     - `REQUISITIONS_PAGE` is retired.

     The row building moves unchanged from `page.tsx` into `rows.ts`, `buildRequisitionRows(actor, rows, { forExport })`.
  3. **Tenders & quotations:**
     - `listExercises(organisationId, hidden, q)`;
     - **DB views:** drafts, preparing and approval by status; published by `isPublished`'s status set; name by the
       pending name-approval route (the `awaitingName` where already there).
     - **Views judged per reader, or from derived state (ST-8):**
       - "Open for purchase" and "Closing soon" read the window phase from stored instants (`windowColumns`, `closesSoon`);
       - "On the boundary" states the estimate, so it is shown only where the reader's SULIT grant allows (ruling of
         2026-10-08, log line 1716).

       For these three, the repo loads the bounded candidate ids under a superset where:
       - published and not cancelled for open and soon;
       - the existing `onBoundary` set for boundary.

       The judgement lives in `src/app/sourcing/rows.ts` (`judgedViewIds(actor, view, candidates)`), not in the page, so the
       page and the export route share one code path. It uses the same functions as today (the grant for boundary), then
       pages the judged ids. Never a bare `onBoundary: true` where: its count would give away rows whose estimate is
       withheld.
     - **The boundary view has no Export.** Judging the grant writes `SulitAccessEvent` rows (ADR 0034 D14), and an export
       must write none (7.5). So `exportHref` is absent on that view, and the route answers 400 for `view=boundary`.
     - The header's counts are unchanged and over the whole set.
     - `EXERCISES_PAGE` is retired.

     The rows move into `rows.ts`.
  4. **The full-set read for export.** Both repo functions take `{ all: true }`: no `skip`, and
     `take: LIST_EXPORT_MAX_ROWS + 1`. The export (7.5) calls this mode.
  5. **Export is not drawn when `total > LIST_EXPORT_MAX_ROWS`.** A popover on the count says "Narrow the search to export".
     The route's 413 is only the backstop.
  6. Old addresses keep working: `?page=n` without `size` reads as size 25. A page past the end clamps to the last page.
- **Tests:**
  - `data-list.test.ts`, server mode:
    - no client filtering of typed text;
    - the footer counts from `total`;
    - sort is inert when `total > size` and live when it is not;
    - no Export without `exportHref`;
    - an all-withheld SULIT column still collapses (6.1);
  - `requisition-list.db.test.ts`:
    - a requisition on what was page 2 is found from page 0 by its PROC number;
    - the pending view and q together;
    - `total` equals the count of matching rows;
  - `exercise-list.db.test.ts`:
    - a hidden exercise is not in any view's rows or count;
    - the boundary view lists and counts only exercises whose estimate the reader is granted;
    - q matches the requisition's PROC number;
    - `{ all: true }` returns at most `LIST_EXPORT_MAX_ROWS + 1` rows under the same where as the page;
  - the existing sourcing and requisition screen tests, with the words unchanged.
- **Done when:**
  - on a list of more than one page, a search finds a row from any page;
  - the footer says the true count;
  - there is one pager, not two;
  - the text snapshot shows no dropped column, chip or warning.

### 7.4 Server query: Projects, Suppliers, Committees

- **Agent:** frontend-engineer, with domain-engineer for the repos. Runs in parallel with 7.5.
- **Migration:** no.
- **Files it owns:**
  - `listCases` in `src/lib/contract/case-load.ts`;
  - `listSuppliers`, and the applications list loaders, in `src/lib/suppliers/repo.ts`;
  - `listSittings` in `src/lib/committee/sittings.ts`;
  - `src/app/projects/page.tsx`, `src/app/projects/securities-view.tsx`, `src/app/suppliers/page.tsx` and
    `src/app/committees/page.tsx`;
  - new: `src/app/projects/rows.ts`, `src/app/suppliers/rows.ts` and `src/app/committees/rows.ts`;
  - `src/lib/search/fields.ts`, `src/lib/search/types.ts` and `fields.scan.test.ts`, for the `application` entry only (7.1
    wrote them; 7.5, running beside this step, only reads them).
- **Work:**
  - **Projects:** `listCases` gains `q.words`, AND-joined as a fragment (case-visibility.ts: "joined by AND and never spread"),
    and `size`. Its views are already server-side.
  - **The securities view:** keeps its `sv` views and gains q on the instrument's project reference.
  - **Suppliers:**
    - each server-paged tab (the register `page`, the applications `apage`) gains `q`, and `keep` holds the tab;
    - the register's search fields are `SEARCH_FIELDS.supplier`;
    - the applications tab searches the applicant's registered name and registration number. Add both to a
      `SEARCH_FIELDS.application` entry, and add the entity to `fields.scan.test.ts`.
  - **Committees:**
    - `listSittings(scope, q)` gains `wordsWhere("sitting")` and size;
    - its upcoming, awaiting and pending chips become views where they are status predicates;
    - "Waiting to be tabled" stays a client list. It is not paged.
  - The rows move into `rows.ts` per list, unchanged.
  - Each repo gains the `{ all: true }` full-set read and the "no Export over the cap" rule, as 7.3 items 4 and 5.
- **Tests:**
  - `case-list.db.test.ts`:
    - q by contract number, PROC number and commitment number;
    - a restricted case seen as contract stages only is in the stage views and absent from the award-work views, as AC-18
      holds;
    - `total` equals the matching count;
  - `supplier-list.db.test.ts`: q on each tab; the tab is kept across paging;
  - `sittings-list.db.test.ts`: q by sitting reference and by committee name;
  - each repo's `{ all: true }` read returns at most `LIST_EXPORT_MAX_ROWS + 1` rows under the page's where;
  - the existing projects, suppliers and committees screen tests pass.
- **Done when:** the same three checks as 7.3 pass on these three lists.

### 7.5 Export route and XLSX; Requisitions and Tenders & quotations exports

- **Agent:** api-engineer. Runs in parallel with 7.4.
- **Migration:** no.
- **Files it owns:**
  - new: `src/lib/export/xlsx.ts` and `src/lib/export/xlsx.test.ts` (`LIST_EXPORT_MAX_ROWS` is imported from
    `list-query.ts`);
  - new: `src/app/requisitions/export/route.ts` and `src/app/sourcing/export/route.ts`;
  - the `exportHref` line in `src/app/requisitions/page.tsx` and `src/app/sourcing/page.tsx` (7.3 has finished with them).
- **Work:**
  1. `listToXlsx` (§2), on `exceljs`:
     - one sheet, a bold frozen header row and column widths from the label length;
     - text cells as strings (never a formula, whatever they start with), money as numbers formatted `#,##0.00`, and dates
       as date cells;
     - money arrives from the row builder as the `Decimal` string and is converted at this boundary, one place
       (AGENTS.md rule 4).
  2. **The route:**
     - `staffRoute()` first, then `downloadRequestFault`;
     - `parseListQuery` with the list's views;
     - the repo's `{ all: true }` read (7.3, 7.4). One row over the cap means 413;
     - then `build…Rows(actor, rows, { forExport: true })`, and then `exportColumns` on the columns;
     - the response: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
       `Content-Disposition: attachment; filename="requisitions-2026-10-24.xlsx"` and `Cache-Control: no-store`.

     For "Open for purchase" and "Closing soon" (ST-8), the route calls `judgedViewIds` from `rows.ts`, exactly as the page
     does. `view=boundary` answers 400 "This view cannot be exported." (7.3). The estimate column is SULIT and is never in
     any export.
  3. The page passes `exportHref = listHref("<list>/export", { q, view })`. The button reads "Export", with a popover: "An
     Excel file of every row that matches. SULIT columns are left out."
  4. Exports are not audited, as the client export is not today, and carry no SULIT column (ST-11). An audited download of
     SULIT columns stays out (backlog: "An audited 'download this view'…", ruling on log line 1755).
- **Tests:**
  - `xlsx.test.ts`, reading the buffer back with exceljs:
    - `=1+1` stays the string `=1+1`;
    - `0123` keeps its leading zero;
    - `1234567.89` is a number;
    - a Malay name round-trips;
  - `export-route.db.test.ts`:
    - organisation B's actor exporting gets none of A's rows;
    - a restricted exercise the reader is not named on is absent;
    - the header has no SULIT column label;
    - no `SulitAccessEvent` is written by an export;
    - `view=boundary` gives 400 and writes nothing;
    - 5,001 matching rows give 413 with the words;
  - `auth-reach.test.ts` and `tenant-scan.test.ts` cover the two new routes, with no allow-list entry;
  - a source test: every `src/app/**/export/route.ts` calls `staffRoute` and `downloadRequestFault`, and reaches rows only
    through a `rows.ts` builder with `forExport: true`.
- **Done when:** exporting a filtered list of three pages gives one file with every matching row, and opening it in Excel
  shows registration numbers with their zeros and amounts as numbers.

### 7.6 Exports: Projects, Suppliers, Committees

- **Agent:** api-engineer. Runs in parallel with 7.7.
- **Migration:** no.
- **Files it owns:**
  - new: `src/app/projects/export/route.ts`, `src/app/suppliers/export/route.ts` and `src/app/committees/export/route.ts`;
  - the `exportHref` lines in their three pages (7.4 has finished with them).
- **Work:**
  - as 7.5, per list;
  - the suppliers route takes `tab` and refuses an unknown one with 400;
  - the projects route takes `view` and `sv`.
- **Tests:** as 7.5's route tests, per list. AC-18: a case the reader sees as contract stages only leaves out the award-work
  columns.
- **Done when:** the five server lists all export the whole filtered set.

### 7.7 Words and one pack rule

- **Agent:** domain-engineer. Runs in parallel with 7.6.
- **Migration:** no.
- **Files it owns:**
  - `src/lib/inbox/kinds.ts`, `src/lib/inbox/clock-plan.ts` and `clock-plan.test.ts`;
  - `src/lib/award/clock-notices.ts` and `clock-notices.db.test.ts`;
  - `src/lib/portal/bids/notices.ts`, `src/lib/portal/labels.ts` and `src/lib/portal/registration/state.ts`;
  - `src/app/projects/[id]/award/award-view.tsx`, `src/app/projects/[id]/award/clock-told.tsx`,
    `src/components/registration/company-fields.tsx` and `src/app/inbox/page.tsx` (its comment and subtitle);
  - `prisma/rsaj/starter-pack/suppliers.ts`, `src/lib/starter/rsaj-pack.test.ts` and `rsaj-pack.db.test.ts`;
  - `src/lib/starter/plan.ts` (`ALLOWED_MODELS` gains `NotificationRule`, which is not on it today) and
    `src/lib/starter/pack-guards.test.ts`.
- **Work:**
  1. **ST-12.** Delete the following, then render nothing in their place:
     - `NOTICE_DELIVERY_STATEMENT` ("Shown here, not emailed");
     - `CLOCK_NOTICE_CHANNEL`, and the "Not emailed" chip `clockPlanLabels` adds.

     Reword three texts:
     - `emailNotVerifiedHint` reads "The address is not checked.";
     - the registration state body reads "The result shows on your account page.";
     - the comments that say "email is not connected (INT-09)" say "notices are delivered in the portal (INT-09 deferred:
       ADR 0044)".
  2. **ST-13.** The RSAJ pack gains one `NotificationRule`:
     - `supplier.document.expiring`, named "Supplier document expiring";
     - `reminderOffsetDays` [90, 60, 30, 7], no offices, STATED, requirement FR-VND-008, source "Specification FR-VND-008";
     - it loads only into an empty rule list, as every pack list does.

     The portal's reminders (`reminderDue` in `src/lib/portal/company/documents.ts`) then show for an RSAJ organisation. The
     file's header comment changes "come with email in step 7 (SP-16)" to say which rule is loaded and that the office-naming
     rules wait (SP-16).
- **Tests:**
  - `clock-plan.test.ts`: the labels are `["No rule"]` and `["No rule", "Restricted"]`. The assertion changes because the
    behaviour changes, and the reason is recorded in the log line;
  - `text-rules.test.ts`: the `BANNED_WORDS` scan finds no "Not emailed" outside the scan's own test;
  - `pack-guards.test.ts`: the allow-list still equals the tables the three packs write, now including `NotificationRule`;
  - `rsaj-pack.test.ts`: the rule has its requirement and source and is STATED, and the offsets are exactly [90, 60, 30, 7];
  - `rsaj-pack.db.test.ts`: after the load, `reminderDue` gives a reminder for a document 30 days from expiry.
- **Done when:** `grep -ri "not emailed" src` finds only the banned-word test, and the product owner has signed off the one
  pack row.

### 7.8 Close-out

- **Agents, in this order:** devops-engineer (timings), security-auditor (review), ux-reviewer (screenshots) and
  ui-guidelines-reviewer. Serial.
- **Migration:** no, unless the timing fails (7.8b).
- **Files it owns:**
  - new: `scripts/volume-search.ts`;
  - `docs/notes/plans/step7-plan.md` (status lines only);
  - AGENTS.md, one line under "The UI": "A list the server pages uses DataList's `server` mode; its search, views and
    export cover every row, not the page."
- **Work:**
  1. **The volume script.** It refuses unless `DATABASE_URL` equals `TEST_DATABASE_URL`. It writes a scratch organisation,
     `VOLUME-<timestamp>`, by `createMany`:
     - 20,000 requisitions;
     - 6,000 exercises, 500 of them restricted;
     - 4,000 awards with contracts;
     - 8,000 suppliers;
     - 2,000 sittings.

     It times 50 runs each of:
     - `search()`, with a PROC number, a two-word title and a single common word;
     - each list's page 0 with q;
     - each export of 5,000 rows.

     It prints the p50 and p95 for one client. The targets are search p95 under 5 s and list p95 under 3 s. This covers
     NFR-PRF-001 partly: its acceptance is a load test "at the agreed concurrency", which stays a go-live item. The figures go in the decisions log.
     The script never touches `perolehan`.
  2. **The security review:**
     - tenancy (every new read has `organisationId`);
     - FR-MTD-007 (every exercise and award read has its guard);
     - FR-EVL-014 and NFR-SEC-001 ("including report, export and search");
     - formula and leading-zero safety in XLSX;
     - cross-site download refusal;
     - that a search term is never written to a log or the audit trail (ST-18);
     - that the q in a URL is not reflected unescaped.
  3. **ux-reviewer:**
     - screenshots at 1280 and 1440 of `/search` and of the five lists, with a q and on page 2;
     - a sibling check of headers, pagers and Export placement across the five lists;
     - `text-snapshot.mjs` before and after, diffed.
  4. **7.8b (only if a p95 fails):** data-modeler adds one migration:
     - `CREATE EXTENSION IF NOT EXISTS pg_trgm`;
     - GIN `gin_trgm_ops` indexes on the `SEARCH_FIELDS` columns of the slow entity only.

     Then the script runs again. This is the plan's only possible schema step.
- **Done when:**
  - the single-client timings are recorded and pass;
  - the review has no MUST open;
  - the screenshots are in the scratchpad;
  - the proposed log lines are handed to the orchestrator.

## 4. Requirement trace

| Requirement | Pri | What step 7 does | Step |
| --- | --- | --- | --- |
| FR-REQ-002 (acceptance: a PROC search returns the whole case) | M | Case group on `/search` from any case key | 7.1, 7.2 |
| NFR-PRF-001 (list 3 s, search 5 s at p95, under load) | M | **Partly:** server-side q and paging; single-client p95 at ten times the demo volume; trigram index only if needed. The load test at the agreed concurrency stays a go-live item | 7.3, 7.4, 7.8 |
| FR-EVL-014, NFR-SEC-001 ("including report, export and search") | M | Search fields allow-listed and scanned; exports drop SULIT columns and never judge or read them; restricted exercises guarded | 7.1, 7.2, 7.5, 7.6 |
| FR-MTD-007 (restricted exercise hidden) | M | `exerciseNotHidden` / `caseVisibilityWhere` in search, lists and exports; counts honest | 7.2–7.6 |
| ADR 0034 D10 (tenant isolation) | — | Every new read scoped by the actor's organisation; two-organisation db tests | 7.2–7.6 |
| FR-VND-008 (reminders 90/60/30/7) | M | The rule's offsets load in the RSAJ pack; reminders **shown in the portal**; sending deferred with email | 7.7 |
| FR-APR-015 (trail export) | M | Unchanged: CSV with SHA-256 digest, under Settings › Audit trail | — |
| Research "Excel export" item | — | XLSX of the whole filtered list | 7.5, 7.6 |
| FR-RPT-001 to FR-RPT-009, FR-RPT-011, FR-RPT-012 | M/S/C | **Deferred by the founder 2026-10-24** until RSAJ supplies full reporting requirements; direction: an in-product dashboard (backlog) | — |
| FR-RPT-010 (tamper-evident case extract) | M | **Deferred by the founder 2026-10-24** with reports (ST-14). In place: the trail export with digest (FR-APR-015), and the search case group to find the case | — |
| INT-09 (notification and correspondence) | — | **Deferred by the founder 2026-10-24** to a Microsoft Entra ID and Outlook (Microsoft Graph) integration; the inbox and portal notices stay the channel | — |
| FR-ADV-012, FR-ADV-014, FR-ADV-015, FR-ADV-016 (notify purchasers, per-recipient delivery status) | M | Email **deferred by the founder 2026-10-24**; portal notices and the officer's despatch record stand | — |
| FR-AWD-006, FR-AWD-009, FR-AWD-010, FR-AWD-012, FR-BID-009, FR-APR-018, FR-CTE-009, FR-LAD-012, FR-SUP-013, FR-PAY-003, FR-CMP-016, FR-FIN-012, FR-NSC-007 (alerts and notifications) | M/S | Email **deferred by the founder 2026-10-24**; where built, shown in the inbox or on the record | — |
| FR-VND-001, FR-VND-005, FR-VND-007 (registration and resubmission notices) | M | Email **deferred by the founder 2026-10-24**; results shown on the supplier's account page | — |

## 5. Decisions made here, for the product owner

Each carries its recommendation.

- **ST-1. How a search matches.**
  - Case-insensitive substring.
  - Every word typed must match at least one allow-listed field.
  - Exact whole-value matches on a case key come first, then newest first.
  - No fuzzy matching, no relevance score, no full-text index.

  *Recommend: as written. It is predictable and explainable.*
- **ST-2. No index migration now.** Plain ILIKE with per-group caps, measured at ten times the demo volume in 7.8. A
  `pg_trgm` GIN migration (7.8b) is added only for an entity whose p95 fails. *Recommend: as written.*
- **ST-3. What global search covers:** requisitions, tenders and quotations, projects and suppliers.
  - Committee sittings are searched on their own list only.
  - People, settings and document contents are not searched.

  *Recommend: as written.*
- **ST-4. The case group.**
  - An exact match on a requisition reference, PROC number, note number, exercise reference, award reference, commitment or
    indent number, or contract number shows the whole case first.
  - Each child is filtered by the reader's visibility. A hidden exercise is neither shown nor counted.
  - Two exact hits on different cases give no group.

  *Recommend: as written.*
- **ST-5. Staff only.** The supplier portal gets no global search box. *Recommend: as written.*
- **ST-6. One pager on server lists.**
  - Page sizes are 10, 25 and 50 (`size`), default 25.
  - DataList's client paging is off in server mode.
  - Old `?page=n` links read as size 25.

  *Recommend: as written.*
- **ST-7. Sorting on server lists.** A column sorts only when the whole result is loaded (total at most one page). Otherwise
  the order is newest first and the headers are inert. *Recommend: as written. Sorting one page of many misleads, and
  server-side sort on every column is not worth it now.*
- **ST-8. Views judged per reader stay judged per reader.**
  - "On the boundary" (it states the estimate), "Open for purchase" and "Closing soon" are judged over a bounded candidate
    set with today's functions, then paged.
  - None of them becomes a bare database filter.
  - The boundary view offers no Export: judging the grant logs SULIT reads, and an export logs none.

  *Recommend: as written.*
- **ST-9. Export format.**
  - Server-built exports are Excel (`.xlsx`, on the installed `exceljs`): identifiers as text, so leading zeros survive and
    nothing is a formula, and amounts as numbers.
  - Small in-card lists keep the client CSV, which gains a UTF-8 byte-order mark.
  - The audit trail export stays CSV, because its digest is over the file's bytes.

  *Recommend: as written.*
- **ST-10. Export cap of 5,000 rows,** refused in words above it. It is a technical ceiling of the product, not customer
  policy. *Recommend: as written.*
- **ST-11. Exports are not audited** (as today's client export is not), and they never carry, read or log a SULIT value. The
  audited SULIT download stays out (backlog, ruling on log line 1755). *Recommend: as written.*
- **ST-12. The remaining "Not emailed" words go now.** The inbox is the channel, and the word rules say do not promise or
  apologise. *Recommend: yes.*
- **ST-13. SP-16 in part: the RSAJ pack loads one rule now.** `supplier.document.expiring`, offsets 90, 60, 30 and 7, names
  no office, so SP-16's reason (rules name the customer's offices) does not apply to it. The portal's reminders then show.
  The other rules wait for the email integration. *Recommend: yes. The alternative is to defer it with email, keeping step 7
  to search and export only.*
- **ST-14. FR-RPT-010, the case extract (Must), is deferred with reports.** It is the one reporting item that is an export,
  so it is named here and not hidden in the FR-RPT line. Partial cover today:
  - the trail export, with its SHA-256 digest recorded (FR-APR-015);
  - the case group, which finds every record of a case.

  *Recommend: defer, as the founder directed. It is the first item when reporting starts.*
- **ST-15. Email is deferred to a Microsoft Entra ID and Outlook (Microsoft Graph) integration.**
  - Nothing in step 7 assumes SMTP, and no outbox table is made.
  - SP-15 stands: the "Email sender" checklist item stays hidden.
  - "Not emailed" goes (ST-12) without anything promising email.

  *Recommend: as written.* **Question for RSAJ:** the specification (§9.1, INT-09) says RSAJ's mail is Zimbra, not
  Microsoft 365. The founder's Outlook direction needs RSAJ to confirm its mail platform.
- **ST-16. Reporting is deferred until RSAJ supplies full requirements.**
  - The direction is the product's own dashboard (Power BI-like, not a Power BI integration) over budget, pipeline,
    requisitions and more. It is a backlog row.
  - SP-12 stands: there is no Reports menu item, and the budget ledger stays under Contracts & payments › Advanced.

  *Recommend: as written.*
- **ST-17. SP-13 (delegation, "I'm away") stays where it is.** Nothing in step 7 touches it. *Recommend: as written.*
- **ST-18. Search terms are not logged.** No SULIT value is ever a search field, so no `SulitAccessEvent` is written by a
  search, and a query string is not written to the audit trail or server logs by the product. *Recommend: as written.*

## 6. Deferred, and why (so nothing is lost)

- **Email.** The founder will integrate Microsoft Entra ID and Outlook later. The design rule for that work (ADR 0044 D6):
  - a mail façade under `src/lib/integration/`, with a stable internal contract (a recipient, a template key, merge data,
    and a portal link);
  - an adapter behind it (Microsoft Graph `sendMail` under an Entra app registration);
  - no approve-by-email (NFR-SEC-006, NFR-SIG-001): every email links into the portal;
  - a development sink that never sends;
  - the inbox and portal notices stay the record of what was told.

  Entra ID may also be where NFR-SEC-005's corporate directory and MFA attach, behind ADR 0034's identity façade. That is
  for its own ADR.
- **Reporting.** FR-RPT-001 to FR-RPT-012, until RSAJ's full requirements arrive. The 6.17 plan
  (`plans/6.17-reporting.md`) stays the record of what was once planned. The dashboard direction is in the backlog.
- **Wave V** follows step 7. Its ADR takes **0045 or later**: 0044 is this plan's.

## 7. Risks

- **Prisma's `contains` and LIKE wildcards.** If Prisma does not escape `%` and `_`, a search of `50%` over-matches. The
  7.1 db test decides, and `words.ts` escapes if needed.
- **Judged views on Tenders & quotations** load a candidate set before paging. It is bounded by "published and not
  cancelled" and by the boundary set. The volume script includes 500 published exercises to measure it.
- **The DataList change reaches every server list at once.** Server mode is opt-in through the `server` prop, and in-card
  lists are untouched. The text snapshot diff guards dropped fields.
- **Concurrent screenshots.** A ux-reviewer is taking screenshots while this is written. The builders start after them.
- **The founder's Outlook direction against the specification's Zimbra (§9.1).** This is unresolved with RSAJ. ST-15 records
  it as a question.
- **FR-RPT-010 is a Must left unbuilt,** by founder direction. It is recorded in ST-14 and the trace.
- **NFR-PRF-001 under concurrent load is not measured** by this plan, only single-client latency at volume. The load test is
  a go-live item.
