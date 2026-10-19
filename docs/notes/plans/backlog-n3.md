# N3: the ui-guidelines pass on the sourcing, opening and case screens, with the "Sealed (version N)" fix: build plan

**Status (2026-10-19): ready to build.** Written by the solution architect for backlog item N3 (AC-63 item 3 in design note 0004;
the product owner's scope line of 2026-10-19 in the decisions log). This plan declares contracts. The signatures in section 3 are what
the builders write, not code that exists. Nothing here needs the founder, CPD, RSAJ or an outside service.

**No ADR.** The item changes on-screen words, adds one pure width function and fixes reviewer findings. All of it can be reversed, and
none of it changes the schema, an integration or a state machine. The judgement calls are in section 5. Step 1's builder copies them
into the decisions log.

**No migration. No dev-server restart.** Every change is in source that `next dev` reloads. Stored audit rows are not rewritten
(section 5, J3).

## 1. What exists today

- **The history label.** `src/lib/scope/labels.ts:51-52` holds `SEALED_TEXT = "Sealed"` and
  `sealedVersion(n) = "Sealed (version n)"`. The comment says "the same words everywhere".
  - `src/lib/scope/audit-view.ts` uses `sealedVersion` in two places:
    - `estimateVersionAudit` (line 68-69) **writes** it into the stored `AuditEntry` rows as `value` and `reason`.
    - `historyChange` (line 107-111) **re-renders** a `value|reason|amount|figure` change of a `CompanyEstimateVersion` row as
      `sealedVersion(n)`, or as a bare `"Sealed"` when the version is unknown.
  - The only caller of `historyChange` is `src/lib/method/repo.ts:318`, which feeds the exercise's History tab.
  - `src/lib/scope/read.ts:477` puts `SEALED_TEXT` in each version's value and reason. `src/app/sourcing/[id]/scope/estimate-section.tsx:158-159`
    renders those as error chips. So the estimate tab still shows a bare "Sealed" chip, even though 20cw (b) fixed its prose.
  - `labels.ts:254`, the `SEALED` fault, reads "The figure is sealed until the bids are opened."
- **The ruling.** 20cw (b) is in `docs/notes/design/0003-sourcing-requirements-v2.md:2255`. A version's figure is "withheld from view and
  held unencrypted" (F10). "Sealed" is kept only for a copy really sealed under the exercise key. The backlog row (backlog.md:75) left
  the history label open. `src/lib/bids/online/screens-claims.test.ts:144-158` scans `estimate-section.tsx` source only. It never sees
  the words that come from `labels.ts` through `read.ts`.
- **Pinned tests on the old words.**
  - `src/lib/scope/labels.test.ts:53`
  - `src/lib/scope/audit-view.test.ts:7-25` (describe title, lines 12-13, 24-25)
- **True uses of "sealed", which stay as they are.**
  - `sealedLodgementAudit` ("Sealed under the exercise key", `audit-view.ts:95`).
  - `ENTITY_LABEL` "Company estimate sealed copy" (`audit-view.ts:47`).
  - `src/lib/bids/envelope-status.ts:31`: a paper envelope is physically sealed.
- **Same overclaim, outside N3's named scope, not changed here (section 5).**
  - `src/lib/evaluation/report.ts:204,260` (`vsEstimate` / `saving.amount` "Sealed").
  - `src/lib/auth/sulit-access.ts:363` ("stays sealed", English and Malay).
- **Readers of stored audit rows that bypass `historyChange`.** `src/app/configuration/audit/page.tsx` and `actions.ts` (the
  `AuditExport`), the certificate and variation pages under `src/app/projects/[id]/`, and the loaders in `src/lib/*/repo.ts`. Rows written
  before this change keep "Sealed (version N)".
- **The shared Matrix.** `src/components/ui/matrix.tsx` sets `HEAD_WIDTH = 168` and `COLUMN_MIN = 176`, and gives `Table` (`table-fixed`,
  `w-full`) the minimum width `HEAD + COLUMN_MIN * max(n,1)`.
  - Commit `4df909c2` (2026-10-19, "four bidders fit at 1440", wave G defect 2) narrowed the widths from 220/200. Log line 2545 records
    it as fixed. No rendered check at 1440 is recorded since then.
  - The arithmetic: at 1440, the content box is 1440 − 17 (Windows scrollbar) − 272 (`lg:pl-68`, `src/components/shell/app-shell.tsx:115`)
    − 64 (`lg:px-8`, line 124) − 2 (card border) − 48 (`CardBody` `sm:px-6`) = **1037 px**. Four columns need 168 + 4 × 176 = **872 px**,
    so the minimums no longer explain a cut.
  - `<col style={{ minWidth }}>` (matrix.tsx:43) has no effect: browsers ignore `min-width` on `<col>`. If a cut remains, cell content
    causes it (nowrap button labels, the mono SHA line, "Download …" buttons in `src/app/sourcing/[id]/opening/matrix.tsx`).
  - The only consumer is `src/app/sourcing/[id]/opening/matrix.tsx:292`. `matrix-screen.test.ts` in the same folder renders the real
    `OpeningMatrix`.
- **Review scope.**
  - `src/app/sourcing/**`: 60 `.tsx`, of which the exercise page, `opening/`, `scope/`, `bids/` and `window/` are the demo walk.
  - `src/app/projects/**`: 35 `.tsx`, the case list, case page and award tabs.
  - The shared pieces they use: `src/components/ui/*`, `src/components/tabs.tsx`, `src/components/data-list.tsx`.
  - Reviewer: `.claude/agents/ui-guidelines-reviewer.md`. It still carries mobile rules (390 px, 44 px targets, 16 px inputs) and
    "English and Malay", so it must be briefed (section 4).
- **The text snapshot.** `scripts/text-snapshot.mjs <out> [base]` defaults to `http://localhost:3000` and signs in through
  `scripts/signed-in-fetch.mjs`. Run without a base URL, it signs in against the founder's database, which is forbidden. AC-63 records
  the scratch login as blocked and says it is not to be worked around. `perolehan_ui3c_app` (log line 2408) has its password in no file.

## 2. Target

- No screen says a company estimate version or its figure is "sealed". The history, the estimate tab's chips and the fault text say
  the figure is withheld from view and held unencrypted, in 20cw (b)'s words. Every true "sealed" stays.
- There is a pinned test, stated honestly, that four offer columns fit the 1440 content column. The cause of any remaining cut is fixed
  in the shared `Matrix`, never in the opening screen.
- Two reviewer runs, one before and one after, with the same brief. The second run reports no **open** Must or Should. "Open" means not
  fixed and not recorded with a reason in section 6.

## 3. Contracts

```ts
// src/lib/scope/labels.ts: renamed, no alias left behind (four importers: audit-view.ts, read.ts, labels.test.ts, audit-view.test.ts)
export const WITHHELD_TEXT = "Withheld from view, held unencrypted";
export const withheldVersion = (versionNo: number) => `Withheld from view, held unencrypted (version ${versionNo})`;
// SCOPE fault text, key unchanged (a code, never on screen):
//   SEALED: "The figure is withheld from view until the bids are opened.",

// src/lib/scope/audit-view.ts: signature unchanged. Its versionNo == null branch returns WITHHELD_TEXT.
export function historyChange(entity: string, change: FieldChange, versionNo: number | null): FieldChange;

// src/components/ui/matrix.tsx: one pure function, used by Matrix for Table's minWidth
export const HEAD_WIDTH = 168;   // unchanged unless step 2 finds evidence
export const COLUMN_MIN = 176;   // unchanged unless step 2 finds evidence
export function matrixMinWidth(columnCount: number): number; // HEAD_WIDTH + COLUMN_MIN * Math.max(columnCount, 1)
```

## 4. Steps

### Step 1. The words (domain-engineer)
- **Before any edit:** check whether a scratch login exists. That means a server on a port other than 3000, on a database other than
  `perolehan`, with a sign-in whose credentials are available without creating or resetting a role. If one exists, take the before
  snapshot: `node scripts/text-snapshot.mjs <scratchpad>/n3-before http://localhost:<port>` plus the exercise's History, the Scope and
  estimate tab and `?tab=bids&section=opening` of a demo exercise. Always pass the base URL. If none exists, take no snapshot. Log that
  it is owed (J6).
- **Edits:**
  - Apply section 3 in `labels.ts`, `audit-view.ts` and `read.ts`.
  - Reword the comments that repeat the old words: `audit-view.ts:5,104`, `read.ts:9`,
    `src/app/sourcing/[id]/scope/actions.ts:68` and `estimate-section.tsx:18-19`.
- **Tests:**
  - Update `labels.test.ts:53` and `audit-view.test.ts:7-25` to the new words, each with a comment citing "ruling 20cw (b), AC-63".
    Every existing assertion keeps its strength.
  - Add:
    - (a) `historyChange(..., null)` gives `WITHHELD_TEXT`;
    - (b) a stored row whose `after` is `"Sealed (version 2)"` renders as `withheldVersion(2)`, which proves old rows are relabelled on
      the History;
    - (c) none of `WITHHELD_TEXT`, `withheldVersion(3)` or `scopeFaultText("SEALED")` matches `/\bsealed\b/i`. These three values are
      named explicitly, so `sealedLodgementAudit`'s true words are not caught;
    - (d) `sealedLodgementAudit` still says "Sealed under the exercise key".
- **Decisions log:** copy J1-J6 from section 5 into `docs/notes/decisions-log.md` as `- 2026-10-19 · ...` lines, in their own commit.
- **Done when:**
  - `grep -rn "sealedVersion\|SEALED_TEXT\|Sealed (version" src` finds only the test fixture in (b).
  - `npx vitest run src/lib/scope src/lib/bids/online src/lib/method` passes, and `NODE_OPTIONS=--max-old-space-size=14000 npm run check`
    passes.
  - The log lines are committed.

### Step 2. The Matrix width at 1440, proved in the shared component (design-system-engineer)
- **Find out first whether the cut still happens after `4df909c2`.**
  - With a scratch server (step 1's check), look at a four-offer opening matrix at 1440. Measure the table's `scrollWidth` against
    the wrapper's `clientWidth`.
  - Without one, decide from code alone what forces a cell wider than its column under `table-fixed`.
- **Edits:**
  - Add `matrixMinWidth` (section 3) and use it in `Matrix`.
  - Remove the inert `minWidth` on `<col>`, or replace it with a real width.
  - Change `HEAD_WIDTH` or `COLUMN_MIN` only on measured evidence. A constant moved without evidence would swing back against a fix
    made hours ago.
  - If cell content causes the overflow, fix it in the shared `Matrix`'s `Td` (wrapping: `min-w-0`, `break-words`, `whitespace-normal`
    on its contents) or in the shared `Button`, never in `opening/matrix.tsx`.
- **Tests:**
  - New `src/components/ui/matrix-width.test.ts`:
    - `matrixMinWidth(4) <= 1037`, computed from named numbers. Each number's source line is asserted present by reading
      `app-shell.tsx` (`lg:pl-68`, `lg:px-8`) and `card.tsx` (`sm:px-6`).
    - `matrixMinWidth(0) === matrixMinWidth(1)`.
  - In `matrix-screen.test.ts`, render a four-offer matrix. jsdom does no layout, so assert only what markup can show:
    - no cell holds a fixed `w-[`/`min-w-[` wider than `COLUMN_MIN`;
    - every long text node (a refusal, a file name, the `SHA-256` line) sits in an element that wraps (`break-words`, `break-all` or
      `whitespace-normal`).
    - The shared `Button` (`src/components/ui/button.tsx:10`) is `whitespace-nowrap max-w-full` by design. Short control labels (Pass,
      Reject, Download, Confirm) are exempt by name. Do not change `Button` for N3.
    - If an existing pin forbids this, update it citing AC-63.
- **Done when:**
  - Those tests pass, and `npx vitest run src/components/ui src/app/sourcing/[id]/opening` passes.
  - If no rendered look was possible, the log says so in one line, together with the product-owner question J5.
  - `npm run check` passes.

### Step 3. Reviewer run 1, and the shared-component findings (design-system-engineer)
- **The runs.** Run `ui-guidelines-reviewer` twice, as two reports:
  - (i) `src/app/sourcing/**`, the exercise page, opening and matrix first;
  - (ii) `src/app/projects/**`.
  - Launch `ui-guidelines-reviewer` if you can. If you cannot, read `.claude/agents/ui-guidelines-reviewer.md`, apply its checklist
    under the brief below, and record in section 6 that this run was self-applied. Step 5 is a different agent, so run 2 stays
    independent.
- **The brief.** Give it the same brief for this run and for step 5:
  - The product is desktop only (1280 and 1440). Rules about 390 px, 44 px mobile targets and 16 px mobile inputs do not apply, and are
    not findings.
  - The Malay layer (N1) covers only the shell, dashboard, inbox and the Contracts case list and case page. A missing Malay label
    elsewhere is recorded as carried, not fixed.
  - Report a rule broken in `src/components/ui`, `tabs.tsx` or `data-list.tsx` once, against the component.
  - Never ask for a `dark:` variant or an icon package.
- **Record.** Write every finding into section 6 of this file: id, Must or Should, `file:line`, owner (shared or screen), and status.
- **Fix** every Must and Should whose owner is a shared component, one commit per component, each with a test in the style of
  `src/components/ui/dialog-focus.test.ts`.
- **Record, do not fix,** with a reason:
  - a finding that needs customer policy, Malay text, a deferred feature (MFA, payments, Contracts Part B, wave P) or a change to data;
  - such a finding becomes a product-owner question in the log.
- **Done when:**
  - Section 6 lists both reports' findings.
  - Every shared-owner Must or Should is fixed or recorded with a reason.
  - `npx vitest run src/components` and `npm run check` pass (check-ui included).

### Step 4. The screen findings (frontend-engineer)
- **Fix** every remaining Must and Should in section 6 whose owner is a screen under `src/app/sourcing/**` or `src/app/projects/**`.
  - Use the shared pieces only.
  - Words go in the label source, not inline.
  - Codes never reach the screen.
- **Commit** one commit per screen area (exercise, opening, scope, window, bids, projects case, award). Mark each finding's status in
  section 6 with its commit.
- **Tests:** where a fix is behaviour (an accessible name, a focus return, a disabled state with a reason), add an assertion to that
  area's existing screen test. A purely visual class change needs no new test. Never weaken an existing test.
- **Done when:**
  - Every screen-owner Must and Should in section 6 is fixed or recorded with a reason.
  - `npx vitest run src/app/sourcing src/app/projects` passes, and `npm run check` passes.

### Step 5. Reviewer run 2 and close-out (test-engineer)
- **Rerun** the reviewer over the same two scopes with step 3's brief, word for word. Add any new finding to section 6 and send it back
  to step 3 or 4.
- **Snapshot.** With a scratch login (step 1), take the after snapshot with the same routes and base URL, and diff it against before.
  The only differences may be the intended word changes and step 4's labelled fixes. Without one, the log line from step 1 stands as
  owed.
- **Gates:** run `npm run test:db` only if a fix touched a loader or an act. `holding-edit.db.test.ts` is a known scratch-data failure.
- **Backlog:** mark the backlog row N3 done (and backlog.md:75's open half, the history label) with the commit range.
- **Done when:**
  - Run 2 reports no open Must or Should.
  - `node scripts/check-ui.mjs` passes, `NODE_OPTIONS=--max-old-space-size=14000 npm run check` passes, and
    `powershell -NoProfile -File scripts/test-linux.ps1` passes before the last commit.
  - The log records the result.

## 5. Judgement calls (step 1 copies these into the decisions log)

- **J1.** `SEALED_TEXT` and the `SEALED` fault text are reworded with `sealedVersion`. They are in the same file, carry the same
  overclaim and fall under the same ruling. The estimate tab's chip reaches the screen through `read.ts`, which the 20cw (b) source
  scan never read. The constants are renamed (`WITHHELD_TEXT`, `withheldVersion`) so the code says what is true too.
- **J2.** The words are "Withheld from view, held unencrypted (version N)" and the bare "Withheld from view, held unencrypted",
  following 20cw (b) and the estimate tab's existing sentences.
- **J3.** Stored `AuditEntry` rows are not rewritten, because they are immutable and rewriting them would be a data change. The
  exercise's History relabels old rows through `historyChange`. Other readers, such as Configuration › Audit, the `AuditExport` and the
  project record pages, show a pre-change row as it was written. Product-owner question: should those readers apply `historyChange`
  too?
- **J4.** Product-owner question, not changed in N3: the same overclaim in `src/lib/evaluation/report.ts:204,260` (`"Sealed"` against
  the estimate) and `src/lib/auth/sulit-access.ts:363` ("stays sealed", English and Malay; the Malay needs RSAJ's review).
- **J5.** The shared Matrix minimums were already narrowed in `4df909c2`. On arithmetic, four columns need 872 of about 1037 px. Without a
  rendered look, N3 pins the width and the cell wrapping, and does not move a constant. Product-owner question: is the 1440 item met by
  `4df909c2`, with the look owed?
- **J6.** The text snapshot is owed unless a scratch login exists. One is not made by creating or resetting a role (AC-63: not worked
  around), and the snapshot never runs against port 3000.

## 6. Reviewer findings

Filled in by step 3. Columns: id · Must/Should · file:line · owner (shared/screen) · status (fixed in `<commit>` / recorded: reason).
