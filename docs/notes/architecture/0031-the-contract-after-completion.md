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
- **The table.** `src/lib/contract/act-status.ts`: `ACT_STATUS` holds 35 act families × 14 states, as the Run 1a fix round
  leaves it: the 13 families built before Part B (every one of the 99 exported acts maps to one; R2's ORIGINALS
  included) and Part B's 22 (R5's DESIGN_GUARANTEE_CLAIM included). Test: act-status.test.ts "35 families: 13 built
  before Part B (R2's originals included), then Part B's 22 (R5's design guarantee claim included)". (Run 1a's own
  note said 12 and 23; corrected here.) Every wrapper
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
- **Attachments** (run 1a left them to the document store's owner rules; brought forward by BD-613-115, see below).

## As built (Run 1a fix round, 2026-10-04)

- **Edges and rows (BD-613-119 R1 with review S2; R3; R4; BD-613-113).** Every CONTRACT_TRANSITIONS edge has its writer's
  family (WRITER_FAMILY) allowed in the state it leaves, and every state a writer's family allows leads to the state it
  writes, or is a named exception with its reason (EDGE_EXCEPTIONS: the award's cancellation; WRITER_ROW_EXCEPTIONS:
  SUPERVISION, MAKING_GOOD). TERMINATED also allows the close and the releases of a security and the design guarantee
  bond; TERMINATION_CASE only in ACTIVE and TERMINATED; COMPLETION, DEFECTS, RECTIFICATION and MAKING_GOOD from ACTIVE;
  PERIOD_EXTENSION not once practically complete. Tests: act-status-edges.test.ts "the writer's family is allowed in the
  state the edge leaves, or the edge is a named exception", "each such state has an edge to the written state, or is a
  named exception", "R1: a terminated contract is closed (TERMINATED → CLOSED is reachable)", "R3: …", "R4: …",
  "BD-613-113: …".
- **Two families (R2, R5).** ORIGINALS (registering and moving an original) is allowed in every state but CANCELLED,
  TERMINATED and CLOSED included. DESIGN_GUARANTEE_CLAIM is allowed in every executed state, terminated and closed
  included (a surviving obligation, FR-FIN-014). Tests: act-status.test.ts "registering and moving an original are
  allowed in every state but CANCELLED, TERMINATED and CLOSED included", "allowed in every executed state, practically
  complete, making good complete, the final certificate, terminated and closed included".
- **A certificate's family by phase (BD-613-114's condition).** `certificateAct(kind, phase)` is an exhaustive switch.
  Before its issue a certificate reads its kind's own family (EOT reads EOT, the CPC COMPLETION, the CMGD MAKING_GOOD,
  the final certificate FINAL_ACCOUNT until run 5 names its acts); after it, CERTIFICATE, except the termination's own
  certificates, which read their case or route (BD-613-120). `KIND_ISSUE_WRITES` names the state each kind's issue
  writes; the post-issue family is allowed there. Voiding an issued certificate whose issue wrote the status is refused
  (VOID_WOULD_UNDO_STATUS) until a run decides how a status is undone. Tests: certificate-act.test.ts "each kind, as the
  condition names them …", "for every kind whose issue writes a state, the post-issue family is allowed in that state",
  "a switch on the kind with a case per kind, no default and no fall-through return", "named, before the general rule,
  for each such kind; every other kind keeps ISSUED_IS_FINAL".
- **Attachments read the table (BD-613-115, brought forward).** Every contract attachment purpose reads its owning
  family's row first (`CONTRACT_PURPOSE_FAMILY`: the formation papers FORMATION, the programme and site records
  SUPERVISION, the instruction's plans VARIATION), then its own rule; a refusal is said in the table's words
  (`exitWords`). The site records are kept from possession (`possessionTaken`), so as-built evidence attaches at
  practical completion; CLOSED freezes every purpose. Tests: contract-act-status.test.ts "the attach screen and the
  store give the same answer for each purpose in each state", "CLOSED freezes every purpose, and nothing comes off a
  closed contract", "as-built evidence attaches at practical completion (no dead end for the 50% retention release)".
- **The screens ask the table (review S1).** No screen holds a status list of its own (`isExecuted`, `beforeExecution`,
  `briefingOpen`). Each contract panel section that offers an act states its family's refusal first
  (`actStatusBlocker`) and gates its drawers with it (`ActGate`, read by RecordEditor and Blocked). Tests:
  act-status-screens.test.ts "no .tsx file holds one: each reads isExecuted, the rule's own helper or the table", "each
  listed section asks the table (actStatusBlocker, or actStatusFault) for each of its families and gates its drawers
  with it".
- **Every way in asks the table (review S3).** A scan over every "use server" file and every file that takes the
  contract's or the certificate's lock finds each lock and each write to a contract-owned model (read from the schema);
  each asks `actStatusFault`, is reached only through a function that does, or is a named exception with its reason.
  The award's securities register asks FORMATION's row (BD-613-122). Tests: act-status-scan.test.ts "no uncovered site
  outside the named exceptions", "an ungated write, an ungated lock and a helper called from an ungated act are found; a
  gated wrapper, its acts and their helpers are not".
- **An unset DLP is said to be not set (review S8).** `contractStage` returns `notSet` beside `derived`: at practical
  completion an unset defects liability period claims no stage and is named, distinct from one that does not apply.
  Test: stage.test.ts "practically complete with the DLP not set: no stage claimed, and the DLP named as not set".
