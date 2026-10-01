# Phase 1 close-out — committee gate, rejection destination, escalation, acceptance checklist

**Status:** proposed, for the product owner's go. Written against `0f99974` on `build-all-modules`, while 6.11 is
being fixed, so nothing here touches award code until 6.11 is accepted (step 6). Spec: §6.1, §6.9, §6.10, §13.3, B4.
Line references are at `0f99974`. The sourcing and award actions are being edited by the 6.11 fixes, so re-find them by name.

## 0. What this closes, and what reading the code found

Two Phase 1 Musts belong to modules that are already built: FR-REQ-012 (DL L159) and FR-APR-016 (DL L101, B4). The
code also turned up five things the close-out has to settle:

1. **The state machine is bypassed.** `citeCommitteeDecision` (`src/app/requisitions/actions.ts:1165`) moves
   PENDING_APPROVAL straight to DRAFT or CLOSED. `TRANSITIONS` has no such edge, and `moveStatus` never asks
   `transitionFault`. The fix: every rejection lands on REJECTED and then takes its destination, both in one transaction.
2. **FR-APR-009 (M) is not built and has no log line.** No approval step offers a conflict declaration; only
   committee recusal exists. It uses the same mechanism as FR-APR-010, so it is proposed here (CO-6).
3. **Requisition routes never apply absence.** `submitRequisition` (`actions.ts:787`) passes no `absentRoleCodes`,
   though 6.11 computes them for appointments (`award/appointment.ts absentOffices`). Separately, a **vacant** office
   is "not absent" (6.11 BD-2, DL L37). Either way a pending step can have nobody to decide it. Once the first
   decision is recorded, recall is refused, so the matter is stuck with no exit.
4. **Five "carried within Phase 1" items point at Phase 2 modules**: FR-MTD-008 → 6.5, FR-MTD-012 → 6.4/6.12/6.13,
   FR-MTD-013 → 6.4, FR-MTD-009 evidence → document storage, and FR-APR-010 delivery → queues (DL L21, L145). Each
   needs a re-designation ruling (CO-8).
5. **The 6.9 Musts mostly have no decisions-log line.** The engine was built before the autonomous build, so §9
   cites the handoff for them and asks for acceptance entries (CO-9).

## 1. Requirements in scope

| ID | Pri | Today | This plan |
|---|---|---|---|
| FR-REQ-012 | M | Committee *steps* inside a DAL route only. No gate, no Perlu / Tidak Perlu / Tidak lulus | A committee gate **outside the DAL**, per funding route, between approval and sourcing. Outcomes come from 6.10's vote plus `NotApprovedOutcome` (LOOP / TERMINAL); loop-back enforced; minutes as text (attachment deferred, DL L177) |
| FR-APR-016 | M | Reject with a reason on every step. Then the officer picks Reopen or Close (requisition), re-request (name approval), or Draft (award) | A per-matter-type `RejectionDestination` that ships unset. It is snapshotted when the route opens and applied when a step rejects. Unset → the officer chooses, and that is recorded as a choice, never as policy |
| FR-APR-010 | M | Absence and self-approval escalate at resolution. NO_RULE refuses and names the escalation. No escalation of a pending step. No queue | Escalate a **pending** step to the office's configured superior (`escalatesToCode`) with a reason. Requisition submission applies absence. An **office worklist** at `/approvals`. Personal delivery waits for sign-in (CO-7) |
| FR-APR-009 | M | Not built | The same step escalation, with kind CONFLICT_DECLARED, the declarer and the declaration on the trail (CO-6) |

## 2. Data model — one migration `phase1_closeout`, additive, every new column nullable, zero rows shipped

No migration comment may contain a semicolon (DL L192). New snapshot columns backfill null, never current
configuration (LESSONS). Money is Decimal(18,2).

**Committee gate (FR-REQ-012)**
- `FundingRoute.committeeGateRequired Boolean?` + `committeeGateProvenance Provenance?`. Null means nobody has
  said, and it **blocks** opening an exercise, naming the setting. False means this route has no gate. True means
  the gate rules for the route apply. Edited beside `approvalCommitsBudget` in Configuration › Budget.
