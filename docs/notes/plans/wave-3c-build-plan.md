# Wave 3c — the SR-14 opening checklist, and what SR-15 still needs online: build plan

**Status (2026-10-17):** Proposed by the solution architect. NOT BUILT. SR-14 (matrix, every-officer Pass or Reject) and SR-15 online: not started. Only the interim guards of commit 3c928710 exist. Waiting on the precondition below, S9, and 3c-Q1 to 3c-Q9.

**Sources.**
- **Requirement:** SR-14 and SR-15 in `docs/requirements/sourcing-v2-media/Sourcing_Requirements_v2.txt`, with figures 13 and 14
  (`image13.png`, `image14.png`). The figures are illustrations (ruling 24).
- **Rulings:** 18, 20, 22–25 and 20at onward, including the close-out rulings 20bn–20cl, all in
  `docs/notes/design/0003-sourcing-requirements-v2.md` §6.
- **Inputs from wave 3b:** ADR 0036, and §3 of `docs/notes/plans/wave-3b-build-plan.md`.
- **Spec:** FR-OPN-005..010, FR-BID-007, FR-EST-010.

**Precondition: no step starts until it is met.** Ruling 20bv requires step 20's security record before wave 3c builds. That record is a
security-auditor walk of `signin-threat-model.md` §G against the tree:
- each item is named MET or NOT MET;
- S9 is ruled (20bh);
- every NOT MET item goes into `docs/notes/backlog.md`.

Writing it is not a step of this plan, because the security-auditor is not a build agent. Step 1 checks that it exists and stops if it
does not (20cl: no step 20 report exists today).

## 0. What exists today, clause by clause

