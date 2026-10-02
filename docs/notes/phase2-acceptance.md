# Phase 2 acceptance record

**Dated:** 2026-10-02. **Code state:** `e060f98` on `build-all-modules`. Gates at that commit, run by the lead on 2026-10-02: `npm test` 337 files, 5,709 tests, all passed; `npm run typecheck` clean; `npm run lint` (including `scripts/check-ui.mjs`) clean. The author of this record did not re-run them.
**Verdict:** Phase 2 (6.2, 6.4, 6.5, 6.6, 6.7, 6.8) **ACCEPTED WITH CARRIES** at `e060f98`, subject to the founder conditions in section 5. The conditions do not block this record.
**Follows:** `docs/notes/phase1-acceptance.md` (Phase 1, document store). Same shape and same status words.
**Sources:** `docs/notes/decisions-log.md` ("Modules" entries for 6.2, 6.4, 6.5, 6.6, 6.7, 6.8; the Phase 2 close-out entries at the top of "Decisions"; every carry entry); `docs/notes/plans/phase2-rulings.md`; the plans `6.2`, `6.4`, `6.5`, `6.6`, `6.7`, `6.8` (their requirement tables give each ID and its priority); `git log`.
**Status:** Recorded for the founder's review. Priorities (M, S) are the plans' own, copied from the spec's tables. The spec text itself was not re-read for this record.

Citations read "DL <tag>" (decisions log) and a commit hash. All DL entries cited are dated 2026-10-01 or 2026-10-02 as stated in the log.

## 1. What Phase 2 delivers

Phase 2 is sourcing, from scope to a recommendation, the work that feeds Phase 1's award: scope, bill of quantities and company estimate (6.2); tender and quotation documents (6.4); advertisement, invitation, sale, briefings and addenda (6.5); bid receipt, late tenders, withdrawals and validity (6.6); the bid opening and its schedule (6.7); the configured evaluation, negotiation, recommendation, report and Kertas Cadangan (6.8).

Test of done as built: an officer can prepare an estimate, assemble and approve tender documents, publish a window, receive and register envelopes, open them, evaluate them from a configured model, table the recommendation to the committee, and award to the recommended tenderer, with every gate between those steps read from configuration and every refusal naming its setting.

Four limits apply to that sentence.

- **Sealed bid storage is not built.** The envelope register is paper. No bid content is held before the opening. NFR-SEC-003 and the electronic tender box are re-designated to Phase 3 with sign-in and D6 (DL 6.6 · OD-1; ADR 0016).
- **Anything needing a signed-in user is deferred.** The opening's "two authorisations" are two server-stamped acts by two present people, recorded on their behalf. They are not authenticated. Access control, access logs and maker-checker wait for sign-in (`AGENTS.md`).
- **SULIT prices, scores and reports are readable by any portal user until sign-in.** They are kept off lists, search, the dashboard and the feed, and withheld from the audit export.
- **Notices, letters and fee receipts are recorded, never sent or reconciled** (INT-09 not built; ledger reconciliation waits on D5 of the integration decisions).

## 2. Checklist

Status words: **Met** · **Partly met** (what is missing) · **Deferred** (to where) · **Re-designated** (to which module). Only Musts are itemised. Shoulds are named in one line per module. A requirement carried in from an earlier module is listed under the module that built it.

### 6.2 Scope, bill of quantities and company estimate

**Accepted with carries at `716c474`** (range `00d1e06^..716c474`; 151 files, 2,537 tests, typecheck and lint clean, re-run by the product owner). Send-back conditions met: scope act configured (`ce51ed4`), panel reliance on the live scan only (`21e9a79`), amounts chipped by matter kind (`716c474`). ADR 0012. DL 6.2 entries of 2026-10-01; DL Modules · 6.2.

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| FR-EST-002 | M | Met | Provisional flag; totals split firm, provisional, PC sums |
| FR-EST-003 | M | Met | Standard, departures and a qualified preparer, snapshotted |
| FR-EST-005 | M | Met | Specification panel; VERIFIED needs a live scan of the signed form (Q-1) |
| FR-EST-006 | M | Met | Company estimate separate from the bill and from bids |
| FR-EST-007 | M | Met | One preparer; two copies as custody events. The lead-time refusal and override were built in 6.7 |
| FR-EST-008 | M | Partly met | Value withheld everywhere until disclosure. Missing: access control and the access log, which need sign-in |
| FR-EST-009 | M | Met | Immutable versions with reasons. The closing half binds from `closingAt` (X-1) |
| FR-EST-010 | M | Met, in two steps | 6.2 built lodging, `disclose()` and `benchmarkRow()`. 6.7 calls them at finalising (DL Modules · 6.7) |
| NFR-SEC-002 | M | Partly met | Shared `SecurityClass`; matter amounts chipped by kind with a test. Missing: hiding (sign-in). Export withholding came with 6.7 and 6.8 |
| NFR-AUD-004 | M | Partly met | Custody list and view check built, not wired. Access log waits for sign-in (OD-1) |
| NFR-SEC-003 | M | Re-designated | To Phase 3 (DL 6.6 · OD-1). The estimate is plain in the database. The tab says so |

Shoulds: FR-EST-001 built, CSV only (Excel deferred, carry 62-C8); FR-EST-004 built; FR-REQ-014 built (scope tabling, three-state approval).

**Changes made to accepted modules.** Step 0 closed Phase 1 carries: D4 `00d1e06`, item 4 `793dae4`, item 3 `d183b11` and `0a1b9a4`, OD-8 chip `c5b1659`, table stacking `7534900`. Document store: SULIT guard on `DataList` `fd1b195`, panel reliance `21e9a79`. 6.1: requisition History and line total read money through `parseSen` `5386576` (62-C3).