- `CommitteeGateRule`: `organisationId, fundingRouteCode, committeeCode, subjectEn, subjectMs?, act AuthorityAct,
  aboveValue Decimal?` (strictly above; null means any value), `governingSource, provenance, effectiveFrom,
  retiredOn?, sortOrder`. Unique per (org, route, committee, effectiveFrom). Edited in Configuration › Requisitions.
- `RequisitionGate`: `requisitionId, gateRuleId (Restrict), committeeCode, committeeLabel, subjectEn, act,
  ruleProvenance, determinedOn`. Unique per (requisition, rule). A snapshot of the rule as it read.
- `Requisition.gatesDeterminedOn DateTime?`. Set at approval. Null on requisitions approved before this lands, and
  the exit is "Check committee gates".
- `CommitteeDecision.requisitionGateId String?` (FK, Restrict, indexed). A decision serves one gate or one route
  step, never both. A gate matter is tabled under the domain key `committee_gate`.
- `Committee.carriedLabelEn String?`, `carriedLabelMs String?`: what this body calls a carried decision (an RSAJ
  seed would say "Perlu"). Null renders "Carried". `NotApprovedOutcome` already names the not-carried outcomes.

**Rejection destination (FR-APR-016)**
- `enum RejectionDestinationKind { RETURN_TO_ORIGINATOR RETURN_TO_STEP TERMINATE }`
- `enum RejectionSource { CONFIGURED COMMITTEE_OUTCOME OFFICER_CHOICE }`
- `RejectionDestination`: `organisationId, domain` (the `AuthorityRule.domain`, i.e. the matter type), `kind,
  returnToRoleCode?` (required only for RETURN_TO_STEP; an `AuthorityRole.code`), `governingSource, provenance,
  notes, effectiveFrom, retiredOn?`. Unique per (org, domain, effectiveFrom). Ships **zero rows** (B4, customer policy).
- `ApprovalInstance`:
  - the destination as it stood at open: `rejectionDestinationId?`, `rejectionKind?`, `rejectionReturnToRoleCode?`,
    `rejectionProvenance?`. Null means not set at open.
  - what was applied: `rejectionApplied RejectionDestinationKind?`, `rejectionSource RejectionSource?`,
    `rejectionChosenByPersonId?` (recorded on behalf, not signed).
  - `supersedesInstanceId String? @unique`, for the successor route RETURN_TO_STEP opens (ADR 0005: re-routing
    opens a new instance).
- `ApprovalStep.carriedFromStepId String? @unique`: a decision carried onto a successor route. It is read-only and
  renders "decided on the earlier route".

**Step escalation (FR-APR-009/010)**
- `enum StepEscalation { NO_AVAILABLE_HOLDER CONFLICT_DECLARED }`
- `ApprovalStep`: `actingRoleCode?`, `actingRoleLabel?`, `escalation StepEscalation?`, `escalationReason?`,
  `escalatedOn?`, `declaredByPersonId?`. `roleCode` is never rewritten. Holders are judged on
  `actingRoleCode ?? roleCode`.

**State machine (`src/lib/requisition/status.ts`)**
- Add REJECTED → PENDING_APPROVAL, allowed only with a successor route.
- Add APPROVED → CLOSED ("Closed without sourcing"), allowed only when a gate has ENDED. It releases the commitment
  (`BudgetMovement.releasedOn`, `releaseNote`) under PORTAL_LEDGER. General abandonment stays with RSAJ (6.3 BD-1, DL L73).

## 3. Pure functions and tests (`src/lib/**`, vitest; each test fails if its rule is removed)