| Clause | State | Where |
| --- | --- | --- |
| Checklist frozen at the start: mandatory returned parts plus addenda (FR-OPN-008) | exists, both channels | `src/lib/opening/checklist.ts`, `startOpening` (`opening/actions.ts:172`) |
| Tri-state answer, per offer and item | exists | `OpeningChecklistAnswer`, `recordChecklistAnswer` |
| Initial per panel member per offer (FR-OPN-006); goes stale only on an as-read correction | exists | `OpenedBidInitial`, `src/lib/opening/initials.ts` |
| PASS/REJECT, the completeness switch respected (`REJECT_ON_COMPLETENESS_NOT_PERMITTED`) | exists, pin only | `src/lib/opening/verdict.ts` |
| Evaluation takes only PASS bids of finalised openings | exists, pin only | `src/lib/opening/carry.ts` |
| Only SR-07 officers act on answers and verdicts | **build** | `recordChecklistAnswer` and `recordVerdict` check no person: any staff with TRANSACTION can act. `recordInitial` checks the panel (`markFaults`) but takes a recorded-on-behalf initial |
| Pass/Reject needs every named officer | **build** | today a single actor records the verdict, and an initial taken before it still counts |
| Box-lock check skipped online | exists, pin only | `unseal.ts:54` (`!i.online`) |
| No typed figures online | exists, pin only | `openEnvelope` (`ONLINE_ENVELOPE_OPENED_BY_UNSEAL`), `correctAsRead` (review S6), `recordAuthorisation` (`ONLINE_AUTHORISE_ELSEWHERE`) |
| Opening-check flag on part kinds (ruling 23) | exists | `TenderDocumentPart.openingCheck` and its provenance, the Configuration › Tender documents editor, frozen into `SourcingExercise.onlineBidRules` at publication (`bidRulesFrom`), read by `grantPlan` |
| The three names only in a seed | exists | `prisma/demo-online.ts:229` marks the roles FORM_OF_TENDER, SUMMARY_AND_RATES and DECLARATION. The setup script names none |
| Officer's download of an opening-check file, unseal → finalise | exists | `src/components/sealed-file-download.tsx`, `POST /api/opening/sealed-file`, the `FilesToCheck` list |
| Download after finalising, through the filed document (20cl) | **build** | the sealed route refuses with `FINALISED_USE_DOCUMENTS`. `ensureFileMoved` exists (`src/lib/sealing/online-file-mover.ts`) |
| Matrix layout: a column per bid, a row per item | **build** | today `OffersRead` (`opening/lists.tsx`) has one row per offer, with Checklist, Verdict and Initial drawers |
| SR-15 CSVs (Jadual Tawaran and Grand Summary), after finalising only, both channels | exists | `src/lib/opening/download.ts`, `opening/download/[kind]/route.ts`, the buttons on the **Schedule** section |
| SR-15 online figures: declared price and period written at finalising | exists | `finaliseOnline`, `declaredWrite`. `online-finalise.db.test.ts:383` checks the snapshot only |
| SR-15 end-to-end online (the CSV matches the screen, the alternative's row, the estimate row, Kelas) | **test** | no test yet |
| "Class as read" on an online row | **build (words)** | `unseal-store.ts:319` writes `""`, which renders "—" |
| Ruling 25: My Bids says "Opened; the result follows the evaluation" and never shows the verdict | exists, pin only | `src/lib/bids/online/roll.ts:74`, `src/lib/portal/bids/standing.ts` |
| Online alternative gets `alternativeStatus` at the unseal | exists | `unseal-store.ts:314` (`alternativeOf`), so `ALTERNATIVES_NOT_STATED` cannot deadlock it. Step 4 proves it end to end |

**Carried from the close-out (20ck, 20cl):**
- 20br, a deterministic online `publishWindow` test, is step 1;
- 20cl, the demo test asserts instead of skipping, is step 1;
- 20bn, the loader-judges scan, is step 1;
- 20bq, the `unwrapKey` pin, is step 1;
- 20ce (a) is step 2;
- 20bp and 20bo are step 6;
- 20bt, the closing UI pass and the focus trap, is step 7.

The backlog keeps 20bo's CHECK, 20bs, 20bu, 20bw, 20cb's words, 20ch, 20ci (a) and the mover's scheduler (20by). Wave 3c builds none of them.

## 1. Target behaviour

### 1.1 The matrix (both channels)

The Opening section shows **one matrix per opening** once that opening has opened bids, after the unseal on both channels.

**Columns.** One column per `OpenedBid`, in listing order. The head of each column shows:
- "n/N", where n is the listing number and N the opening's count;
- the bidder's name as read;
- "Alternative to No. k" for an alternative;
- online only, the receipt digest from `Opening.receiptRoll` for the bid's sequence. A missing digest reads "No receipt digest on the roll".

**Rows.**
- One row per item of the **frozen** checklist (`Opening.checklistSnapshot`), in its order.
- Then three summary rows, matching figure 13:
  1. **Checklist result.** "3 of 3 present", "2 of 3 present · 1 absent", "1 not answered". It never says "Pass", because Pass is the
     decision.
  2. **Decision.** Pass or Reject, recorded by a named officer. The Reject reason shows under the decision. The row's sub-line says
     "Stands when every named officer has confirmed this column". The word "committee" is not used (see question 3c-Q6).
  3. **Confirmations.** For each named officer: confirmed, awaiting, or "confirmed before a change: confirm again". There is a "Confirm
     this column" action for the signed-in officer.

**Cells.** Each cell has an answer control with three states (Present, Absent, Not applicable), shown as the current answer or "Not
answered". It also has the cell's file affordance (§1.2).

**Paper.** Paper keeps its frozen checklist and its as-read acts. Ruling 22's "Only the SR-07 officers act" and "Pass or Reject needs
both named officers" are sentences of their own, not limited to online, and SR-07's Done-when names no channel, so §1.3 applies to paper
too. G3 governs where old acts are offered; it does not exempt them from new rules. Paper is also not only legacy: a new exercise can
still pin PAPER (the demo's paper fallback).
- Paper cells have no file affordance: the paper is in the envelope.
- The matrix replaces the Checklist and Verdict drawers of `OffersRead`, and holds the confirmations.
- `OffersRead` keeps the as-read columns and the paper acts: open, correct, alternative.
- A paper initial may still be **recorded on behalf** of a present panel member (Phase 2b), because a paper initial is a physical mark on
  the schedule (question 3c-Q3). An online one may not.

### 1.2 What a cell offers (online)

`cellFacts` (§3.1) classifies each cell **from the frozen rules only** (`SourcingExercise.onlineBidRules`), never from live
`TenderDocumentPart` (G1).

| Cell kind | When | Before finalising | After finalising |
| --- | --- | --- | --- |
| `CHECK_FILES` | the part's frozen rule says `openingCheck`, and the bid holds one or more files for it | the shared `SealedFileDownload` per file, **named officers only, never administrators** (20at, 20au). Others see "Opened only by the named opening officers" | per file, a "Download" form that posts to `POST /api/opening/filed-file` (§4.2), which files it with `ensureFileMoved` and then serves the filed version. The plain hash (the filed version's SHA-256) is shown under it. A file that cannot be filed yet shows the mover's words, never a dead control (20cl) |
| `RECEIVED_NOT_CHECKED` | a returned part not marked `openingCheck`, with a file received | "A file was received. It is not opened at the opening, only at finalising" | the same as `CHECK_FILES` after finalising, but only for readers the version route admits |
| `NOT_RECEIVED` | a returned part with no file in the bid | "No file was received for this part" | the same |
| `ADDENDUM` | an `addendum:<n>` item | "Acknowledged on the portal on <date>", or "Not acknowledged on the portal", read from `AddendumAcknowledgement` for the bid's supplier | the same |

**Answers.** The answer on a non-download row rests on the receipt record shown in the cell. One answer is refused: **Present on
`NOT_RECEIVED`** (`NO_FILE_RECEIVED`). An officer cannot certify a document that never arrived. Every other answer stays the officers'
judgement, and the completeness switch decides what an Absent does (`verdict.ts`, unchanged).

**Why rows are not cut down to the flagged parts (ruling 23 against FR-OPN-008).** Ruling 23 decides which documents the officers
**open**. FR-OPN-008 still requires the opening to record every mandatory returned document. The supplier is told "the opening will record
it as missing" (`bids/online/words.ts:167`), so dropping unflagged parts would break that promise. This is the conservative reading, logged
as question 3c-Q1.

### 1.3 Who may act, and when (both channels)

- **Answers, decisions and confirmations** belong only to a **named opening officer** of the opening, meaning a present panel member
  seated from the SR-07 roster (online: every named officer, 20ay). Never an administrator. Refusals come in words, before anything is
  written.
- Answers and decisions are the officer's **own act** on both channels. A confirmation is the officer's own act online; on paper it may
  be recorded on behalf of a present panel member, as today (3c-Q3).
- **Pass or Reject needs every named officer.** An officer's initial is their confirmation of the column (ruling 22). It counts only
  for the column's current revision.
  - Every answer change, every recorded decision and every decision cleared raises `OpenedBid.columnRevision` in the same transaction.
  - An initial records the revision it confirmed.
  - A confirmation is refused while any item is unanswered or no decision is recorded (`COLUMN_NOT_ANSWERED`,
    `DECISION_NOT_RECORDED`). An officer confirms a complete column.
  - Both finalises (paper and online) count only confirmations on the current reading and the current revision. `INITIAL_MISSING`
    then names the officer still to confirm.
  - On paper this changes the order of work: the initial now comes after the decision. Paper openings already in progress keep their
    rows; their initials stand at revision 0 until the column next changes.
- Recording a decision stays one officer's act, as it is today. The decision stands only once every named officer has confirmed. The
  column reads "Awaiting confirmation" until then, and finalising is refused.

### 1.4 Who sees what

The phases below are those of one opening. 20ax applies to a supplementary opening's late bid.

| Viewer | Before the unseal | Unseal → finalise | After finalising |
| --- | --- | --- | --- |
| Named opening officer | no matrix (no `OpenedBid`). Received rules (18, 20u) | the matrix with names, answers, decision and confirmations, and the downloads of `CHECK_FILES`. **No price, no period, no declared figure** | the matrix read-only, with the filed downloads |
| Other staff on the exercise | no matrix | the matrix as `OffersRead` shows it today (names, answers, decisions), with no file control | the matrix read-only. Filed downloads are gated by the version route's SULIT entitlement |
| Administrator | no matrix | as other staff. Every act and download is refused | refused at `filed-file` |

### 1.5 SR-15 online

- The two CSVs and the Schedule section's tables stay the frozen snapshots (ruling 24).
- Online, the "Class as read" cell reads "Not typed: an online bid", through one pure function used by the screen, the print page and
  the CSV. The register Kelas column is unchanged.
- The Received section gets a pointer once the opening is finalised (SR-15 "Where: Received"). It is a callout with the same two
  download buttons and "Open the schedule". The tables stay on Schedule, as wave 3a built them (question 3c-Q7).

## 2. Data model (one migration, step 3)

```prisma
model OpenedBid {
  // …existing…
  /// SR-14 (ruling 22): raised by every checklist answer that changes, every decision recorded and every decision cleared on this offer, in the same transaction. An online confirmation counts only on the revision it was taken on.
  columnRevision Int @default(0)
}

model OpenedBidInitial {
  // …existing…
  /// SR-14 (ruling 22): the offer's `columnRevision` when this confirmation was recorded or renewed.
  columnRevision Int @default(0)
}
```

- **No backfill.** Both columns default to 0, so every existing initial stands exactly as before.
- **One trigger.** `public.opened_bid_column_revision_forward()` runs BEFORE UPDATE OF `"columnRevision"` ON `"OpenedBid"` and refuses
  any change that is not exactly +1. The function is `SET search_path = pg_catalog, public, pg_temp` and its body is schema-qualified.
- **No grant changes.** Neither table is in `APPEND_ONLY_TABLES`. Step 3 confirms this in `src/lib/auth/db-role.ts`.
- **No new decision table.** The decision stays `OpenedBid.verdict` (SR-14 map (4)).

## 3. Pure rules and their contracts (step 2 writes these verbatim; every file has a `.test.ts`)

### 3.1 `src/lib/opening/matrix.ts`

```ts
import type { ChecklistItem } from "./checklist";
import type { ChecklistAnswer, Finding, OpeningVerdict } from "./types";
import type { BidPartRule } from "@/lib/bids/online/types";

export type CellKind = "PAPER" | "CHECK_FILES" | "RECEIVED_NOT_CHECKED" | "NOT_RECEIVED" | "ADDENDUM";

export interface CellFacts {
  itemKey: string;
  kind: CellKind;
  /// CHECK_FILES and RECEIVED_NOT_CHECKED: the bid's files for the item's part, in upload order. Otherwise empty.
  fileIds: readonly string[];
  /// ADDENDUM on an online opening: the day the bidder's supplier acknowledged it on the portal; null: not acknowledged. Otherwise null.
  acknowledgedOn: string | null;
}

/// One bid's cells, one per frozen checklist item, in the checklist's order. Paper: every cell PAPER. Online: by the FROZEN rules (G1), never the live part configuration.
/// An item whose part has no frozen rule, or whose part code is not in the pack, is NOT_RECEIVED when the bid holds no file for it and RECEIVED_NOT_CHECKED otherwise (the narrower use, as `grantPlan`).
export function cellFacts(i: {
  online: boolean;
  items: readonly ChecklistItem[];
  /// The pack's parts: the checklist keys parts by code, the rules and files by pack part id.
  packParts: readonly { id: string; partCode: string }[];
  rules: readonly BidPartRule[];
  files: readonly { fileId: string; packPartId: string }[];
  /// Addendum number → acknowledgement day (ISO), for this bid's supplier.
  acknowledgements: ReadonlyMap<number, string>;
}): CellFacts[];

export type CellAnswerFault = "NO_FILE_RECEIVED";
/// Online only: Present is refused on a part no file was received for. Paper and every other cell: no fault.
export function cellAnswerFaults(cell: CellFacts, answer: ChecklistAnswer): Finding<CellAnswerFault>[];

export interface ColumnTally { present: number; absent: number; notApplicable: number; unanswered: number; total: number }
export function columnTally(items: readonly ChecklistItem[], answers: ReadonlyMap<string, ChecklistAnswer>): ColumnTally;
/// "3 of 3 present", "2 of 3 present · 1 absent", "1 of 3 not applicable", "1 not answered". Never "Pass" or "Fail" (the overclaim scans hold this).
export function tallyText(t: ColumnTally): string;

export interface ColumnFacts { asReadCorrections: number; columnRevision: number }
export interface ConfirmationFacts { personId: string; correctionNo: number; columnRevision: number }

/// Both channels: taken on the current reading (`initialStale` as built) AND on the current column revision.
export function confirmationStands(online: boolean, bid: ColumnFacts, c: Pick<ConfirmationFacts, "correctionNo" | "columnRevision">): boolean;
export const standingConfirmations: <C extends Pick<ConfirmationFacts, "correctionNo" | "columnRevision">>(online: boolean, bid: ColumnFacts, cs: readonly C[]) => C[];

export type ColumnStatus = "ANSWERING" | "AWAITING_DECISION" | "AWAITING_CONFIRMATION" | "CONFIRMED";
export function columnStatus(i: {
  online: boolean;
  tally: ColumnTally;
  verdict: OpeningVerdict | null;
  bid: ColumnFacts;
  officers: readonly { personId: string; name: string }[];
  confirmations: readonly ConfirmationFacts[];
}): { status: ColumnStatus; confirmed: { personId: string; name: string }[]; awaiting: { personId: string; name: string }[]; stale: { personId: string; name: string }[] };

export type MatrixActorFault = "ADMINISTRATOR" | "NOT_A_NAMED_OFFICER" | "NOT_OWN_ACT";
/// Both channels: the actor is not an administrator, and the subject is a present panel member of this opening. NOT_OWN_ACT where the subject is not the actor,
/// except a paper confirmation (`act: "CONFIRM"`, not online), which may be recorded on behalf of a present panel member (3c-Q3).
export function matrixActorFaults(i: { online: boolean; act: "ANSWER" | "DECIDE" | "CONFIRM"; administrator: boolean; actorPersonId: string; subjectPersonId: string; officers: readonly string[] }): Finding<MatrixActorFault>[];

export type ConfirmFault = "COLUMN_NOT_ANSWERED" | "DECISION_NOT_RECORDED";
/// Both channels: a confirmation needs every item answered and a decision recorded.
export function confirmFaults(i: { tally: ColumnTally; verdict: OpeningVerdict | null }): Finding<ConfirmFault>[];

export const MATRIX_FAULT_TEXT: Readonly<Record<CellAnswerFault | MatrixActorFault | ConfirmFault, string>>;
export const CELL_WORDS: Readonly<Record<CellKind, string>>; // staff-facing English; no code reaches a screen
```

### 3.2 Smaller pure changes

- **`src/lib/opening/download.ts`.** Add `classAsReadText(value: string, online: boolean): string`. Online returns "Not typed: an online
  bid", and paper returns `readText(value)`. The screen, `opening/print/page.tsx` and `openingCsv` all use it, so the three cannot drift.
  `DownloadOpening` gains `online?: boolean` (optional, read as false, so step 2 changes no caller). Step 4 wires it from the
  exercise's pinned channel.
- **`src/lib/opening/filed-file.ts`.** Add `filedFileFaults(i: { administrator: boolean; finalised: boolean; fileOnOpening: boolean;
  checked: boolean }): Finding<"ADMINISTRATOR" | "NOT_FINALISED" | "NOT_ON_THIS_OPENING" | "NOT_AN_OPENING_CHECK_FILE">[]`. Add
  `FILED_FILE_WORDS`: one sentence per fault, and one per `MoveResult` FAILED code (`CLASS_NOT_SET`, `STORE_NOT_BUILT` and the rest).
- **20ce (a), built in the review fixes of 2026-10-17.** The pure `exposureOf`, its words (`EXPOSURE_WORDS`) and `deactivationGate` live in `src/lib/sealing/deactivation.ts`, tested in `deactivation.test.ts`; only the loader `loadHolderExposures` is in `src/lib/sealing/substitution-store.ts`. They list a named officer of a
  finalised main opening while a late bid admitted to it still waits for its supplementary opening, which needs every named officer
  (20az). Add the words for it, and a test.

## 4. Acts, reads and the route (step 4)

### 4.1 The actions in `src/app/sourcing/[id]/opening/actions.ts`

All of the following lives in the actions' existing transactions. Each refusal comes in words through `MATRIX_FAULT_TEXT`.

- **`recordChecklistAnswer`.**
  - It runs `matrixActorFaults` (act ANSWER, subject = actor) on both channels, and online `cellAnswerFaults` (the cell from
    `cellFacts`), before anything is written.
  - When the answer changes, it raises `columnRevision` by 1, on both channels.
  - An existing decision is cleared as today. That clearing is the same change, so the revision is not raised a second time.
- **`recordVerdict`.**
  - It runs `matrixActorFaults` (act DECIDE, subject = actor) on both channels.
  - It raises `columnRevision` by 1, on both channels.
  - The audit row is unchanged.
- **`recordInitial`.**
  - It runs `matrixActorFaults` (act CONFIRM, subject = `act.subjectPersonId`) and `confirmFaults` on both channels.
  - It stamps `columnRevision` on create and on renewal.
  - "Already" is judged by `confirmationStands`, which replaces `initialStale` here.
- **`finalise-transaction.ts:86` and `read.ts:229/307`.** Replace `freshInitials` with `standingConfirmations(online, …)`.
- **Unchanged:**
  - the online signature door (`signOnlineFinalise`);
  - the price acts, which are already refused online;
  - the paper as-read acts (open, correct, alternative), the paper signature and the paper finalise's other faults.

### 4.2 `POST /api/opening/filed-file`, the cell download after finalising (20cl)

- **Request.** Form fields `exerciseId`, `openingId` and `fileId`.
- **Order of checks:**
  1. `staffRoute`;
  2. the SEC-4 `downloadRequestFault`;
  3. administrator: 403;
  4. `exerciseIsHidden`: 404;
  5. `filedFileFaults` against the opening, the opened bid and the frozen rules;
  6. `ensureFileMoved(organisationId, fileId)`;
  7. the file's `DocumentAttachment`, then its latest version.
- **Responses:**
  - success is **303** to `/api/documents/versions/{versionId}`, which applies the SULIT entitlement and logs the download as today;
  - a mover failure is 409 with the `FILED_FILE_WORDS` sentence for its code.
- **Other methods.** `HEAD` is 405 (SEC-4), and nothing else is exported.
- **Scans.** The route joins the table in `src/lib/sealing/admin-refused.db.test.ts`. `sealed-doors.test.ts` pins the callers as they
  stand on 2026-10-17 plus this route: `ensureFileMoved` is called only from `src/lib/sealing/online-file-mover.ts` and
  `src/app/api/opening/filed-file/route.ts`; `moveReleasedFiles` only from `src/app/sourcing/[id]/opening/online-finalise-actions.ts`
  (the post-commit move and "File them now").
- No page render calls `ensureFileMoved`, because a read must not write during render.

### 4.3 The read model, `src/lib/opening/matrix-read.ts`

`openingMatrix(organisationId, exerciseId, openingId, viewer: { personId: string | null; administrator: boolean }): Promise<MatrixView | null>`
returns:

```ts
export interface MatrixView {
  online: boolean;
  phase: "CHECKING" | "FINALISED";
  rows: { key: string; label: string; opened: boolean /* online: an opening-check part */ }[];
  columns: {
    openedBidId: string; listingNo: number; of: number; bidder: string; alternativeOf: number | null;
    receiptDigest: string | null;            // online only
    cells: (CellFacts & { answer: ChecklistAnswer | null; filed: { fileId: string; versionId: string | null; plainSha256: string | null }[] })[];
    tally: ColumnTally; tallyText: string;
    decision: { verdict: OpeningVerdict; label: string; reason: string } | null;
    pass: Allowed; reject: Allowed;          // from the same verdictFaults the VerdictDrawer reads today
    confirmation: { status: ColumnStatus; confirmed: string[]; awaiting: string[]; stale: string[]; mine: Allowed | null };
    answer: Allowed;                         // may this viewer record answers in this column
  }[];
  viewerIsNamedOfficer: boolean;
}
```

The view holds **no price, period or declared field**. Step 4 adds a source scan, `matrix-no-price.test.ts`: neither `matrix-read.ts` nor
the matrix components select or name `priceAsRead`, `completionPeriod`, `completionUnit`, `openingPrice` or a declaration (wave 3b
§3).

## 5. Steps

Each step has these gates before its commit:
- `NODE_OPTIONS=--max-old-space-size=14000 npm run check`;
- `npx vitest run` on the directories it touched;
- `npm run test:db` where database behaviour changed;
- the full Linux suite before the last commit of the wave;
- its own commit, with a new message file and only its own paths staged.

### Step 1 — the close-out pins (test-engineer)

**Gate.** `docs/notes/decisions-log.md` holds the step 20 security record (20bv). If it does not, stop and report.

**Builds:**
- **20br.** A new `src/lib/window/publish-online.db.test.ts`, with its fixture in `src/lib/window/online-publish.fixture.ts`.
  - The test's own organisation gets editor-settable configuration only: a calendar whose `weekendDays` is empty and with no holiday on
    the test day, the notice template, the channels, an evaluation model, the window policy, the sealing switch for a demonstration
    deployment, and the roster with shares made by the product's ceremony functions.
  - It publishes through the real `publishWindow`.
  - It asserts the freeze (`onlineBidRules` and the channel), the key fingerprint, the key and shares existing before ADVERTISED, and
    trigger 11's refusal.
  - It runs on every day.
- **20cl.** `src/lib/demo/demo-additive.db.test.ts` no longer skips. On a paper-fallback day it asserts the channel PAPER, no
  `OnlineBid`, and the fallback reason given in words.
- **20bn.** A new `src/lib/demo/demo-online-judges.test.ts`, a source scan of `prisma/demo-online.ts`.
  - It imports and calls `shareFaults`, `submitFaults`, `uploadGateFaults`, `sealedLodgementFaults`, `sealSubmission`, `sealFile`,
    `makeOfficerKey` and `writeSealedLodgement`.
  - It imports nothing from `node:crypto` except `randomUUID`, and calls no cipher or HPKE primitive directly.
- **20bq.** In `src/lib/sealing/sealed-doors.test.ts`, `unwrapKey` is called only from `src/lib/sealing/unlock-store.ts`.
- **Ruling 25 pin, if none exists.** No module under `src/app/supplier`, `src/lib/portal` or `src/lib/bids/online` reads
  `OpenedBid.verdict`.

**Done when** all of the following hold:
- the five tests pass, with no `skip`, `todo` or day guard;
- the 20br test holds no day check of its own: the fixture's calendar makes the test day a working day whatever day it runs (20cl);
- no product file changed.

### Step 2 — the pure rules and contracts (domain-engineer)

**Builds:**
- `src/lib/opening/matrix.ts` with `matrix.test.ts`, exactly as §3.1;
- `classAsReadText` in `download.ts`;
- `src/lib/opening/filed-file.ts` with its test;
- 20ce (a): done (pure rule in `deactivation.ts`, loader in `substitution-store.ts`).

**Tests cover:**
- every `CellKind`;
- a part with no frozen rule;
- the live configuration ignored;
- an alternative's files;
- addenda acknowledged and not acknowledged;
- `NO_FILE_RECEIVED` online only;
- the tally words for each mix, plus a scan that `tallyText` and `CELL_WORDS` hold no "Pass", "Fail" or "Lulus";
- `confirmationStands` on paper (reading only) and online (reading and revision);
- `columnStatus` through all four states, with a stale confirmation;
- `matrixActorFaults`: administrator, not named, on behalf (refused online and for answers and decisions on paper; allowed for a paper confirmation);
- `confirmFaults`.

**Done when:**
- the contracts match §3 verbatim, or a changed name is written back into §3 in the same commit;
- `npx vitest run src/lib/opening src/lib/sealing` passes;
- no action, route or screen changed.

### Step 3 — the column revision (data-modeler)

**Builds:**
- the §2 schema change and a migration timestamped above `20261108000000`, with the forward-only trigger (hand-written SQL, no `;`
  inside comments);
- applied to `perolehan_native_check` first, then to `perolehan`;
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` is empty, then `npx prisma generate`.

**Tests:** a database test, `opened-bid-revision.db.test.ts`. A +1 update passes; 0, −1 and +2 are refused by the trigger.

**Done when:**
- both databases carry the migration;
- the diff is empty;
- `npm run test:db` is green apart from the known `holding-edit.db.test.ts` failure;
- the log notes that a restart of the dev server is needed for the new client.

### Step 4 — acts, read model, filed download, SR-15 online end to end (api-engineer)

**Builds:** §4.1, §4.2 and §4.3, plus `classAsReadText` wired into `scheduleSection`, the print page and the CSV.

**The shared test helper.** Move `unsealed` and `prepare` from `online-finalise.db.test.ts` into
`src/app/sourcing/[id]/opening/online-opening.fixture.ts` (20cl allows the reuse). Its assertions do not change. Two things in it do
change, citing ruling 22: `prepare` now records answers, then the decision, then the confirmations, and an `alternatives` option lets
one bidder also submit an alternative.

**Database tests**, in a new `src/app/sourcing/[id]/opening/matrix.db.test.ts`:
1. An online answer, decision or confirmation by an administrator, by a person not named, or on behalf of another is refused, and
   nothing is written.
2. Present on a part with no file is refused.
3. A confirmation before the column is complete is refused.
4. A changed answer after both confirmations clears the decision and leaves both confirmations needed again: `finaliseOnline` refuses
   with `VERDICT_UNSET` and `INITIAL_MISSING`, and the way through is decide again, then confirm again.
5. Paper: answers by a present panel member, then the verdict, then the initials (one recorded on behalf) finalise. An answer or verdict
   by a person not on the panel is refused. A paper opening whose rows predate the migration (revision 0 throughout) still finalises.
6. An alternative goes through the matrix to finalise and is carried to evaluation only if it passes.
7. `filed-file`:
   - before finalising, it is refused;
   - after finalising, the first call files the file and returns 303, and a second call does not move it again;
   - an administrator gets 403;
   - a cross-site request writes nothing;
   - `CLASS_NOT_SET` gives words.
8. **SR-15 online.** After `finaliseOnline` with 2 bids, 1 alternative and a sealed estimate, the schedule CSV rows run in opening order
   and carry the declared price and period, the register Kelas (or "No class on the register"), "Not typed: an online bid", and the
   estimate row last. The summary labels follow the decisions, and the CSV rows equal `scheduleSection`'s rows. Before finalising, the
   route returns 409.

**Tests updated to match ruling 22, each change citing it.** Only the order of work changes; no assertion is weakened.
- `src/app/sourcing/[id]/opening/online-finalise.db.test.ts` (`prepare`, through the fixture);
- `src/app/sourcing/[id]/opening/restriction-retake.db.test.ts` (its initials, lines 195-230, come after the verdict);
- `scripts/online-demo-harness.ts` (lines 115-129: answers, verdict, then initials);
- the source scans `src/lib/opening/restriction-online.test.ts` and `src/lib/opening/cancelled.test.ts`, which slice `actions.ts` by
  function markers: keep the markers they slice on;
- any other caller found by `grep -rn "recordInitial(\|recordVerdict(\|recordChecklistAnswer(" src scripts prisma`.

**Done when:**
- the database tests above pass;
- `unseal.db.test.ts` and `src/app/api/opening/sealed-file/route.db.test.ts` pass unchanged, and the tests listed above pass with only the
  order change;
- `admin-refused.db.test.ts`, `sealed-doors.test.ts` and `matrix-no-price.test.ts` pass.

### Step 5 — the matrix on screen (frontend-engineer)

**A shared component.** Add `src/components/ui/matrix.tsx`, built on `Table`, `THead`, `Th`, `Tr` and `Td` from
`src/components/ui/table.tsx`.
- The row heads form a sticky first column.
- Columns are at least 200px wide. With more columns than fit, the card scrolls sideways inside itself, and the page does not. This is
  desktop only, and the component's comment records this one extension.
- It is not a list, so it is not a `DataList`.

**The screen.** `src/app/sourcing/[id]/opening/matrix.tsx` renders a `MatrixView`:
- **Each cell** has a three-way answer control posting `recordChecklistAnswer`, plus the file affordance from §1.2:
  - `SealedFileDownload`, reused and not copied (20at);
  - before finalising, the file controls are shown to named officers only;
  - after finalising, a `FiledFileDownload` form posting to `/api/opening/filed-file`;
  - otherwise the `CELL_WORDS` sentence.
- **Checklist result row:** `tallyText` in a `Badge` (ok when every item is present or not applicable, warn otherwise).
- **Decision row:**
  - Pass posts `recordVerdict` after a confirm;
  - Reject opens the existing `VerdictDrawer`, which asks the reason;
  - each button is disabled with its reason from `pass` and `reject` (the completeness switch's words come through here).
- **Confirmations row:** names, with `Dot` states, and "Confirm this column" posting `recordInitial` for the signed-in officer.

**The workspace (`opening/workspace.tsx`):**
- the matrix replaces `FilesToCheck`, which is removed;
- `OffersRead` loses its Checklist and Verdict drawers, on both channels, and its Initial drawer online;
- `OffersRead` keeps the as-read columns and the paper acts.

**Received.** Once the opening is finalised, Received shows the SR-15 pointer callout from §1.5.

**Comparators (G4).** `scripts/compare-screen.mjs` records the matrix, the removed `FilesToCheck` and the moved drawers, citing SR-14.

**Done when:**
- `npm run check` passes, including `check-ui`;
- `npx vitest run src/components src/app/sourcing` passes;
- the overclaim scans stay green in English and Malay;
- a quick rendered look at 1280 and 1440 on the scratch data shows a paper opening and an online opening, before and after finalising.
  This is not the step 7 check.

### Step 6 — the demonstration, on a fresh database only (data-migration-engineer)

**Builds:**
- **20bp.** In `prisma/demo-online.ts`, one in-time supplier also submits an alternative through the loader's existing `submit(…,
  "ALTERNATIVE", …, { parent })`, judged by `submitFaults`. Received then reads "3 standing in time, one of them an alternative, plus 1
  late".
- **20bo.** The demo guide (README) says that the demonstration's setup rows were written by the loader and carry no sealed-access-log
  rows. It also says how to try SR-14: sign in as each named officer (`demo:accounts`), start the opening, authorise with the printed
  passphrases, then answer, decide, confirm, sign and finalise.

**What the loader does not write.** No answer, decision or confirmation on the online exercise: the loader may not act as a person (20bn).
The online opening is left where wave 3b leaves it.

**The paper demonstration.** `prisma/demo-opening.ts` is unchanged. Its rows keep `columnRevision` 0 and stand.

Everything is inside `demo:load` on a fresh database (12c, 20z), with no write to a database that already holds data.

**Done when:**
- `demo-additive.db.test.ts` asserts the new counts;
- the step 1 judges scan still passes;
- a load into a fresh throwaway database succeeds, and the 20bn child harness still opens the bids with the printed passphrases.

### Step 7 — the closing UI pass, focus trap and rendered check (frontend-engineer)

**20bt, the focus trap.** Fix it once in `src/components/ui/drawer.tsx` for every `CONFIRM_SCRIM` dialog: Tab cycles inside, Escape
closes, and focus returns to the opener. Add a component test.

**The throwaway database.** Create a new database, `perolehan_ui_3c`, with the setup script and then `demo:load`.
- Never use `perolehan` or `perolehan_native_check`.
- Serve it with a second app on another port. Next 16 holds a lockfile against two `next dev` instances in one project, so use `next build` then `next start -p 3100`, with `DATABASE_URL` set explicitly for the setup, `demo:load`, the build and the start (read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, "Concurrent dev and build", first). The running dev server is never stopped.
- Leave the database in place and report its name.

**The rendered check, at desktop widths 1280 and 1440:**
- drive the online demo through the real start and unseal with the printed passphrases;
- capture the matrix before any answer, part answered, awaiting confirmation, after finalising (with filed downloads), and the paper
  demo's matrix;
- capture Received's SR-15 callout and Schedule;
- download both CSVs and check them against the screen.

**The UI checks:**
- the ui-guidelines-reviewer pass over the 3c screens and the wave 3b screens 20bt names;
- the `scripts/text-snapshot.mjs` baseline on that database;
- anything not run is recorded as "not claimed" (20bj).

**The records:**
- decisions-log lines ("- 2026-10-17 · …") for each judgement;
- §6's questions carried into the log;
- this plan's status updated.

**Done when:**
- the full Linux suite (`scripts/test-linux.ps1`) passes;
- the screenshots and the snapshot exist under the scratchpad and are listed in the log;
- the report says whether the running dev server needs a restart. It does after step 3's client change.

## 6. Questions for the product owner (taken conservatively and built as stated; none blocks)

- **3c-Q1.** An online column keeps every mandatory returned part, including parts not marked as opening-check, which the officers answer
  from the receipt record without opening. The alternative reading of ruling 23 shows only the flagged parts. That would drop
  FR-OPN-008's record, and break the supplier's "the opening will record it as missing".
- **3c-Q2.** An addendum row online is answered against the portal acknowledgement, which the cell shows. No file is opened.
- **3c-Q3.** Ruling 22 is applied to both channels: the named-officer door, and a decision that stands only on every present officer's
  confirmation of the current column. The narrower question left: a **paper** confirmation may still be recorded on behalf of a present
  panel member, as Phase 2b allows, because a paper initial is a physical mark. Online it is the officer's own act.
- **3c-Q4.** An online confirmation is a TRANSACTION-class own act with no password. The password-attributed act stays
  `signOnlineFinalise` (20j, 20t).
- **3c-Q5.** Plain hashes are shown per file only after finalising, from the filed version. Before then they are sealed in `FileMeta`, and
  no new decryption door is opened to show them. This amends wave 3b §3's "each column shows the plain hashes" and ADR 0036's
  opening-roll sentence, which carries an amendment note citing this plan. The receipt digest is shown from the unseal.
- **3c-Q6.** The row figure 13 calls "Committee decision" is labelled "Decision", recorded by the named officers. Ruling 24 says the
  officers decide, and 0003 §4 (line 610) leaves "who is the committee at an online opening" open.
- **3c-Q7.** SR-15's tables stay on Schedule (wave 3a). Received gets a pointer with the two downloads. The difference from "Where:
  Received" was not recorded before.
- **3c-Q8.** "Class as read" on an online row reads "Not typed: an online bid", rather than a dash or a removed column.
- **3c-Q9.** Present is refused on a part with no file received. Absent and Not applicable stay the officers' choice everywhere.
