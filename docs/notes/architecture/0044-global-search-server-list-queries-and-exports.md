# 0044 — Global search, server-side list queries and list exports

- **Status:** proposed 2026-10-24, for the product owner's rulings ST-1 to ST-18 (`plans/step7-plan.md` §5). The founder set the
  scope on 2026-10-24: global search and export now; email and reporting later.
- **Supersedes:** nothing. It extends the `DataList` conventions (client search, sort and export) with a server mode, and it
  leaves the client mode as it is.
- **Plan:** `docs/notes/plans/step7-plan.md`.
- **Numbering:** Wave V's ADR (design note 0004 planned "0040, online award return") takes **0045 or later**.

## Context

- Nothing searches across records. The top bar's search button is disabled. FR-REQ-002's acceptance (a PROC search returns
  the whole case) and NFR-PRF-001 (search within 5 s) are unmet.
- Five lists page on the server, then search, filter and sort one page in the browser (batch C #3, decisions log
  2026-10-23). A search misses rows on other pages. The client export writes the page the browser holds, so it is silently
  partial.
- Constraints that do not move:
  - FR-EVL-014 and NFR-SEC-001: no route, including report, export and search, gives a SULIT value to someone not entitled;
  - FR-MTD-007: a restricted exercise is hidden from anyone not named on it, and counts must not give it away;
  - ADR 0034 D10: the actor's organisation scopes every query;
  - AGENTS.md rule 5: codes never reach a screen.
- The founder (2026-10-24) deferred email to a later Microsoft Entra ID and Outlook integration, and deferred reporting until
  RSAJ supplies full requirements. The research had planned SMTP, because the specification (§9.1) says RSAJ's mail is Zimbra.

## Decision

**D1. One allow-list says what a search may match.**
- `src/lib/search/fields.ts` lists, per entity, the identifier and title columns a search reads. Global search and every
  list's server search use it.
- A source test fails if any entry is a SULIT field, a creditor or bank column, an evaluation, opening, bid or sealing column,
  or a Malay field.
- So search is SULIT-safe by construction: it never reads a value it could leak, and it writes no `SulitAccessEvent`.

**D2. Matching is plain and predictable.**
- Each word typed must match some allowed field, case-insensitive substring (Postgres ILIKE through Prisma `contains`),
  with LIKE wildcards literal.
- An exact whole-value match on a case key ranks first, then newest first.
- There is no relevance score, no fuzzy matching and no full-text index.

**D3. Search reads through the same visibility as the lists.**
- Requisitions: the organisation.
- Exercises: `exerciseNotHidden`.
- Projects: `caseVisibilityWhere`.
- Suppliers: the organisation.

Every count is taken under the same where as its rows, so a hidden record changes neither.

**D4. A case key opens the whole case.**
- The case keys are: requisition reference, PROC number, note number, exercise reference, award reference, commitment
  number and contract number.
- An exact match on one shows a case group: requisition, then its exercises, then their projects. Each child passes the
  reader's visibility. That is FR-REQ-002's "complete case history end to end", as far as the reader may see.
- A project the reader may see whose exercise is hidden (AC-18, contract stages only) is listed on its own, never naming the
  exercise.

**D5. Server lists search, filter, page and export on the server.**
- `DataList` gains an opt-in `server` mode. Its search is a `next/form` GET (`?q=`), its views are links (`?view=`), and
  there is one pager (`?page=&size=`, sizes 10, 25 and 50).
- Column sort works only when the whole result is loaded.
- A view whose answer depends on the reader's SULIT grant, or on derived window state, is judged over a bounded candidate set
  by the same functions as today, then paged. It is never turned into a bare database filter whose count would leak.
- Export is a route handler: `GET <list>/export`, under the same query.
  - It is built by the same row builder as the page, with SULIT columns not built at all.
  - It is written as `.xlsx` with `exceljs`, which is already installed: identifiers as text cells, amounts as numbers.
  - It is guarded by `staffRoute()` and the cross-site download refusal, and capped at 5,000 rows.
  - It writes no `SulitAccessEvent`. A view that needs a SULIT judgement to list its rows (Tenders & quotations' "On the
    boundary") offers no export.
- In-card lists keep the client CSV, which gains a UTF-8 byte-order mark. The audit trail export stays CSV, because its
  digest is over its bytes.

**D6. Email: no SMTP, and no design that assumes it.** The inbox and the portal notices stay the channel, and the last
"Not emailed" words go. When email comes, it is a façade under `src/lib/integration/`, following the payment gateway
pattern:
- a stable internal contract: recipient, template key, merge data and a portal link;
- a Microsoft Graph adapter behind it, under an Entra app registration;
- a development sink that never sends, and a deployment switch absent by default;
- no approve-by-email (NFR-SEC-006, NFR-SIG-001): an email only links into the portal, and carries no amount, no SULIT value
  and no secret.

That is a later ADR. This one only rules out building toward SMTP now.

**D7. Reporting is not built now.** It waits for RSAJ's full requirements. The direction is the product's own dashboard
(Power BI-like, not a Power BI integration), recorded in the backlog. No Reports menu item is added (SP-12 stands).

**D8. No index migration unless measured.** A volume script at ten times the demo data measures search, list and export p95
on the test database (7.8). If a p95 fails NFR-PRF-001, one migration adds `pg_trgm` GIN indexes for the slow entity's
search columns. Otherwise there is no schema change.

## Consequences

- **Easy:**
  - finding any record from anywhere by its number;
  - one rule for what a requisition "matches", shared by search, its list and its export;
  - adding an entity to search (one allow-list entry, held by the scan);
  - Excel files that keep registration numbers intact.
- **Hard, or given up:**
  - sorting a list of many pages by any column (only newest first);
  - fuzzy or ranked search;
  - an audited export of SULIT columns (still out, by the 2026-10-08 ruling);
  - searching people, settings or document contents.
- **Ruled out:**
  - a client export of a server-paged list (it was partial);
  - a SULIT field in any search;
  - SMTP plumbing built ahead of the Entra and Outlook decision.
- **Left open:**
  - FR-RPT-001 to FR-RPT-012, including the Must case extract FR-RPT-010 (deferred by the founder 2026-10-24);
  - INT-09 and every email-dependent requirement (deferred by the founder 2026-10-24; shown in the portal where built);
  - RSAJ's mail platform: the specification says Zimbra, and the founder plans Outlook. RSAJ must confirm.
