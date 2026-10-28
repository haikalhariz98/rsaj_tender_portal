# Product owner rulings on Phase 2 close-out (2026-10-27): BINDING

Fold the [AMENDS] items into docs/notes/plans/closeout-plan.md and ADR 0047 before building.

1. **CO-1 approved.** EOT is a contract matter that writes a baseline version. Every act asks its ACT_STATUS family. Releases go through one ledger. Certificates use the 6.14 engine (ADRs 0029, 0030, 0032, 0022).
2. **CO-2 / D2 approved.** One `KIND_ISSUE_HOOK` map. `strandedFaults` reads its families from ACT_STATUS.
3. **CO-3 approved.** Matter signing reads `matterSigning` and replaces the fail-closed refusal (BD-613-121). TERMINATION stays refused.
4. **[AMENDS CO-4, §6.2 MakingGood, ADR 0047 D1]** `MakingGood` gains `frozenLines`.
   - The CMGD freezes every line with its end state; withdrawn lines keep their reasons.
   - The CMGD and the Close checklist say "n withdrawn, not made good".
5. **CO-5 approved.** The DLP is frozen on the CPC. If `dlp` is null on the baseline, the CPC is refused DLP_NOT_SET. If `applies` is false, go straight to the final account.
6. **[AMENDS §4.4]** The CMGD's computed snapshot carries the FR-CMP-015 fields: the performance bond value, the retention balance, and the guarantee or receipt numbers.
7. **CO-7 approved.** Securities are returned one at a time, with `securityId @unique`. The design guarantee bond survives the close. A cash bond needs its official receipt.
8. **[AMENDS §1 FR-FIN-008, step C4]** The RSAJ pack seeds `CloseoutDocumentRequirement` with three STATED items (CPD/INT-SFA-INDEN): as-built drawings, the CIDB levy certificate, and the receipt of water charges.
9. **CO-9, CO-10 and CO-11 approved.**
   - Contractor acceptance is the FINAL certificate's CONTRACTOR block, in the template's order.
   - Close is an audited act with no route.
   - D365 goes through the manual adapter only.
10. **[AMENDS §4.8, §6.2 stage D, §6.3]** Performance forms:
    - each form belongs to exactly one contract type; there is no general fallback, and a type with no form is refused FORM_NOT_SET;
    - grading reuses `evaluation/bands.ts` (`placeInBands`, `bandSetFaults`);
    - the scale Select and the CHECK run 2–10.
11. **D3 approved.** The final defects inspection is a day on `MakingGood`. Under FINAL_PAYMENT, the retention balance is written with Finance's payment. No DLP reads as FINAL_PAYMENT. `CompletionOpening` and the design guarantee bond's release act are deferred.
12. **[AMENDS ADR 0047 D4, ADR 0031]**
    - The supply ACTIVE → CLOSED edge is dropped.
    - The new PERFORMANCE_REPORT family is allowed in MAKING_GOOD_COMPLETE, and in PRACTICALLY_COMPLETE where the CPC is issued and there is no DLP.
13. **D5 approved.**
14. **Q1, release timing.** The RSAJ pack sets both of these to MAKING_GOOD, STATED; each source note names FR-FIN-012's final-payment reading. The first release stays at the as-built handover.
    - `retentionBalanceReleaseAt`: FR-PAY-021, OM/P/007 §8.26, SK009 §7.7.4.
    - `performanceBondReleaseAt`: SK009 §7.7.3–7.7.4, FR-CMP-016.
15. **Q2, sections and IT.** Sectional contracts and IT contracts are refused at the CPC, by name.
16. **Q3, release approval.**
    - Releases have no route of their own; the CMGD (`making_good`) or the FINAL (`final_payment`) is the approval of record.
    - The Retention and Securities cards name the certificate that authorised each release.
    - Close needs no route.
17. **Q4, performance report and close [AMENDS §4.6 finalRouteFaults, §4.7, §4.8 NOT_AT_CLOSE, §8, Q4; supersedes OD-B18].** Close keeps refusing; it does not just warn.
    - The report opens once the CMGD is issued, or once the CPC is issued where there is no DLP.
    - PERFORMANCE_NOT_FILED refuses sending the FINAL for approval, and is checked again at close.
    - FORM_NOT_SET refuses by name.
    - Stage order A → B → D → C.
    - New RSAJ question: confirm FR-FIN-014, and supply the seven CPD/SA-F0n performance workbooks.
18. **Q5, contracts completed before the system.** They stay at their status. Backlog row: in the go-live data migration, a contract certified complete on paper must not get a second CPC.
19. **Q6 cut [AMENDS §1 CC-05, §4.7 SUPPLY_CLAIMS_UNPAID, step C5, ADR 0047 D4].** Supply contracts do not close in Phase 2. The Close tab says closing is not built for supply contracts. Backlog row.
20. **[AMENDS §6.2]**
    - Drop `scope` and `sectionRef` from `PracticalCompletion` and `MakingGood`.
    - No general performance form.
21. **Stages.** One heavy builder, in the order A → B → D → C, with C5 removed. Stage B ships as one unit; check `git status` before each schema step.
22. **Musts unmet at go-live (deferred):**
    - FR-TRM-001..017;
    - FR-NSC-001..017, apart from the splits already built;
    - FR-CMP-002, FR-CMP-003, FR-CMP-005's failure loop, FR-CMP-006's IT variant, FR-CMP-014, FR-CMP-017's alert after close;
    - FR-LAD-010 and FR-LAD-011, FR-LAD-013's escalation;
    - FR-FIN-007 in part, FR-CMP-013 in part, FR-CMP-018 in part;
    - FR-CPR-001, 004, 005 (three of the four stages), 006, 007 and 008.
23. **EOT signatory.** This is not a stage A pack edit.
    - The demo EOT template uses an SO authorising block. A1 tests that it signs only after the matter is approved, and that the SO block resolves to the contract's S.O.
    - Backlog row: RSAJ certificate templates for every post-award kind.
24. **Termination is wholly out of Phase 2.** Binding on the termination run: both notices sign only after the termination matter's DAL approval (SK008 §7.5.1, §7.6.2). TERMINATION_INTENT moves to MATTER_APPROVED.