### 6.4 Tender and quotation documents

**Accepted with carries at `591d850`** (range `793bb6b^..591d850`, both increments; `npm test` 3,511 tests, typecheck and lint clean, re-run by the product owner; migrations rebuilt with an empty diff). Conditions C-1 to C-8 met. ADR 0013. DL 6.4 entries of 2026-10-01; DL Modules · 6.4.

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| FR-DOC-001 | M | Met | Pack from configured parts in print order; mandatory part not READY blocks |
| FR-DOC-002 | M | Met | Composition and form from pack kind and basis |
| FR-DOC-003 | M | Met | Standard parts frozen by body version; bespoke parts refused a library template |
| FR-DOC-004 | M | Met | Appendix with three-state fields. The approved Appendix is the contract baseline. The award reads it (64-C4, below) |
| FR-DOC-005 | M | Met | Eligibility from configured registration bodies, not CIDB or MOF columns |
| FR-DOC-006 | M | Met | Permit type from a configured list. Band mapping not modelled (OQ-04) |
| FR-DOC-007 | M | Met | Bond-forms part tied to securities. Bond band not encoded (D4) |
| FR-DOC-008 | M | Met | Mandatory declaration part. The check at opening is 6.7's |
| FR-DOC-009 | M | Met for the pack | `restrictedTender` answered in the customer's words; stamp text from policy. Enforced at sale in 6.5; at paper submission in 6.7; the electronic half stays with 6.15 |
| FR-DOC-010 | M | Partly met | Table-document manifest built. Publication window built in 6.5. Missing: inspection log (sign-in, 6.15) |
| FR-DOC-011 | M | Met | Mandatory clauses as configuration; override needs a named person and reason. Endorser unchecked until sign-in |
| FR-DOC-012 | M | Met | Approval for Tendering through the engine; rows are the customer's and ship empty (go-live) |
| FR-DOC-013 | M | Met | Quotation pack has its own parts. The nine-part list is a test fixture only |
| FR-MTD-012 | M | Partly met | `behaviourFaults()` binds the six behaviours that touch the documents. The other six are listed as 6.12 and 6.13's |
| FR-MTD-013 | M | Met | Composition and form from configuration (carried in from 6.3 by CO-8) |
| FR-CTE-007 (part) | M | Met for its part | `packManifest()` supplies the bundle's tender-documents part. The rest was built in 6.6 and 6.8 |

Should: FR-DOC-014 built (two assurance confirmations; unset blocks). The assurance actor is unchecked until sign-in (known gap, stated on screen).

**Changes made to accepted modules.** 6.3: permit list out of classification `9ecd6b9`, policy-save guard and refusal `9e1cef3` (64-C1). 6.11 (64-C4): award opens from the frozen Appendix `b76a5ee`, `232df8f`, `47a9564`, `e0392e5`, `9c311e8`, `beac459`, `c685583`, `d29f41b`; the award gains three reason columns (migration `award_appendix_difference_reasons`). No existing 6.11 test changed.

### 6.5 Invitation window

**Accepted with carries at `86f502a`** (range `ad0a618^..86f502a`, the 64-C4 commits inside the range excluded; 217 files, 4,140 tests, typecheck, lint and check-ui clean, re-run by the product owner on a clean export). Send-back S-1 to S-3 met; conditions C-1 to C-9 met. ADRs 0014, 0015. DL 6.5 entries; DL Modules · 6.5.

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| FR-ADV-001 | M | Met | Channels shipped empty; none configured refuses publication |
| FR-ADV-002 | M | Partly met | Invited path built: public channel refused, one frozen letter per approved invitee. Missing: delivery (recorded, never sent: INT-09); 'not in the public listing' holds only because none exists, and 6.15 must check whether the exercise is open or invited. Reason ruled 2026-10-02. |
| FR-ADV-003 to 008 | M | Met | Notice items, minimum days, calendar, closing time, purchase cut-off, fee basis and floor. Calendar and floors ship empty |
| FR-ADV-009 | M | Partly met | Finance receipt number recorded behind a manual adapter. Missing: ledger reconciliation (D5). Online payment (INT-10) is Phase 3 |
| FR-ADV-010 | M | Partly met | Attested checks at sale. Registration and suspension read "not checked" until the supplier register (6.15) |
| FR-ADV-011 | M | Met | Sale annotation snapshotted with the issuing officer |
| FR-ADV-013 | M | Met | Briefing and site events with attendance; mandatory-attendance answer per event |
| FR-ADV-014, 015, 016 | M | Partly met | Addenda, closing changes through the `window_change` route, and cancellation are built. Recipient delivery is recorded, never sent (INT-09) |
| FR-DOC-009 (at sale) | M | Met | Restricted exercise: certificate sighted and valid, else the sale is refused |
| FR-DOC-010 (publication window) | M | Met | Availability derived from the window's phase. Inspection log waits for sign-in and 6.15 |
| FR-MTD-008 | M | Met | Frozen invitee list and the committee citation, enforced at invitation (`invitationFault`, `inviteeListFault`). Question for the founder and RSAJ: one person taking two steps of one route against FR-MTD-008 (demo device `demo_dg5`) |

Shoulds: FR-ADV-012 recorded, never sent; FR-ADV-017 deferred to 6.15 (OD-10).

**Changes made to accepted modules**, each in its own commit: `ac788c8`, `23c63d1`, `6fd284d`, `12c61b5`, `bcd5784`, `3349848`, `05008f3`, `15a4521`, `fe897ba`, `6d01287`, `c7296df`, `84e2573` (the last renamed the 6.4 state label to "Awaiting approval for tendering"). Test changes: the 6.3 BD-7 test replaced stricter; the X-9 test tightened (BD-65-14). Carry 65-C1 (end-day wording and the delegation facts) closed by `6cbfc75`, `ac8fdc2`, `ac3b9ac`, `e76af13`, `92cb6fa`, `f8a583f`.

