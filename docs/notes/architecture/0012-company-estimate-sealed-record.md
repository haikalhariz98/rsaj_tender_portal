# 0012 — The company estimate is a sealed record: one accessor, omitted everywhere else

**Status:** proposed 2026-10-01 with 6.2 increment 1, under the rulings OD-1, OD-2, OD-9, OD-10 and the sealed-figure rule
(decisions log, "· 6.2 ·" entries; `docs/notes/plans/phase2-rulings.md` X-1, X-3). Plan: `docs/notes/plans/6.2-scope-bq-estimate.md`.

## Context

FR-EST-006 to 010 require a company estimate, separate from the bill of quantities and from the bids, prepared by one officer,
versioned with reasons, held SULIT, kept in two paper copies, and opened only with the bids. The product has no sign-in: it cannot
tell who is reading, so it cannot restrict a reader (NFR-SEC-002 is met by classification and statement, not by access control).
Every existing module renders its records' values, writes before/after values into the audit trail, and returns a form's faults to
the screen; any of those paths would show the figure. A figure shown once — on a page, in a server action's response, in a History
row, in an export, in a URL — has been disclosed, and the tender it benchmarks is compromised.

The sealed-figure rule (decisions log) widens this: the estimate never feeds bands, the regime, award checks or lists, and every
figure derived from it (against the bill, minimum capital, variance, savings) and every amendment reason stays sealed until
`disclose()`. OD-1 rejected a named-person reveal before disclosure: an attested name is not access control.

## Decision

1. **The figure and the amendment reason are omitted by the application client.** `src/lib/db.ts` creates the client with
   `omit: { companyEstimateVersion: { value: true, reason: true } }` (Prisma 7's global omit). `Tx` (`src/lib/audit/record.ts`) is
   derived from that client, so a transaction carries the same omit; a query that forgets the rule still cannot read them.
2. **One accessor.** `src/lib/scope/estimate-store.ts` is the only code that sets them back (`readSealedFigures`) and the only code
   that writes a version (`writeEstimateVersion`, which returns the row's id and number only). What it returns is `SealedFigures`,
   a branded type the pure functions read: `estimateView`, `againstBill` and `benchmarkRow` return `{ sealed: true }` unless the
   estimate is DISCLOSED and the figures are its own. A source-scan test (`src/lib/scope/sealed.test.ts`) fails on a second reader:
   another `omit` un-setting them, a select of `value`/`reason` in a file that touches the estimate, raw SQL against the versions
   table, a figure made outside the store, or `readSealedFigures` imported under `src/app` before 6.7 discloses at opening.
3. **Nothing written about it carries the figure.** Audit rows for a version read "Sealed (version N)" in the place of the figure and
   the reason (`estimateVersionAudit`), and the History renders any figure-shaped change of a version row the same way
   (`historyChange`). Estimate actions hand back codes only (`actionResult`), never the typed value or the reason. The typed value is
   seen only while it is typed, on the client. Estimate copies and scans never go in the document store (6.2 Q-2): the custody events
   record the paper.
4. **SULIT from creation, never lowered.** `CompanyEstimate.classification` is the shared `SecurityClass`, defaulted SULIT and held
   there by a CHECK; the lib refuses a lowering through the document store's `lowers()`.
5. **One live estimate per exercise, and a way out (OD-2).** A preparer who cannot continue has the estimate voided before
   lodgement (reason, audited, versions kept) and a new officer prepares a fresh estimate from version 1. At most one estimate not
   void per exercise: the lib (`startFault`), the exercise lock, and a hand-written partial unique index
   `CompanyEstimate_one_live_per_exercise (exerciseId) WHERE state <> 'VOID'`. `exerciseId` is therefore indexed, not unique.
6. **Closing binds once it exists (X-1).** `versionFaults` takes `closingAt`; 6.2's actions pass null and the finding reads
   "Closing not set" without blocking; 6.4 reads the locked `SourcingExercise.closingAt` and the refusal binds.
7. **On the exercise for now (OD-10).** The bill, the panel and the estimate hang off `SourcingExercise`; they move under Project
   when D5 is decided. Scope approval (OD-9) is a committee matter, `MatterKind.SCOPE` with a typed `bqVersionId`, three-state
   (`scopeApprovalRequired Boolean?`): unset shows "not set" and blocks `packFaults`, never reads as not required. It arrives with
   increment 2.

## Consequences

- A screen, an export or a report cannot show the figure by accident: the client does not return it. A future need to show it
  (6.7, opening) goes through `readSealedFigures` and `disclose()`, and the source scan names the new caller for review.
- The figure is still plain in the database. Anyone with database access can read it; the Company estimate tab says so. Sealed
  storage (encryption, two-share sealing) arrives with the electronic tender box in Phase 3 (NFR-SEC-003, 6.6 OD-1).
- `custodyList` and `viewFault` are built for sign-in and wired to nothing: before disclosure the answer is always "sealed".
- The demo writes versions through its own client, which has no omit; it never prints them and its audit rows use the same
  "Sealed (version N)" helper.
- Prisma does not model partial indexes or CHECKs; both live in the migration SQL and are confirmed in `pg_indexes` /
  `pg_constraint` after a rebuild, as the document store's are.
