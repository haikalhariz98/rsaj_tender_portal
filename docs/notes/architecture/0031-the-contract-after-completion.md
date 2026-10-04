# 0031 — The contract after completion: five stored states, the rest derived, one act × status table

**Status:** Accepted (product owner's go with changes, 2026-10-04: decisions log "6.13 Part B · step 0 go WITH CHANGES",
BD-613-98, 99). Written at 6.13 Part B run 0; built in run 1a. Plan: `docs/notes/plans/6.13-post-award-lifecycle.md`
Part B, B4 (enum values), B5 `contract/status.ts`, B6 (/approvals).

## Context

`ContractStatus` stops at ACTIVE and `CONTRACT_TRANSITIONS` has `ACTIVE: []`. §7.3.3 names many states after Active:
practically complete, in defects liability, defects rectification, third-party rectification, making good complete,
pending final account, blocked on a statutory declaration, partially occupied, notice of intention issued, terminated,
terminated — account settled, suspended, final certificate issued, closed. Every Part A act reads `isExecuted`, which lists
EXECUTED, STAMPED and ACTIVE; a contract past practical completion would be refused by all of them unless the new states
join it. Several acts must stay possible on a terminated contract (the termination's own consequences) and almost none on
a closed one.

## Decision

1. **Five states are stored.** PRACTICALLY_COMPLETE, MAKING_GOOD_COMPLETE, FINAL_CERTIFICATE_ISSUED, TERMINATED, CLOSED,
   each its own enum migration. Transitions: ACTIVE → PRACTICALLY_COMPLETE → MAKING_GOOD_COMPLETE →
   FINAL_CERTIFICATE_ISSUED → CLOSED; PRACTICALLY_COMPLETE → FINAL_CERTIFICATE_ISSUED only where the DLP does not apply;
   ACTIVE → TERMINATED → CLOSED; nothing else.
2. **The rest are derived, in words.** `contractStage` (pure, tested) maps every §7.3.3 state after Active to stored,
   derived in words (Terminated — account settled; In Defects Liability; Defects Rectification; Third-Party
   Rectification; Pending Final Account; Blocked — Statutory Declaration; Partially Occupied; Notice of Intention Issued),
   or not built (Suspended). A settled termination is derived from the terminated account and its payment or demand,
   never stored.
3. **Suspended is not built.** No FR in these families defines a suspension act; a state no act enters is a dead state.
   This is a departure from §7.3.3, logged and on the founder's end-of-build list (BD-613-98).
4. **One table governs every act.** `ACT_STATUS` (act × status → allowed), exhaustive. CANCELLED refuses every act first.
   In TERMINATED it allows exactly the termination case, NOMINATED_INCREASE (renomination), the TERMINATED_FINAL route,
   the converse decision, bond claims, rectification and debt; a test enumerates them. `/approvals` reads the same table,
   never its own list. Every Part A act's current answer is pinned by a test before the table replaces `isExecuted`.
5. **Sections are derived.** A contract's status moves on its last scope; per-section completion lives on the section's
   records, not in the status.

## Consequences

- A screen can say where a contract stands in §7.3.3's words without a column for each.
- Adding an act means adding its row; a forgotten row is a type error.
- Rules out: storing a derived state, a SUSPENDED state with no act, and an act deciding its own allowed statuses.

## As built (run 1a, 2026-10-04)

- **States.** The five states are stored, each in its own migration (`20261004100201`–`205`). Each is written only by its
  own act (`STATUS_WRITTEN_BY`; `contractTransition` refuses WRITTEN_ONLY_BY_ITS_ACT): practical completion, making good,
  the final certificate, the termination and the close. No writer is built yet; they come with runs 2, 4 and 5.
  `isExecuted` (EXECUTED_STATES) covers every state after the signature, and the rules that listed EXECUTED, STAMPED and
  ACTIVE by hand now read it (payment's EXECUTED_STATUSES, copies, signing and stamping, the briefing note, the projects
  count, the contract's papers). Tests: act-status.test.ts "isExecuted covers every state after the signature; the
  payment rule reads the same list", "ACTIVE → PRACTICALLY_COMPLETE → …", "each new state is written only by its own act;
  none is cancelled".
- **The table.** `src/lib/contract/act-status.ts`: `ACT_STATUS` holds 35 acts by family × 14 states. It lists the 12
  families built before Part B (every one of the 99 exported acts maps to one) and Part B's 23. Every wrapper
  (`inContract`, `inCertificate`) and `/approvals` ask `actStatusFault` under the contract's lock. CANCELLED is asked
  first and keeps each wrapper's own words. A certificate's acts read its kind (`certificateAct`): TERMINATED_FINAL reads
  TERMINATED_FINAL_ROUTE, and the termination's two notices read TERMINATION_CASE. Tests: act-status-pin.test.ts (today's
  answers, pinned first at dcabd3f), act-status.test.ts "each act's answer is the pinned one", "in TERMINATED exactly
  these acts are allowed", "CLOSED: only what survives the close", "every act, and /approvals, read the table (source)",
  "the screens say what the acts would".
- **The act's own rule still speaks.** For the nine states that existed before, the table lets every act through except
  in CANCELLED, and the act's own rule judges execution and the rest in its own words. Only the new states get new
  refusals: CONTRACT_TERMINATED, CONTRACT_CLOSED, and NOT_IN_STATUS naming the state by its words, all in English and
  Malay.
- **Not yet covered.** Attaching documents to a contract's records is judged by the document store's owner rules, not by
  this table. For a contract past Active, its site-record purposes (diary photos, pipe log, as-built) are decided in run
  2, with the first writer of a new state (carry, BD-613-115).