### 6.6 Bid receipt

**Accepted with carries at `306cc68`** (range `fe7641b^..306cc68`; documents commit `ec8cde5`; 247 files, 4,490 tests, typecheck and lint clean, re-run by the product owner). Narrow send-back met: S-1b `91cb355`, S-9 `ed4d59c`, 66-C2 `031463b`, `b7842d3`. ADR 0016. DL 6.6 entries; DL Modules · 6.6.

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| FR-BID-001 | M | Partly met | Paper register built. The electronic tender box is re-designated to Phase 3 (sign-in, D6, SK002 amendment) |
| FR-BID-002 | M | Met | Received time is the server's stamp. A receipt recorded afterwards says so and shows the officer's stated time as a statement |
| FR-BID-003 | M | Met | A late envelope is flagged, counted and segregated. No action exists to delete or reject it |
| FR-BID-005 | M | Met | No edit path; one clerical correction before closing, with reason and audit |
| FR-BID-006 | M | Met across 6.6 and 6.7 | Permission stored here; marking an alternative happens at opening (6.7) |
| FR-BID-007 | M | Met across 6.6 and 6.7 | Checklist rule built here (parts plus every issued addendum); applied per bidder at opening |
| FR-BID-008 | M | Re-designated | To 6.15c (electronic submission, gated on sign-in); DL 6.6 · OD-9, 2026-10-01 |
| FR-BID-009 | M | Met | Validity days per exercise, no default; expiry reading ASSUMED and shown |
| FR-BID-010 | M | Met across 6.6 and 6.8 | Extensions with attached consent here. The consent is judged against the recommended tenderer in 6.8 |
| FR-CTE-007 (late part) | M | Met | Tabling or citing an appointment is refused while a late envelope has no decided admission. The bundle's rest is 6.8's |
| FR-CTE-008 | M | Met | Late-tender admission tabled from its record; the committee's decision is the admission. Consequence (supplementary opening) is 6.7's |
| FR-CTE-013 | M | Re-designated | To 6.8 (met there) |
| NFR-SEC-003 | M | Re-designated | To Phase 3 with the electronic box (OD-1 A); DL 6.6 · OD-1. Letter and quote are SULIT. Phase 1 record §10 row already reads this way |

DL Modules · 6.6's Spec line ('built FR-BID-001–011', 'NFR-SEC-003 (letter and quote SULIT)') overstates; the OD-1 and OD-9 rulings govern.

Shoulds: FR-BID-004 (withdrawals) and FR-BID-011 (competition flag) built.

