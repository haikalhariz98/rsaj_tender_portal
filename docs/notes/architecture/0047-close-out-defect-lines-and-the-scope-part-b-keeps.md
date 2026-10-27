# 0047 — Close-out: certificates freeze defect lines that live on, and the scope Part B keeps

**Status:** Accepted, 2026-10-28. Written by the solution architect for Phase 2, close-out and time; the product owner ruled on
2026-10-27 (24 rulings) and accepted it once the amending rulings 4, 6, 8, 10, 12, 17, 19 and 20 were folded in. The build plan
is `docs/notes/plans/closeout-plan.md`, whose §11 lists every ruling and where it lands. Q1 to Q6 are answered there. Stages run
A → B → D → C. Termination is wholly out of Phase 2.

**Numbering.** 0026 to 0028 were never claimed. 0026 was proposed in the 6.16 draft for the performance report and was never
written. 0047 follows 0046.

**Relation to other records:**
- **Uses** ADR 0008 (frozen instruments), 0022 (the certificate record), 0029 (the contract matter), 0030 (extensions are
  baseline versions), 0034 (actors) and 0042 (the Project workspace). All are unchanged.
- **Amends ADR 0031** (D4 below): one family. The supply ACTIVE → CLOSED edge first proposed here is dropped (ruling 12).
- **Amends ADR 0032** (D3 below): how the final defects inspection is held, who writes the balance under FINAL_PAYMENT, and two
  deferrals. Decisions 1, 2, 4 and 6 of 0032 stand as written.
- **Replaces, for Phase 2, the 6.13 Part B plan's run 2 and run 5 data shapes** (D5). That plan was ruled "go with changes"
  (BD-613-72..102), but it is a plan, not a record. This ADR is where the change is written down.

## Context

**The roadmap of 2026-10-27 un-parks close-out.** Part B's foundations are built:
- the five states after Active and the act × status table (ADR 0031);
- the contract matter and its route (ADR 0029);
- the EOT records and the acts up to sending the claim;
- every certificate kind.

None of them reaches a screen. The founder asks for simple, SaaS-grade screens.

**The Part B plan was written for the full scope.** It has fourteen run 2 and run 5 tables, among them inspection iterations,
snag items, defect reports, directions, schedule items, third-party rectifications, debt claims, an eleven-item pack, declaration
fields and a Finance confirmation table.

**Phase 3, which comes next, is a work-item engine.** Defect is one of its item types, with a board, assignees and comments. If
Phase 2 builds defect tracking as a module of its own, the two phases end with two homes for the same fact.

## Decision

**D1. One live defect line, frozen by the certificate that certifies it.**
- `DefectItem` is a line: its description, location and due day. It comes from the CPC's list of outstanding and defective work
  (FR-CMP-007) or from a report during the defects liability period (FR-CMP-011).
- `DefectEvent` is append-only (by trigger): reported rectified, made good, returned, withdrawn.
- A line's state is derived from its events by one pure function, and is never stored.
- A Schedule of Defects (FR-CMP-013) lists the lines still open when it is issued. It does not copy them into lines of its own.
- Each certificate freezes the lines it certified in its domain row's `frozenLines` at issue (ADR 0008): the CPC, the Schedule of
  Defects and the CMGD (`MakingGood.frozenLines`, ruling 4).
- The CMGD freezes every line with its end state, made good or withdrawn. A withdrawn line keeps its reason. The CMGD and the
  Close checklist say "n withdrawn, not made good".
- **The Phase 3 seam:**
  - a Defect work item points at a line by a unique foreign key that Phase 3 adds;
  - it moves the line's state only by calling the defect acts;
  - its board column is read from the derived state.
  - The work item adds people, comments, photos and the board.
  - The line stays the legal record.
  - A certificate already issued is never touched.

**D2. One issue-hook map for the close-out kinds.**
- `KIND_ISSUE_HOOK` gives each of EOT, CONTRACT_PERIOD_AGREEMENT, PRACTICAL_COMPLETION, SCHEDULE_OF_DEFECTS, MAKING_GOOD_DEFECTS
  and FINAL two functions:
  - a refusal before issue (the basis moved);
  - the writes after issue (a baseline version, the supersession, the frozen lines, the status).
- A status is written only through `contractTransition` with the writer that `STATUS_WRITTEN_BY` names.
- A status-writing issue is refused while any open matter, claim or certificate belongs to a family that `ACT_STATUS` would refuse
  in the status it writes. The list is read from the table itself, so no work is left that no act can finish.