| Function | Rule and tests |
|---|---|
| `requisition/gate.ts` `gatesFor(route, rules, req, on)` | Returns NOT_SET / NONE / RULE_MISSING / rules. `aboveValue` is compared in sen: RM50,000.00 is not above RM50,000.00, and RM50,000.01 is. Two rules on one route give two gates (F2's "CAPEX alongside Technical", with invented committees) |
| `gateState(gate, decisions)` | Built from `decisionRecord()` only. Returns AWAITING (none yet, or deferred), PASSED (carried), RETURNED (not carried, LOOP), ENDED (not carried, TERMINAL), or OUTCOME_NOT_RECORDED (not carried with no snapshot: blocks, exit is re-table). Ordered by decision date, then tabledAt, then id. **Spec acceptance test:** Tidak lulus → RETURNED; re-tabled Perlu → PASSED; Tidak Perlu → ENDED |
| `gateCitationFault(matter, gate, req, citedOnStep)` | Faults: NOT_THIS_REQUISITION, OTHER_COMMITTEE, OTHER_ACT, NOT_GATE_DOMAIN, CITED_ON_ROUTE_STEP, ALREADY_CITED, DECIDED_BEFORE_GATE, GATE_ENDED. Loop-back is enforced: a RETURNED gate passes only on a *later* carried decision. The returning decision cannot be cited again |
| `method/exercise.ts` `openFault` (extend) | New faults GATES_NOT_DETERMINED, GATE_NOT_SET, GATE_RULE_MISSING, GATE_AWAITING, GATE_RETURNED, GATE_ENDED. SOURCING_NOT_PERMITTED still comes first (F4/F5). Existing 6.3 tests unchanged |
| `authority/rejection.ts` `destinationFor(rows, domain, on)` | Uses `activeOn` (effective.ts). Unset returns `{ set: false }`. Two rows with the same effective day are refused on save (`destinationRowFaults`) |
| `rejectionOutcome({ snapshot, committee, steps, rejectingSeq, supports })` | Returns `{ apply, source, returnToSeq? }` or `{ choose: kinds[], why: NOT_SET \| STEP_NOT_ON_ROUTE \| NOT_SUPPORTED }`. A committee's snapshotted LOOP maps to originator and TERMINAL to terminate (CO-3). RETURN_TO_STEP targets the earliest step of that office *before* the rejecting step. **Worked examples (FR-REQ-009):** RM300,001.00 (HoD P → HoDiv R → FD MR → CEO A), CEO rejects, destination returns to Head of Division → HoD carried; HoDiv, FD and CEO pending. RM49,999.00 (HoD R → HoDiv A) with a return to Functional Director → STEP_NOT_ON_ROUTE, so the officer chooses. Editing the configuration after open changes nothing |
| `successorSteps(route, returnToSeq)` | Steps before the target are carried (`carriedFromStepId`, their decisions and citations unchanged). Steps from the target onward are PENDING. The chain is never shortened (FR-APR-004). The R2 rule stays as it is |
| `status.ts` `transitionFault` (extend) | REJECTED → PENDING_APPROVAL needs `successor: true`. APPROVED → CLOSED needs `gateEnded: true` and a reason. Tested both ways |
| `authority/escalation.ts` `stepEscalation(step, ctx)` | Returns `{ toRoleCode, kind }` or faults: NOT_PENDING, COMMITTEE_STEP, HOLDER_AVAILABLE, NO_SUPERIOR_SET (names the office's "escalates to" setting), REASON_REQUIRED, DECLARER_NOT_ENTITLED, TOO_MANY_HOPS. **FR-APR-009 test:** the declarer is removed and the immediate superior holds the step. **FR-APR-010 test:** HoDiv vacant → FD, with the reason kept |
| `approvals/queue.ts` `officeQueue(steps, roles, today)` | Pending steps across requisition, name-approval and appointment routes, grouped by acting office. Shows waiting days on the organisation's day, the escalation reason, and the matter by label. A step is listed once, under its acting office |
| `requisition/labels.ts`, `authority/labels` | `gateStateLabel`, `gateFaultText`, `rejectionLabel`, `rejectionFaultText`, `escalationText`, all tested. No codes reach a screen |

## 4. Actions (each re-validates on locked rows, writes its audit rows in the same transaction)

- **Rejection, generic helper `applyRejection(tx, inst, outcome)`**: closes the route as REJECTED, then moves the
  matter. Requisition: PENDING_APPROVAL → REJECTED, then → DRAFT, CLOSED, or PENDING_APPROVAL with a successor. Every
  move is audited and goes through `transitionFault` (fixes finding 1). `choose` leaves the matter in REJECTED, with
  "Where it goes next" offering only the supported kinds. The chosen kind is stored as OFFICER_CHOICE with the
  Person and a reason. The same helper serves `recordDecision` and `citeCommitteeDecision`, and then the exercise's
  name approval (`src/app/sourcing/actions.ts:603`).
- **Opening a route** (submit, name request, and award submission after step 6) snapshots `destinationFor()`.
- **Gates**:
  - `approve()` writes the gates and `gatesDeterminedOn`.
  - `checkCommitteeGates` covers older approvals.
  - `citeGateDecision` links a decision to a gate.
  - `closeWithoutSourcing` is allowed only after a gate ENDS.
  - The sourcing create action and `moveToPreparation` pass the gate finding to `openFault`.
- **`escalateStep`**: kind, reason, and for a conflict the declaring Person. Holders are re-read in the transaction.
  `submitRequisition` passes `absentRoleCodes`, computed by `absentOffices`, lifted to `src/lib/authority/absence.ts`
  after 6.11 is accepted.

## 5. Screens (shared components only; checked at 1280, 1440 and 390 against sibling screens)

- **Requisition › Approval tab.**
  - A "Committee gates" card: committee label, subject, state badge, the citation (sitting, date, the outcome under
    the committee's own label), and "Minutes recorded as text · signed copy not attached".
  - Actions: Cite the committee's decision, Check committee gates, Close without sourcing.
  - Disabled actions show `actionsNote`. A NOT_SET callout links to Configuration › Budget.
- **Every route** (requisition, name approval, award) shows **"If rejected: …"** beside the step being decided, or
  "Not set — the officer will choose". A rejected matter shows a "Where it goes next" card with its exits and a callout
  linking to the setting.
- **Pending steps** offer "Escalate" (drawer). An escalated step reads "<office> · escalated from <office>: <reason>".
  A declaration reads "Conflict declared by <person>, recorded on behalf, not signed".
- **`/approvals` "Awaiting decision"**, under Work.
  - DataList by office: matter, act badge, waiting since, escalation.
  - The header says it is shown to everyone until sign-in and that nobody is notified.
  - Added to `ALLOWED_EXTRA`. The dashboard card "Requisitions waiting" links to it.
- **Configuration.**
  - Approval matrix gets a card, "When a matter is rejected": one row per matter type, "Not set" when unset, a
    provenance badge, effective from. Changing a row asks for a reason.
  - Budget › Funding route gets "Needs a committee gate".
  - Requisitions gets "Committee gates" (rules).
  - Committees gets "Name for a carried decision".

## 6. Build order

| # | Agent | Step |
|---|---|---|
| 0 | product-owner, solution-architect | Rule on CO-1 to CO-9. Write ADR 0009 (rejection destination and successor routes) and ADR 0010 (committee gate outside the DAL) |
| 1 | data-modeler | Migration `phase1_closeout` (§2). Prove it by rebuilding a throwaway database and diffing (DL caveat) |
| 2 | domain-engineer + test-engineer | §3 functions and tests, contracts first. A `status.test.ts` assertion against the new edges gets only the minimal faithful update, flagged |
| 3 | workflow-engineer | §4 for requisitions and name approval, including the finding-1 fix and absence at submission |
| 4 | frontend-engineer | §5 requisition, exercise and `/approvals` screens |
| 5 | frontend-engineer | §5 configuration screens. Save validation by hand (no schema library) |
| 6 | workflow-engineer | **After 6.11 is accepted**: wire the appointment route to `applyRejection` and `escalateStep`. Award TERMINATE means Cancelled under BD-17 |
| 7 | domain-engineer | Demo data (§8). Wipe in dependency order, refusing when non-demo rows depend on demo rows |
| 8 | code-reviewer, ux-reviewer, product-owner | `npm test`, typecheck and lint. Browser pass. Acceptance. Log entries |

## 7. Open decisions for the product owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| CO-1 | Where the gate sits | A: before DAL submission. **B: after approval, before the first exercise** | **B.** §5 step 3 follows the DAL chain (step 2), and the gate sits "outside every DAL matrix". A loop re-tables the paper without unmaking the DAL approval or its commitment. Provenance ASSUMED; ask RSAJ |
| CO-2 | What "Tidak Perlu" means | a: not carried, TERMINAL (project not needed). b: carried, proceed. c: gate waived | **Ship the mechanism.** a and b are customer configuration. Build c only if RSAJ says so. Question for RSAJ (B4 owner) |
| CO-3 | Committee not-carried outcome vs configured destination | Committee governs / configuration governs | **Committee governs.** It is the body's recorded decision, snapshotted (6.10 B4 ruling). Configuration covers person steps |
| CO-4 | When the destination is snapshotted | At route open / at rejection | **At open.** Approvers see the consequence (FR-APR-019 spirit). A mid-route edit cannot change it (LESSONS) |
| CO-5 | Behaviour while unset | Block rejection / **officer chooses, recorded** | **Officer chooses.** Rejection must never be refused (FR-APR-016 needs an explicit outcome, and there is no dead end). Recorded as OFFICER_CHOICE, never shown as policy |
| CO-6 | Add FR-APR-009 to close-out, and may MR/MA/MJR steps escalate? | Include / log a deferral. Mandatory steps: allow / refuse | **Include.** Allow mandatory person steps to escalate for a declared conflict (DAL §1.5 recuse-and-escalate is not delegation). Refuse it for vacancy until RSAJ rules. Committee steps never escalate |
| CO-7 | FR-APR-010 queue | Office worklist now / wait for sign-in | **Worklist now**, marked partly met: escalation and an office queue with the reason are built. Personal delivery and notification wait for sign-in (log) |
| CO-8 | Items carried "within Phase 1" whose home is Phase 2 | Build now / re-designate | **Re-designate** to their named Phase 2 modules, on the FR-CTE-007 precedent (DL L175: §13.3 keeps sourcing outside Phase 1). Exception: FR-MTD-009 evidence blocks every direct appointment (6.11 BD-4, DL L39), which breaks "issue a compliant award instrument". Get RSAJ's paper-evidence answer, or schedule document storage before Phase 1 acceptance |
| CO-9 | 6.9 Musts with no log line | Record acceptance entries / re-review | A code-reviewer pass against the §6.9.3 worked examples, then one log entry per item. FR-APR-015 export and tamper-evidence, and FR-APR-012 moving pending steps on absence, are unbuilt: rule build or defer |

## 8. Demo data (invented, `demo_` ids, ASSUMED provenance)

- **Routes and gates.** An invented capital route sets `committeeGateRequired = true` with two gate rules:
  `demo_gr1` (Technical Committee `demo_c4`) and `demo_gr2` (new `demo_c5` "Capital Works Committee", quorum and
  voting rule invented). The opex route sets false. One route stays unset, to show the blocker.
- **Labels.** `demo_c5` has an invented carried label; not-approved outcomes LOOP "Revise and re-table", TERMINAL "Not required".
- **Requisitions.**
  - `demo_rq25`: gate awaiting.
  - `demo_rq26`: returned at sitting `demo_mt8`, then passed at `demo_mt9`. Exercise allowed.
  - `demo_rq27`: gate ended, closed without sourcing, commitment released.
  - `demo_rq28`: rejected under a configured return to the Head of Division step, with a successor route.
  - `demo_rq29`: rejected while unset, officer's choice recorded.
- **Destinations and escalations.** `demo_rd1` (requisition: return to the Head of Division's step); name approval unset. One step escalated for a vacancy, one for a conflict.

## 9. Phase 1 acceptance checklist (§13.3). DL = `docs/notes/decisions-log.md` line at `0f99974`

| Module | Must | Status | Citation |
|---|---|---|---|
| 6.9 | FR-APR-001, 002, 003 | Built before the autonomous build. No log line | handoff.md §3; CO-9 |
| 6.9 | FR-APR-004, 007, 008 | Built | DL L95 (BD-1), L78 (R1), L90 (BD-22), L93 (Q3); audit unattributed until sign-in L173 |
| 6.9 | FR-APR-005, 006 | Built | DL L97 (BD-11); L36 (6.11 BD-3), L71 (6.3 BD-3) |
| 6.9 | FR-APR-009 | **Open, unlogged.** This plan | CO-6 |
| 6.9 | FR-APR-010 | **Open.** Escalation at resolution built; pending-step escalation and queue in this plan | DL L37, L21; CO-7 |
| 6.9 | FR-APR-011 | Partly: line-management rules and task-limited discharge deferred (sign-in) | AGENTS.md; DL L97 |
| 6.9 | FR-APR-012 | Partly: upward reversion at routing. Moving pending steps unbuilt, no log line | CO-9 |
| 6.9 | FR-APR-013 | Built (mechanism; rule set empty, OQ-06) | DL L174 |
| 6.9 | FR-APR-015 | Partly: immutable rows in the same transaction. Export and tamper-evidence unbuilt, no log line | CO-9 |
| 6.9 | FR-APR-016 | **Open.** This plan | DL L101; CO-3/4/5 |
| 6.9 | FR-APR-019 | Built on route display (clause, band, chain). No log line | CO-9 |
| 6.9 | FR-APR-020 | Built (versioned, draft → issued). Maker-checker deferred until sign-in | AGENTS.md; DL L179 |
| 6.10 | FR-CTE-001–006, 009, 010, 012 | Built, accepted c2e55c8. Minutes attachment, memo, maker-checker and per-matter presence deferred | DL L102, L177, L178, L179, L104 |
| 6.10 | FR-CTE-007, 008, 013 | Deferred to Phase 2 (6.4–6.6) | DL L175 |
| 6.10 | FR-CTE-014 | Closed by 6.11, subject to acceptance | DL L125, L21 |
| 6.1 | FR-REQ-001–009, 015 | Built, accepted 4d1b426. FR-REQ-003 "named user" waits for sign-in | DL L74, L161 |
| 6.1 | FR-REQ-010 | Partly: completeness return built. Letter and anggaran pack deferred (D5, storage) | DL L160 |
| 6.1 | FR-REQ-012 | **Open.** This plan | DL L159; CO-1/2 |
| 6.1 | FR-REQ-013 | Built in 6.3, accepted cd9eca1 | DL L142, L40 |
| 6.1 | FR-REQ-016 | Closed for LoA and Inden Kerja by 6.11 (subject to acceptance). PO and contract signature use the same `commitmentFault` | DL L124, L21 |
| 6.3 | FR-MTD-001–006, 011 | Built, accepted cd9eca1 | DL L40, L142 |
| 6.3 | FR-MTD-007 | Partly: hiding and access logging wait for sign-in | DL L143 |
| 6.3 | FR-MTD-008 | Gate built. Enforcement → 6.5 (Phase 2) | DL L145, L67; CO-8 |
| 6.3 | FR-MTD-012, 013 | Profile and basis built. Enforcement and composition → 6.4/6.12/6.13 | DL L145; CO-8 |
| 6.3 | FR-MTD-014 | Built, except "populates the basis" (contradiction sent to RSAJ) | DL L150 |
| 6.11 | FR-AWD-001–008, 012, 013 | Built, **pending 6.11 acceptance** | DL L120, L21 |
| 6.11 | FR-AWD-009 | Clock and cancellation built. Blacklisting → 6.15 | DL L122 |
| 6.11 | FR-AWD-011 | Deferred to Phase 2 | DL L121 |
| 6.12 | FR-CON-001, 002, 008 | Built in 6.11 (minimal, gate only), pending acceptance | DL L120, L127 |
| 6.12 | FR-CON-003–007, 009, 011–014 | Deferred to Phase 4a | DL L123 |

Phase 1 is accepted when every **Open** row is closed or carries a logged ruling, 6.11 is accepted, and CO-8/CO-9 are ruled.