**Changes made to accepted modules**, each in its own flagged commit: document store `cfaebc8`, `031463b`, `b7842d3`; 6.11 `f184bd8`; 6.10 `21f2da1`, `4ef10e2`, `ed4d59c`; 6.2 `ee1c5ed`; 6.5 `d43db04`, `e958237`, `8107e77`, `966d63b`; 6.1 `fe7641b`, `fe66746`, `03dca9b`; shared `DataList` `0d44d25`. Tests changed, each authorised: `targets.test.ts`, `committee/labels.test.ts` (stricter), `bids/audit-view.test.ts` (S-1b), `closing-writers.test.ts` (the scan's own list).

### 6.7 Bid opening

**Accepted with carries at `8361948`** (range `d2bba51..8361948`; documents commit `0ac40fa`; 283 files, 4,970 tests, typecheck and lint clean, re-run by the product owner). Narrow send-back met: S-1 `ea753e7`, S-2 `a4a50f7` and `a9d1046`, S-3 and S-5 `29b61fa`, S-4 `4aa3d31`. ADR 0017. DL 6.7 entries; DL Modules · 6.7.

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| FR-OPN-001 | M | Met | Opening committees are ordinary committees; unset blocks starting |
| FR-OPN-002 | M | Met | Panel size has no default; another size needs an override |
| FR-OPN-003 | M | Partly met | Two distinct present members each record an authorisation, server-stamped. Missing: the authenticated half ("no single credential"), which goes to sign-in and the Phase 3 box. The tab says so |
| FR-OPN-004 | M | Met | Unseal refused before the closing second or without a locked box |
| FR-OPN-005 | M | Met | Schedule from the record, in opening order. Paper copy figure compared at finalising (C-1) |
| FR-OPN-006 | M | Met, attested | Initials and signatures recorded on their behalf. Finalising refuses until complete |
| FR-OPN-007 | M | Met | Late count read from the envelopes; no input exists for it |
| FR-OPN-008 | M | Met | Checklist snapshotted at start; present, absent, not applicable per bidder; verdict on eliminatory grounds only |
| FR-OPN-009 | M | Met | `evaluationSet()` returns passed bids only |
| FR-OPN-011 | M | Met | Every act audited in its transaction; no update path once finalised (source scan) |
| FR-EST-007 | M | Met | Lead time refused at start unless overridden; the override is snapshotted |
| FR-EST-008, 010 | M | Met | Disclosure runs in the finalising transaction; nothing written on refusal. Access log waits for sign-in |
| FR-BID-006, 007 | M | Met | Alternatives and completeness applied at opening |
| FR-DOC-009 (paper, at opening) | M | Met (paper half) | Per bidder, the sale's sighted certificate valid on the closing day, else NOT_EVIDENCED, a ground for rejection (SK001 7.3.4(a)); the closing-day reading is ASSUMED and shown. `opening/verdict.ts`; tests `findings.test.ts`, `verdict.test.ts`; plan 6.7 row. Left out of DL Modules · 6.7; placed by ruling 2026-10-02. Electronic half: 6.15c. |
| FR-CTE-008 (consequence) | M | Met | A carried late tender opens a supplementary opening under the main opening's committee |
| NFR-SEC-002 | M | Partly met | SULIT values withheld from the audit export and tested on the file's bytes. Missing: restriction of prices (sign-in). A figure typed into a free-text audit reason is not withheld (section 5) |

Shoulds: FR-OPN-010 (Grand Summary), FR-CTE-011 (independence rule; a unit not in force blocks), FR-BID-004 and 011 at opening, all built.

**Changes made to accepted modules**, each in its own flagged commit: 6.4 `0696874`; document store `84432fe`; X-8 fan-out `6649045`; 6.6 `78f49c2`, `35e2908`, `a4a50f7`, `ad27254`, `a9d1046`; 6.11 `00b6aee`, `47db0ee`, `80cf1c7`, `510cfd7`; 6.10 `a4a50f7`; 6.5 `ff66127`, `bce6fad`; audit export `f343c30`, `4784b81`; 6.1 and budget `3822ad2`; Configuration `52651e2`; shared `DataList` `ea753e7`. Tests changed, each ruled: `method/window-transitions`, `documents/targets`, `bids/sealed` (stricter after R-7), award `exercise-gate`, `bids-gate`, `appendix-baseline` (stricter), `committee/labels`, `bids/labels`, `opening/sealed` (stricter); fixtures only for `open`, `start` and the award gate tests.

### 6.8 Evaluation

**Accepted with carries at `c664f59`** (range `247a496..c664f59`; documents commit `c92b0b7`; 319 files, 5,647 tests, typecheck and lint clean, re-run by the product owner). Narrow send-back met (S-1 `1b2d7e7`, S-2 `5690384`, 68-C1 `bc2a788`, 68-C2 `4a65064`); Q1 `8e27e6c` and Q2 `db94e70` as ruled; code-review items M-1 to M-3, R-1 to R-10 and eight re-review residuals fixed. ADR 0018. DL 6.8 entries; DL Modules · 6.8.

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| FR-EVL-001 | M | Partly met | Two distinct people, one per side, recorded on their behalf. Missing: authenticated identities (sign-in) |
| FR-EVL-003, 004 | M | Met | Aspects with verdict and narrative; variance against the disclosed estimate; recommending needs aspect (b) satisfactory |
| FR-EVL-005 | M | Met | Route per contract basis; two-stage models start with a committee decision stage |
| FR-EVL-006, 007 | M | Met | Versioned models pinned in the publish transaction; every function runs from the frozen snapshot |
| FR-EVL-008, 009 | M | Met | Stage kinds and the five-phase template, shown on the fixture and by TA 109 (85.01) |
| FR-EVL-010, 011 | M | Met | Capital ratio with configured factors and bands; variances in RM and percent; display only unless a stage says must-pass |
| FR-EVL-012 | M | Partly met | CPR percent and band derived. Missing: "drawn from the register". The value is entered with the report attached until 6.16 |
| FR-EVL-013 | M | Met | Communication log on every bidder. The portal sends nothing (INT-09), and the tab says the log is complete only for what is recorded |
| FR-EVL-014 | M | Partly met | Every evaluation upload is SULIT; scores, prices and the report appear only on the tab and print. Missing: restriction to evaluators and the access log (sign-in) |
| FR-EVL-015, 016 | M | Met | Clarification closes only with minutes and confirmation; negotiation needs an approved route. A rise below the ceiling warns only, no guardrail (FR-EVL-016, spec §11.7) |
| FR-EVL-017 | M | Partly met | Report with annexes A to F. Annexes D and F are listed, not exported, while SULIT uploads cannot be downloaded |
| FR-EVL-019 | M | Met | Ceiling read from the exercise's own frozen boundary and operator, never a literal. A price above it cannot be recommended (Q1), and the award gate follows (68-C3, closed) |
| FR-CTE-007 (rest) | M | Met | The bundle read once at tabling and at citation (`fb41578`) |
| FR-CTE-013 | M | Met | Kertas Cadangan frozen from the issued report; refuses with no time zone (`1a47cca`) |
| FR-CTE-009 (loop half) | M | Met | A not-carried loop opens the next version. The tabled version is recorded and judged (M-3) |
| FR-BID-010 | M | Met | Consent judged on the extension that sets the current expiry. A later extension on the recommended tenderer's consent cures earlier ones (lead's ruling) |
| NFR-SEC-002 | M | Partly met | Scores, prices, narratives, minutes, recommended tenderer and ranking justification are SULIT and withheld from the export. Missing: restriction (sign-in) |

Shoulds: FR-EVL-002 and 018 built; FR-EVL-020 deferred to sign-in (OD-7).

**Changes made to accepted modules**, each in its own flagged commit: X-8 fan-out `7ad5c15`; document store `ba22596`; 6.10 `a0fb345`, `6330ba8`, `f5b85b1`, `ac2afa8`, `fb41578`, `7e167da`, `bc2a788` (demo); 6.11 `6b11b3f`, `53393bf`, `ac2afa8`, `fb41578`; 6.6 `53393bf`; method routes `3964ad7`; 6.5 `e52a532`, `eaff338`; 6.7 `0369151`, `7ebc8fe`; templates `f5a42b2`, `f9e7b96`; 6.3 `52c3e90`; demos `f45a4ea`, `6a8525a`, `f7abe3a`, `b57a2de`, `68b8205`, `4e20c6f`. Lock order extended and corrected (BD-68-3): requisition, exercise, window, openings, sitting, evaluations (`lock-order.test.ts`). Tests changed, each ruled: `window/publish` (fixtures, plus a new E-2 block), `method/opening-states`, `method/route-domains`, `documents/targets`, `committee/labels` (stricter), `components/data-list-width`, `documents/owner-check` (additive), `evaluation/rules` (R-5 as ruled), `evaluation/hooks` (scans stricter, one title).

