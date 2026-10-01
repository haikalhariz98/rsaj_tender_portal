# 0013 — The tender pack is frozen at submission; the tendering states are moved by one act each

**Status:** proposed 2026-10-01 with 6.4 increment 1, under the rulings X-1, X-2, X-5, X-6, X-8, X-9 and 6.4 Q-1 to Q-8
(`docs/notes/plans/phase2-rulings.md`; decisions log "· 6.4 ·" entries). Plan: `docs/notes/plans/6.4-tender-documents.md`.

## Context

FR-DOC-001 to 013 ask the portal to assemble an exercise's tender or quotation documents from configured parts, take them
through Approval for Tendering (§7.3.2: Documents in preparation → Pending approval for tendering → Approved for tendering,
or Returned for amendment), record DATE START and CLOSING DATE at approval, and issue nothing that later configuration can
quietly rewrite. The product has no sign-in, so an approval is recorded on behalf of a named Person. 6.2 built the scope's
readiness (`packFaults`) and the unpriced bill (`unpricedBq`) for 6.4 to enforce at submission (OD-4, OD-8). Before 6.4 an
exercise's routes were told apart only by `awardId: null`; a second exercise route would have read as the approval of the name.

## Decision

1. **A pack is a version on the exercise.** `TenderPack` (versionNo, status DRAFT | SUBMITTED | APPROVED | RETURNED | VOID)
   holds its parts (`TenderPackPart`) as resolved from configuration when it started (`compositionSnapshot`, per pack kind ×
   basis; a basis-specific part replaces the any-basis part of its role), its Appendix (`ConditionsAppendix`, FR-DOC-004) and,
   once frozen, its rendered parts (`TenderPackDocument`). At most one DRAFT or SUBMITTED per exercise: the lib
   (`startPackFaults`), the exercise and pack locks, and a partial unique index behind them.
2. **Submission freezes it.** In one transaction, after locking requisition → exercise → packs → the bill's, the panel's and the
   estimate's rows, every `submitFaults` finding is re-judged (the parts, 6.2's `packFaults`, the Appendix, the contract type's
   behaviours FR-MTD-012, the proposed dates, the route). On a clean result each template part is rendered from its body version
   with the pack's merge-field whitelist (ADR 0008 shape), the bill part is 6.2's bill unpriced (no rate, amount or total), the
   Appendix part is the Appendix in words, each uploaded part's live document versions are pinned (id, number, sha256) in the
   `manifest`, and the findings are kept (`faultsSnapshot`). Nothing frozen is re-rendered; a frozen part's attachments are
   frozen with it (document store owner `tenderPackPart`, exit PACK_FROZEN). A CHECK holds that a submitted, approved or
   returned pack was frozen.
3. **A return keeps the returned version.** A rejection on the route always returns the documents for amendment (Q-3): the
   route snapshots RETURN_TO_ORIGINATOR with provenance STATED at opening, never a configured destination, and on rejection
   the pack becomes RETURNED with the reason and the exercise goes back into preparation. The next version is started from it
   explicitly: its parts' states, templates and omissions, its uploaded files (each attachment judged again) and its Appendix
   are carried; the returned version stays as it was frozen. Ending the exercise is the separate cancel act, which voids a live
   pack and withdraws every pending route of the exercise's own (X-5).
4. **The tendering states are moved by one act each.** `transitionFault` names the act for each move (`via`): submission
   (DOCUMENTS_IN_PREPARATION → PENDING_APPROVAL_FOR_TENDERING, only with no blocking finding), the approving step (→
   APPROVED_FOR_TENDERING, only with the dates) and a rejection (→ DOCUMENTS_IN_PREPARATION). `moveExercise` is the one writer
   of those states and asks it on the status read under the lock (close-out C1's precedent). Every map over `ExerciseStatus` is
   exhaustive (X-8); the two values arrived each in its own migration before use (X-6).
5. **The approving step writes the dates, once (X-2).** The step that completes the route records the start day and the
   closing day and time (judged in the organisation's zone on the decision day; Q-5: only that they are there and in order).
   In the same act it writes `SourcingExercise.tenderingStartOn` / `closingAt` and freezes `approvedStartOn` /
   `approvedClosingAt` on the pack; a CHECK holds both. A source scan keeps that step the only writer (6.5's applied closing
   change will be the second, by name). 6.2's estimate actions judge versions against the locked `closingAt` (X-1).
6. **Exercise routes are split by domain (X-5).** `routesByDomain` and its shorthands are the one way a reader takes an
   exercise's routes; the loaders filter on award and domain; the worklist labels a route by its domain. Approval for
   Tendering is the engine's route under the domain `tendering_approval`, resolved from the customer's rows (none shipped, no
   approver named in code), with the requester rule (FR-APR-008) and the core snapshot as the name route has them.
7. **Before document assembly is a state of its own.** `packKindSnapshot` is written on the move into preparation and never
   backfilled: null means the exercise was prepared before 6.4, and it keeps the Phase 1 path, including the award gate (X-9:
   a TENDER or QUOTATION snapshot needs APPROVED_FOR_TENDERING for an award; null or NONE keeps DOCUMENTS_IN_PREPARATION).
   `documentPackKind` unset on the method blocks the move into preparation, naming the setting.

## Consequences

- An approved pack prints from its frozen rows only, with the fidelity line; a later template or Appendix edit changes
  nothing issued. 6.6 reads the tender documents' constituent list from `packManifest` (FR-CTE-007).
- The pack's text is plain in the database, as every frozen instrument is (ADR 0008).
- The bill and panel are frozen while the pack is with approval or approved (`PACK_FROZEN`); a change after approval is an
  addendum, which 6.5 builds. The estimate stays open until the closing.
- A route with a committee step is refused at submission, as the name's is: exercises are not tabled for these routes yet.
- Awards on exercises prepared before 6.4 are judged exactly as before; accepted and issued awards are not judged again.
- Partial indexes and CHECKs are not modelled by Prisma: they live in the migration SQL and are confirmed in `pg_indexes` /
  `pg_constraint` after a rebuild.
