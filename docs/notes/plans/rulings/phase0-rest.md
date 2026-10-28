# Phase 0.2 + 0.3: BINDING brief (2026-10-27)

Founder standards: simple and SaaS-grade, English only, minimal words, desktop only. Dropdowns over typing for any field with a known set of values. Use the design system in src/components/ui, and extend shared components rather than writing one-offs. Final-check screenshots: scratchpad `final-check/`. The 2026-10-25 and 2026-10-27 lines at the end of docs/notes/decisions-log.md give the context.

## 0.2 Polish (UI) — commit as its own group

1. **Suppliers list:**
   - the status chips row duplicates the in-card view chips: keep one, as Requisitions and Sourcing do;
   - status pills are cut off ("Approved, not in the finance sy…"): use a shorter label, or let the pill show the whole label.
2. **"Documents in preparation"** wraps onto two lines in Sourcing and Search: fix the label or the width.
3. **con3, Kick-off meeting card:** the info button wraps below the title. Fix it in the shared card header.
4. **Requisitions, default sort:** a dim ▲ shows on the Title column. Fix it in DataList server mode.
5. **Award Return tab while an online return waits:** the paper "acceptance page" card lists every field as "Not recorded". Collapse it to one short line ("Waiting on the return sent online."); keep the full card when there is no online return.
6. **Supply contract type, Behaviours drawer:**
   - "Interim payment rule" (free text) overlaps "How it is paid": keep only what a type whose route is set still needs;
   - "Contract sum adjustment drivers" is typed: make it a choice when its values are known in code or config, otherwise say so.
7. **Uncapped related-row loads:**
   - the search "case group" (a search for a case key);
   - the supplier record page's history.

   Cap or page both with the existing patterns (LIST_EXPORT_MAX_ROWS or DataList server mode), with a "Showing the latest N" line, plus tests.
8. **View controls differ across lists** (a View dropdown on Projects; chips on Requisitions and Sourcing; chips plus a segmented control on Suppliers). Do NOT build this. Write a one-paragraph proposal for one pattern.

## 0.3 Small fixes (logic) — commit each as its own commit

9. **An indent with validity NOT_SET.** `issueFaults` (`src/lib/award/gate.ts`, the work-indent block) refuses INDENT_EXPIRED but never judges an indent whose `AwardPolicy.indentValidityDays` is unset.
   - Ruling (orchestrator, AGENTS.md "gaps stay honest", FR-AWD-006 M "enforce"): issuing a WORK_INDENT is refused while the validity is not set, with words naming the setting: "Set the indent validity under Settings › Awards first." Use the existing settings label; no code on screen.
   - Remove the backlog row.
   - Test.
10. **The staff award screen offers Attach** on an expired indent's acceptance page; the act refuses it. Hide or disable Attach by the same reading (the `indentLate` owner fact or `indentReturnLate`), with the expiry line.
11. **The requisitions "Open" and "Over budget" chips** follow their own rules, not their view's status set. Make each chip count exactly its view's list (I-6 rule), then remove the backlog row.
12. **A payment recorded wrongly cannot be corrected** (`FinancePayment`, `SupplyInvoicePayment` are write-once).
    - Add a correction as a superseding record, never an edit: a new row linked to the one it corrects, with a reason, audited with before and after. Readers take the latest row.
    - Keep it minimal: day, amount and reference.
    - Who may correct: the same permission that records the payment.
    - A new migration if needed. Rehearse it up/down/up on `perolehan_native_check`, deploy it to both databases, and take a pg_dump before `perolehan`.
    - Tests. Remove the backlog row.
13. **Committee sitting (RSAJ Q6).** `assessQuorum` counts heads only, so 3 members without the chair count as quorate, and `sitting.ts` refuses any stand-in for the chair (STAND_IN_FOR_CHAIR), so SK003 7.6.3 (the absent chairman may appoint the CEO as chairman) cannot be recorded.
    - Make the chair's presence a configurable rule on the committee: unset, chair required, or chair or appointed stand-in. Default unset, so the existing behaviour is unchanged.
    - When the chair is required and absent, with no appointed stand-in, the sitting is not certified, and the words say why.
    - Allow recording a stand-in chair appointed by the chairman (the appointee and the appointing record) where the committee allows it.
    - The RSAJ pack sets the Tender Board to "chair or appointed stand-in", citing SK003 7.6.3 and 7.6.2.
    - Tests.
14. **CPR gap warning.** `bandSetFaults` warns of a gap (79 to 80) that whole-number rounding (`roundPlaces = 0`) closes. When `roundPlaces` is set, judge gaps on the rounded grid. Test.
15. **Schedule of Rates contract number (Q22(d)).** Only the S.O.R letter uses the quotation number as its contract number. Add a `QuotationContractKey` option, QUOTATION_NUMBER, available per contract type or method as the existing key is configured; the RSAJ pack sets it for Schedule of Rates (method `schedule_of_rates`) only. Tests.
16. **compare-screen.mjs:** its list-chrome check reads retired classes. Fix it cheaply, or retire it and update AGENTS.md, keeping ALLOWED_EXTRA's records in a note. Say which.

Out of scope: termination notice ordering and S.O. signatory templates (Phase 2), letter templates (Phase 4).