### Cross-cutting: audit

| Req | Pri | Status | Reason, and where the rest goes |
| --- | --- | --- | --- |
| NFR-AUD-001 | M | Partly met | Every Phase 2 act audited before/after in its transaction (FR-OPN-011 source scan; 67-C2). Missing, as Phase 1 §10: actor, role held, source address, reads of classified records (sign-in); penetration test (go-live) |
| NFR-AUD-006 | M | Partly met | Server stamp decides receipt and lateness (FR-BID-002); an after-the-event receipt keeps the officer's stated time and reason, shown as a statement; days on the organisation's clock, no UTC fallback (68-C5). Missing, as Phase 1 §10: back-dating exceptions with an authorising officer (sign-in) |

### Phase 2 close-out (after 6.8)

Range `dd00fa3..e060f98`, 24 commits. Items and commits are in section 4. Tests changed, both flagged: `evaluation/org-day.test.ts` (stricter: `dayOf` for `dayIn`) and `tender-docs/pack.test.ts` (a fixture default, no assertion changed). No migration. Accepted Phase 1 modules touched include: 6.9 (`1ab3073`, an issue's `issuedAt` on the organisation's clock), 6.10 (`fd3da01`), 6.11 (`bb38d5e`, `bb63b64`, `d5dcbb2`).

## 3. Gates, and how the work was verified

**Gates on one commit.** `e060f98`: `npm test` 337 files, 5,709 tests, all passed; `npm run typecheck` clean; `npm run lint` clean, including `check-ui.mjs`. Run by the lead on 2026-10-02. The count at each module's acceptance was:

| Commit | Files | Tests |
| --- | --- | --- |
| `716c474` (6.2) | 151 | 2,537 |
| `591d850` (6.4) | not logged | 3,511 |
| `86f502a` (6.5) | 217 | 4,140 |
| `306cc68` (6.6) | 247 | 4,490 |
| `8361948` (6.7) | 283 | 4,970 |
| `c664f59` (6.8) | 319 | 5,647 |
| `91e6059` (close-out) | 332 | 5,698 |
| `e060f98` | 337 | 5,709 |

No test is skipped. Every changed existing test is listed per module in section 2 with its ruling.

**Verify-run method (approved by the product owner, DL 6.7 re-review).** Each module's write paths were run through the real server actions on a throwaway database, `perolehan_verify`, rebuilt by `docs/notes/cloud-build/tools/verify.sh` (migrations applied, diff against `schema.prisma` empty, seeded, demo loaded). A throwaway harness called the actions and was deleted afterwards. Setup rows were edited directly in that database. The acts under test were never edited that way. `perolehan` and the dev server were untouched. This does not replace unit tests.

| Run | Cases | Source |
| --- | --- | --- |
| 6.2, 6.4, 6.5, 6.6 | run; count not logged | DL 6.6 · "Changes to accepted modules" and the module entries. No count reconstructed; the product owner's gate re-run at each acceptance stands. |
| 6.7 build | run; count not logged | DL 6.7 · Built |
| 6.7 fix round | 30 checks, all passed | DL 6.7 · Fix round done |
| 6.8 build | 62, all as expected | DL 6.8 · Built |
| 6.8 fix round | 43, all as expected | DL 6.8 · Fix round done |
| 6.8 re-review residuals | 23, all as expected | DL 6.8 · Re-review residuals |
| Close-out (68-C5, 68-C3, 67-C5) | 37, all as expected | DL close-out · Verify run |
| Close-out residuals 1 and 2 | 21, all as expected | DL close-out · Code-review residuals |

Each close-out change also ended with the demo wiped (`--remove-dependents`) and reloaded on `perolehan`.

## 4. Carries

### 4.1 Closed in or before the close-out

Every carry that blocked Phase 2 acceptance is closed.