- The payment and variation hooks are left where they are.
- Signing a matter-approved kind reads the matter's approval (`matterSigning`), replacing the refusal that failed closed
  (BD-613-121). TERMINATION has no record in Phase 2 and stays refused.

**D3. Amendments to ADR 0032:**
- **The final defects inspection** that the retention balance needs (0032 decision 3) is held as a day on the CMGD's own record,
  not as a joint-inspection row.
- **Under `retentionBalanceReleaseAt = FINAL_PAYMENT`,** the balance is part of the final certificate's payment. Its ledger row is
  written when Finance's payment of that certificate is recorded, in the same transaction. There is still one ledger, and nothing
  is released twice.
- **A contract with no DLP** has no CMGD, so a MAKING_GOOD event is read as FINAL_PAYMENT for it.
- **Deferred:** `CompletionOpening` (0032 decision 5) and the design guarantee bond's release act. The bond is listed as surviving
  the close (0032 decision 4 holds: nothing releases it early).

**D4. Amendments to ADR 0031** (ruling 12):
- **No supply edge.** Supply contracts (paid on delivery order and invoice) do not close in Phase 2: they have no defined release
  event (ruling 19). The ACTIVE → CLOSED edge is not added. The Close tab says closing is not built for supply contracts, and a
  backlog row holds it.
- **A new family, PERFORMANCE_REPORT,** is allowed in MAKING_GOOD_COMPLETE, and in
  PRACTICALLY_COMPLETE where the CPC is issued and there is no DLP (the act judges the DLP).
- The family count changes. The change is flagged in its commit.

**D5. What Phase 2 does not build from the Part B plan's runs 2 and 5** (each named, with where it goes):
- **Inspection iterations:** Phase 3 inspection items. The passing inspection is recorded on the CPC.
- **Snag, report, direction and schedule-item tables:** D1's one line.
- **Third-party rectification, debt and bond claims:** deferred.
- **The eleven-item pack fixed in code:** the contract's own certificates, plus a configured list of extra documents.
- **The statutory declaration's fields as data:** the contractor's declaration document, taken up by an officer (PDPA data
  minimisation; FR-FIN-007 partly met).
- **A Finance confirmation table:** three columns on the final account.
- **Sectional completion and the IT variant:** refused at the CPC by name until built. `PracticalCompletion` and `MakingGood`
  carry no `scope` or `sectionRef` (ruling 20); sections arrive with their own migration.

**D6. The contractor performance report is its own record, not a certificate kind.**
- The report has a configured form (criteria with weights, a scale of 2 to 10, grade bands, shipped empty), one report per
  contract, and scores entered by an assessor.
- Each form belongs to exactly one contract type. There is no general form and no fallback: a type with no issued form is refused
  FORM_NOT_SET by name (ruling 10). Grading reuses `evaluation/bands.ts` (`placeInBands`, `bandSetFaults`).
- The report opens once the CMGD is issued, or once the CPC is issued where there is no DLP. PERFORMANCE_NOT_FILED refuses
  sending the FINAL for approval and is checked again at close (ruling 17). Close refuses; it does not warn.
- It is filed by a verifier who must be a different signed-in person (CHECK and act).
- A certificate kind would fan out to every exhaustive kind map (numbering, routing, figures, labels, the library) for a form that
  has no approval route and no money. The 6.16 draft's option A is therefore not taken.
- The draft's configuration shape is kept, so its later stages, share groups and the evaluation link can be added without moving
  data.

## Consequences

- **What the work item can rely on.** Phase 3's Defect item has one line to point at and one set of acts to call. Its board can
  never disagree with what the CMGD checks, because both read the same derived state.
- **What issue can rely on.** Every close-out certificate issues through one engine and one hook map. A new kind's after-issue
  writes are one entry, and a status written outside its named writer is a test failure.
- **What the screens can do.** The close-out stage reads one pure function (`closeoutNext`) for its next line and main button. No
  component decides what comes next.
- **What is ruled out:**
  - defect status stored twice;
  - a work item that edits a certified line;
  - a schedule that copies lines;
  - releasing the retention balance both by its own act and inside the final payment;
  - a performance report signed off by the person who scored it.
- **What is harder.** A contractor who never rectifies a line blocks the CMGD until an officer withdraws it with a reason, because
  third-party rectification is not built. That is said on the line, and the reason is audited.