| ID | Item | Closed by |
| --- | --- | --- |
| 62-C5 | Voluntary estimate: offered, never blocks, disclosed at finalising, copy may be left uncompared | 29b61fa (S-5); tests opening/start.test.ts (62-C5), frozen-readings.test.ts; closed by ruling 2026-10-02 |
| 68-C3 | Award gate judges a price that differs from the recommendation against the quotation ceiling | `bb38d5e`; wording `bb63b64` |
| 68-C5 | `storedDay` on instants in six actions | Resolved as correct: `openedAt` is the organisation's day at midnight UTC, so `storedDay` is right in every zone (proved by `dd00fa3`). The scan then found real instants read as UTC days, each fixed in its own commit: `279b9b0`, `4062931`, `84e04c9`, `1a47cca`, `fd3da01` |
| 67-C5 | `pathTo` truncates at the first ancestor not in force | `81ca660` (`wholePathTo`; a broken path blocks as unit not recorded) |
| 67-C1 | Approval for Tendering did not warn that an unset "returned by the bidder" blocks the opening | `db6c9eb` |
| 67-C2 | History named the envelope register's rows "Record" | `4b4bb3e` |
| 67-C3 | Demo `demo_sx21`, `demo_c7` and changed demo ids | Built with the 6.8 demo (`e2f8188`, `c7d64d9`, `bfd1cdd`; DL Modules · 6.8 Demo) |
| 68-C1 | Demo return keys | `bc2a788` |
| 68-C2 | Marks shown at the frozen places | `4a65064` |
| 66-C1 | Role-assignment end stored an instant; `attachRecommendation` fell back to the UTC day | `fe66746`, `03dca9b` |
| 66-C2 | Delegation facts with no time zone | `031463b`, `b7842d3` |
| 66-C3 | 6.6 plan row for FR-BID-002 reworded | Acceptance commit `ec8cde5` |
| 65-C1 | End-day wording and delegation facts | `6cbfc75`, `ac8fdc2`, `ac3b9ac`, `e76af13`, `92cb6fa`, `f8a583f` |
| 65-C2 | Disabled Void states its reason; `ENVELOPE_HELD` | `d43db04`, `e958237`. `ENVELOPE_HELD` stays as an inert backstop (X-11) |
| 64-C1, 64-C2, 64-C3 | Permit-list guard; refresh writes only the confirmed list; migration tools find their helpers | `9e1cef3`, `df5c9ff`, `4e322c4` |
| 64-C4 (a, d) | Award pre-fill from the frozen Appendix; `demo_aw7` re-check | Gates clean at `d29f41b`; `demo_aw7` re-checked in 6.6 step 0 (`fe7641b`, `d43db04`, `e958237`) |
| 62-C1 to 62-C4, 62-C6 | Scope judged under the rule written at tabling; History count change; money through `parseSen`; header count; 1440 evidence | `0562630`, `5f76db0`, `5386576`, `74ea9f8`, `10bcdaf` |
| Phase 1 D4 | Wipe dead end for screen-made sittings and delegations | `00d1e06` |
| Phase 1 D5 | Delegation and attachment tables at 1024 | `91e6059` (after `7534900` alone proved not enough) |
| Phase 1 D6 | "Recorded on their behalf" and component hints | `156cfaf` |
| Phase 1 item 3 | Configuration tables at 390 | `d183b11`, `0a1b9a4` |
| Phase 1 item 4 | "Routed on: Its value band" | `793dae4`; then `1b3583c` for the Approval for Tendering card |
| Phase 1 item 10 | `formatDate` on instants | `02bcc27`, `e5376b2` |
| 6.2 OD-8 chip | Value displays say SULIT | `c5b1659` |
| Close-out residuals 1 to 6 | `issuedAt` clock; award ceiling wording; two stricter scans; frozen day; Accordion title wraps (`10d8029`, `ee1c46f`) | `1ab3073`, `bb63b64`, `576eb92`, `d5dcbb2`, `fe45fc9`, `10d8029`, `ee1c46f`, `1b3583c` |

### 4.2 Open

| ID | What it is | Blocks | Owner |
| --- | --- | --- | --- |
| 68-C4 | The recommended tenderer is named on `/awards`, its search and `/approvals` once an award is drafted on it, before the Board's step. Founder list | Go-live | 6.11 follow-up, founder's ruling |
| 62-C7, Phase 1 D1 | Native-engine check of the migrations (section 5) | Any non-throwaway database; go-live | Founder, local review |
| 62-C8 | Excel import before go-live; 2,000-line cap against hosted latency; CSV safe only while downloads are forced attachments; RSAJ questions OD-2, OD-6, OD-8 and "Value approved" | Go-live | 6.2 follow-up, devops |
| 64-C4-b | The award's own insurance terms (a negotiated term cannot yet be stated on the award) | 6.12 | 6.12 |
| 64-C4-c | The award letter prints a defects liability period stated as none (stored as 0, BD-64-40) as '0 months': `lib/award/fields.ts:131` (`terms.dlp` via `formatPeriod`). The carry asks for 'None' in both languages. `labels.ts:422` is the on-screen tender term (already 'None'), not the letter. Verified open 2026-10-02. | Nothing | 6.11 wording step (own flagged commit, new tests only) |
| 67-C4 | An opening started before R-4 is refused for good with wording that cannot help it. No such data exists; if found, the wording names cancellation | Nothing | 6.7 |
| P2-C1 | Label strings added in the close-out and the maps around them are English only (the existing gap against the Malay rule) | Nothing | Bilingual pass, later |
| Phase 1 carry 2 | `saveTimeZone`, `saveMatrix` and `saveRule` read or check outside the lock or transaction. No Phase 2 entry closes it | Sign-in (concurrent users) and go-live | Configuration hardening |
| Phase 1 carry 7 | INT-01 and INT-02 reconciliation report. Waits on the integration decision D5 (not the document carry D5 above) | Go-live | Integration module |
| Phase 1 D9 | Concurrency defaults and memory multiples measured on the target host | Go-live | Devops |
| Phase 1 carries 5, 6, 8, 9; D7, D8 | Dashboard stat spill; time-zone list size; FR-APR-017 on name and award routes; contract-record display and EOT default; recommender audit-row test; access events kept by the wipe | Nothing | As in the Phase 1 record. No Phase 2 entry addresses them |

**Deferred, not carried** (each is in a Modules "Deferred" line): sign-in and everything that needs it; sealed storage and the electronic tender box (Phase 3); malware scanning (go-live, Phase 1 section 6 item 9); sending notices (INT-09); the supplier-register checks (6.15); contractor performance from the register (6.16); a bilingual print of the Grand Summary and the report; automatic SULIT downgrade control (maker-checker).

**New go-live seeds** (they ship empty or unset; the system refuses or warns and names the setting): the Approval for Tendering rows and the SK001 and OM/P/005 part lists (DL 6.4 · Q-8); channels, holiday calendars and fee floors (6.5); the method's three bid-receipt rules and bid validity (6.6); opening committee, panel size, independence rule, unpurchased-bid consequence and invited-count reading (6.7); an evaluation model per method in use, `scoreDecimals`, bands and the negotiation rows (6.8, question D1). Add these to the Phase 1 section 6 list when RSAJ's go-live pack is assembled.

## 5. Founder conditions on sign-off

Neither condition blocks this record.

### 5.1 Native-engine check of the Phase 2 migrations

Run `npx prisma migrate deploy` on a normal machine against PostgreSQL 17 with the native engine, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`. Confirm no failed migration and an empty diff, and that the CHECKs the migrations rebuild appear in `pg_constraint`. The log records Phase 2 migrations proved on the WASM engine against PostgreSQL 16 (DL "Environment caveat") and no native run after 2026-10-01. 45 folders, by module:

- **6.2 (6, carry 62-C7):** `20261001120000_attachment_purpose_spec_panel_form`, `20261001120100_scope_bq_estimate`, `20261001121018_matter_kind_scope`, `20261001121026_attachment_purpose_bq_import_source`, `20261001121148_scope_rates_tabling`, `20261001150003_scope_act`.
- **6.4 (6):** `20261001160310_exercise_status_pending_approval_for_tendering`, `20261001160318_exercise_status_approved_for_tendering`, `20261001160326_attachment_purpose_tender_part`, `20261001160450_tender_documents`, `20261001181637_tender_documents_clauses`, `20261001192500_tender_pack_void_reason`.
- **6.5 (7):** `20261001201009_exercise_status_advertised`, `20261001201016_exercise_status_invited`, `20261001201206_invitation_window`, `20261001201944_attachment_purpose_addendum_signed`, `20261001201946_attachment_purpose_publication_proof`, `20261001201949_attachment_purpose_attendance_sheet`, `20261001201959_attachment_owner_addendum`.
- **64-C4, in 6.11 (1):** `20261001235011_award_appendix_difference_reasons`.
- **6.6 (3):** `20261002004602_attachment_purpose_withdrawal_letter`, `20261002004609_attachment_purpose_validity_consent`, `20261002004659_bid_receipt`.
- **6.7 (9):** `20261002024149_exercise_status_opening_in_progress`, `20261002024156_exercise_status_opened`, `20261002024205_receipt_source_box_at_opening`, `20261002024206_envelope_status_opened`, `20261002024207_party_source_bidder_at_opening`, `20261002024208_attachment_purpose_signed_schedule`, `20261002024305_pack_part_returned_by_bidder`, `20261002025342_bid_opening`, `20261002043723_opened_bid_correction_counter`.
- **6.8 (13):** `20261002055108_exercise_status_under_evaluation`, `20261002055110_exercise_status_evaluated`, `20261002055112_attachment_purpose_cpr_report`, `20261002055114_attachment_purpose_communication`, `20261002055116_attachment_purpose_meeting_minutes`, `20261002055119_attachment_purpose_tenderer_confirmation`, `20261002055121_attachment_purpose_report_drawings`, `20261002055123_attachment_purpose_signed_report`, `20261002055125_attachment_purpose_signed_proposal_paper`, `20261002055127_matter_kind_evaluation_stage`, `20261002055358_evaluation`, `20261002063033_evaluation_started_by_optional`, `20261002091522_committee_decision_evaluation_version`.

Found while writing this record: the native check logged on 2026-10-01 covers the 23 folders through `20261001011312_phase1_closeout`. It does not cover four earlier-than-Phase-2 folders that follow: `20261001034512_organisation_details_and_logo`, `20261001040327_core_routing`, and the two document-store folders (`20261001055855_document_store`, `20261001073742_document_store_rulings`, carry D1; the check is written up in `docs/notes/cloud-build/local-review.md`). Run the check from the first folder after `phase1_closeout`, not from the first Phase 2 folder.

Phase 1 carry D1 was to block the first Phase 2 migration (Phase 1 record §9). It did not: the 45 Phase 2 migrations were built on the WASM engine with D1 outstanding. The check covers all 49 folders after `20261001011312_phase1_closeout`. Until it passes, these migrations go to no database except throwaway and development ones. The pg_constraint step checks every CHECK named in those folders (14 folders carry them), including D1's nine and the rebuilt attachment-owner CHECK (X-6).

### 5.2 Founder-list rulings accumulated

These were decided by the product owner or the lead on the founder's behalf. Each is the founder's to confirm or reverse.

- **BD-66-5.** A late tender is tabled with the committee's decision as the admission (act A). Could a customer need the committee only to recommend? If so it becomes a configured act, like the scope act. DL 6.6 · Build decisions, Review; Modules · 6.6 "For a human".
- **BD-66-3 (RSAJ question).** The closing second: a receipt at 14:30:00 is in time and one from 14:30:01 is late. Is the spec's example "before 2.30" or "by 2.30"? It becomes a switch if RSAJ answers "before". DL 6.6 · Build decisions, Review; Modules · 6.6.
- **BD-67-8.** The opening's rules (committee, unpurchased-bid consequence, estimate requirement) are frozen when the opening starts, not when the window publishes. DL 6.7 · Build decisions, Review (approved with S-3); Modules · 6.7.
- **BD-67-9.** There is no free "other" rejection ground at opening. A concern goes in the minutes. DL 6.7 · Build decisions, Review; Modules · 6.7.
- **Draft award shows its value.** A draft award on the recommended tenderer shows the offer price before the Board's step. DL 6.7 · Review, re-review; DL 6.8 · Fix round done (with 68-C4).
- **Free-text audit reason can carry a figure.** A figure typed into a free-text reason reaches the audit export. Keyed fields are withheld; free text cannot be. Waits for sign-in. DL 6.7 · Re-review residuals (1); Modules · 6.7.
- **BD-68-5.** Exercises published before evaluation models existed are refused at award as never evaluated. DL 6.8 · Build decisions, Review; Modules · 6.8.
- **BD-68-12.** No recommendation is formed while a negotiation is still with approval. The verify run found why: an approved negotiation could never be held after the recommendation. DL 6.8 · Build decisions, Review; Modules · 6.8.
- **Consent cured by a later extension.** An extension on one tenderer's consent is cured by a later one on the recommended tenderer's consent. The lead's ruling (FR-BID-010, OD-7, rule 2). DL 6.8 · Re-review residuals (2); Modules · 6.8.
- **68-C4.** The recommended tenderer's name on `/awards`, its search and `/approvals` once an award is drafted. Blocks go-live. DL 6.8 · Fix round done; Modules · 6.8 Carried.

The earlier end-of-build list (`docs/notes/plans/phase2-rulings.md`, items 1 to 12) stands: NFR-SEC-003 re-designation; 6.4 Q-1 B; the BD-7 test replacement; exercise tab grouping; 6.6 OD-3; FR-OPN-003; box envelopes judged by lock time; the estimate copy check at finalising; partly met FR-EVL-001, 012, 014, 017; 6.8 OD-8; 6.8 OD-1 against the plan; SULIT prices readable until sign-in.

Questions for RSAJ, collected from the Phase 2 rulings (as in `phase2-rulings.md` and the module entries): HoD proposal and joint recommendation (6.5); letters issued or despatched; committee for window changes; which tender pack parts a bidder returns; 6.7 OD-4 (eliminate or report a bid with no purchase) and OD-9 (how tenderers invited are counted); the independence rule (FR-CTE-011); 6.8 D1, OD-5 and OD-10; D9 (the quotation route); the "before 2.30" reading above.

## 6. Evidence

Text-snapshot diffs (`scripts/text-snapshot.mjs`, before and after, in `docs/notes/cloud-build/evidence/`). A diff proves a restyle or fix dropped no field, warning or provenance tag.

| File | Covers | Finding |
| --- | --- | --- |
| `6.5-text-snapshot.diff` | 30 screens, before and after 6.5 | Removals are pre-6.5 fallbacks only |
| `6.6-text-snapshot.diff` | 20 screens 6.6 touched | Intended changes |
| `6.7-text-snapshot.diff` | 6.7 fix round; the product owner re-snapshotted 17 routes the first run left out | Nothing dropped |
| `6.8-text-snapshot.diff` | 6.8 build | Intended changes |
| `6.8-fix-text-snapshot.diff` | 88 routes, 6.8 fix round | Marks at two places; "Not yet" with its reason; "Recommended tenderer" chipped SULIT. Other differences are reload stamps |
| `6.8-residual-text-snapshot.diff` | 88 routes after the residuals | Nothing dropped |
| `phase2-closeout-text-snapshot.diff` | 798 routes, `c92b0b7` against `91e6059` | 11 of 797 screens differ; nothing dropped |
| `phase2-closeout-residuals-text-snapshot.diff` | The same 798 routes after the residuals | Nine exercises' Tender documents tabs read "The exercise's estimated value alone" (6b); nothing else dropped |

0012, 0013, 0016, 0017 and 0018 marked Accepted in a separate docs commit (ruling 2026-10-02).

Screenshots and bundles sent to the founder at each acceptance:

| Module | Bundle | Where logged |
| --- | --- | --- |
| 6.2 | 1440 shots and a text-snapshot diff of the screens `ce51ed4` and `716c474` changed (carry 62-C6, evidence commit `10bcdaf`) | DL 6.4 · (g) |
| 6.4 | No bundle named in the log | not established |
| 6.5 | No bundle named; the 30-screen text-snapshot diff above (`86f502a`) | DL 6.5 · SENT BACK, ACCEPTED |
| 6.6 | `6.6-screens.zip`, 14 screens at 1440, 1280 and 390, taken by the lead; tip `ec8cde5` | DL Modules · 6.6 |
| 6.7 | `6.7-screens.zip`, 16 screens at 1440, 1366, 1280 and 390, taken by the lead after the residual fixes; tip `0ac40fa` | DL Modules · 6.7 |
| 6.8 | 6.8 screens zips, 16 screens at 1440, 1366, 1280 and 390, taken by the lead after the residual fixes; tip `c92b0b7`. Local copies: `/home/user/repo/6.8-screens-1.zip`, `6.8-screens-2.zip` (git-ignored, not in the repository) | DL Modules · 6.8 |
| Close-out | The lead takes the Phase 2 close-out shots; the log records Playwright measurements at 390 and 1024 | DL close-out · D5, carry 3 |

The 6.6 and 6.7 zips are not in the repository.

## 7. Acceptance

**Decision: ACCEPTED WITH CARRIES**, 2026-10-02, at `e060f98` on `build-all-modules`, subject to section 5. The verdict is the lead's, as instructed to the author of this record. Signed off by the product owner on the founder's behalf, 2026-10-02.

**Why accepted.** Every Must in section 2 is met, partly met with a logged deferral, or re-designated by a logged ruling. Every carry that blocked Phase 2 is closed (section 4.1). Gates are clean on one commit (section 3). The test of done in section 1 holds, with its four stated limits.

**Musts that could not be placed:** None, after the rulings of 2026-10-02 (NFR-AUD-001/006, FR-ADV-002, FR-DOC-009, 62-C5). Acceptance bundles for 6.4 and 6.5: not established.

**Not ruled here:** the founder's open question on vote secrecy beyond the activity feed (Phase 1 record, §10). The founder's open questions are held for the end by the founder's choice of the full review cycle.

**Next:** Phase 3 starts with 6.15a (staff-side supplier register, a1 then a2) per `docs/notes/plans/phase3-6-rulings.md` (build order: 6.15a, then 6.12, 6.14 increment 1, 6.13 Part A, 6.14 increment 2, 6.13 Part B, Phase 6). Phase 3 acceptance is 6.15a's acceptance. 6.15b and 6.15c are gated on sign-in and sit outside that sequence.
