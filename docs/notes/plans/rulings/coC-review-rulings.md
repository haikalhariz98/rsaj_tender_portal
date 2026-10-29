# Close-out stage C: product owner rulings on the code review (2026-10-29), BINDING

Review range `f2794a80^..f7173009` (C1–C3, C4, C6). The product owner ruled for the founder. Each ruling below is binding. Work marked **[build now]** goes into one fix pass, with one commit per ruling and tests. Work marked **[backlog]** or **[go-live]** is a row the builder adds to `docs/notes/backlog.md`, in the same pass.

Two of the review's options rested on something that is not in the code. They are corrected here:
- The DEBT family (decision 3) is only a slot in ACT_STATUS. There is no model and no act behind it, and debt claims (FR-CMP-014) are deferred by ruling 22.
- `payment/waterfall.ts` (decision 4) is already built. Interims call it at `assemble.ts:300`, and `waterfallRemainder` is already a setting.

## 1. A contractor's refusal of the FINAL blocks its issue [build now]

The spec asks the contractor to *accept* the final account, with a witness, and to declare it has no further claims (FR-FIN-009; §10 "Final certificate signed and accepted with no further claims"). A refused acceptance is therefore not a final certificate. Today a disputed FINAL still issues, is paid and closes.

Ruling (b): the refusal is still recorded, with its reason. The FINAL then cannot issue until it is voided and raised again.
- **Where:** the refusal goes in `KIND_ISSUE_HOOK.FINAL` (`issue-hooks.ts` / `at-issue.ts`), as `FINAL_NOT_ACCEPTED`, naming the refused block and its day. It does **not** go in `certificate/signature.ts`. That rule is generic, and variations rely on a refusal holding nothing up (FR-VAR-022).
- **Void:** the existing void path already un-applies the waivers. The refusal and its reason stay in History.
- **Words:** the refusal's words come from `src/lib`, keyed on the kind. Today the portal dialog (`supplier/projects/[id]/controls.tsx`) says "the certificate may still be issued". That is false for a FINAL. Under ruling 2 the FINAL is not signed in the portal at all, but the officer's paper-recording path needs the same kind-specific words.
- **Tests:**
  - pure: the hook refuses a refused CONTRACTOR block on a FINAL, and lets the same block through on a VARIATION;
  - db: refuse, then void, then re-raise, then accept, then issue.

Not built: a switch letting a disputed final issue under a dispute route. If RSAJ's conditions call for one, it can be added later. Add an RSAJ question to `docs/notes/rsaj-questions.md`: "May a final certificate the contractor disputes still issue (dispute or arbitration route)?"

## 2. No portal signing where a witness must sign on paper [build now; the later option is backlog]

FR-FIN-009 and FR-FIN-013 require a witness signature after the contractor's. Nobody witnesses a portal signature, so an officer "recording the witness from paper" would be recording a paper that does not exist. Whether a step-up portal signature can stand in for a witness is a legal call and a customer call. It is not ours to make.

Ruling (c), stated structurally:
- The portal refuses to sign a CONTRACTOR block that a WITNESS block follows on the pinned form. The refusal is `WITNESS_ON_PAPER`, with words saying that this certificate is signed on paper.
- Remove `"FINAL"` from `CONTRACTOR_SIGNS_KINDS` (`src/lib/portal/projects/certificates.ts`; added in f7173009).
- Check the refusal against the form's blocks too, so that a VARIATION or SUM_ADJUSTMENT form that a customer gives a witness block is covered.
- **Demo and tests:** `prisma/demo-close.ts` and the FINAL portal case in `projects.db.test.ts` move to the officer recording both blocks from paper. Flag this in the commit as a **stricter** test change. Add a db test showing that portal signing of the FINAL is refused.
- **[backlog]** Row: "Portal signature in place of a witness (FR-FIN-009)". It becomes a per-template switch, unset by default (unset means paper), once RSAJ answers. Add the RSAJ question as well.

## 3. FINAL_NEGATIVE keeps refusing. The amount owed is shown, and the contract stays open [build now: words only; the recovery is backlog]

Neither (b) nor (c) is acceptable:
- Option (b) would close the contract with the debt held nowhere but a printed line. It would also build FR-CMP-014 debt claims, which ruling 22 defers.
- Option (c) would put a negative payment through `PAID_FIGURE` and FinancePayment.

A contract that cannot close because the contractor owes money is an honest gap. A closed contract with an untracked debt is not.

Ruling (a):
- `FINAL_NEGATIVE` stays a block (`final-account.ts:144`).
- The Final account tab shows the amount the contractor owes as "Owed by the contractor: RM x", from `finalAccountOf`'s figure. It says that the contract stays open until recovery is built. Never show 0.
- The words in `closeout/labels.ts` drop "check the deductions" as the only explanation.
- Test: the words and the shown figure, for the fixture with 5,827.88 owed.
- **[backlog]** Row: "Recovery of an amount the contractor owes on the final account", tied to FR-CMP-014 (deduction from monies due, a claim against the bond, a debt claim). The DEBT family is already allowed in FINAL_CERTIFICATE_ISSUED and CLOSED for it.
- Add the RSAJ question: "Does form 9a (CPD/SFA(T)) carry an amount-due-to-the-employer line, and is a nil final issued in that case?"

## 4. The final account's party split: build it on the existing waterfall [build now]

FR-FIN-011 is a Must. Plan §4.6 says to build it, and ruling 22 defers FR-NSC only "apart from the splits already built". The `PARTY_SPLIT_NOT_BUILT` refusal departed from the plan without a ruling. The amount of work is small:
- A per-party line on the final account, keyed while it is DRAFT. Each line is one live `ContractParty` and the amount it is due on the final, as **totals only**, as printed (ADR 0025, B1). It follows the pattern of `PartyLine`, with a new additive migration.
- Call the **existing** `waterfall(recommended, parties, policy.remainder)`. Do not rewrite or copy `waterfall.ts`. Its faults include NOT_SET when the remainder rule is unset.
- Freeze the allocations into the snapshot and `judgedUnder`, so that `FINAL_BASIS_MOVED` covers them.
- Print each party separately, as the interim does (`payment-panels.tsx`).
- Retire `PARTY_SPLIT_NOT_BUILT`. In its place, `PARTY_DUE_NOT_RECORDED` names each live party that has no line.
- **The interim gap (fix in the same pass):** an interim whose NSC or NS value is above nothing, with no live ContractParty of that kind, pays everything to the main contractor today. Refuse it by name in `assemble.ts` with `NOMINATED_PARTY_NOT_RECORDED`, naming the tier. Apply the same check to the final account.
- **Tests:** pure, with sufficient funds, insufficient funds (the nominated tier first, then the assignees, then the contractor) and a remainder that is unset; db, a final with one NSC; the interim refusal.

## 5. OD-B9: the builder's mapping is ratified [build now: documents only]

The reviewer showed that both readings give the same payment only under the builder's mapping. Under that mapping:
- **BEFORE_DEDUCTIONS:** previous is each interim's carry-forward. The deduct block carries only what no interim took, and the advance line is what is not yet recouped.
- **AS_PAID:** previous is what was recommended, as paid. The deduct block carries every deduction, and the advance line is the whole advance.

The parenthetical in the plan would have under-paid or over-paid. `final-account.ts:15-22` already records the reversal, and the property test holds.

The builder corrects three things:
- the OD-B9 row in `docs/notes/plans/6.13-post-award-lifecycle.md:538`;
- closeout-plan §4.6 ("Less: previous interim payments (by the switch)"), adding one line that says what each reading deducts;
- the `FINAL_BASIS_WORDS` options in Settings › Post-award controls, if they describe the plan's meaning rather than the code's. The demo stays ASSUMED BEFORE_DEDUCTIONS.

## 6. MAX_OTHER_FINAL_DEDUCTIONS = 3 stays in code [build now: comment only]

Ruling (a). This is not a threshold, a rate, an approver or a weighting. The specification states it as the form's definition: FR-FIN-006 says "up to three other permitted deductions", and the §8 formula is "Σ(3 other deductions)". The interim's FR-PAY-011 says the same.
- Add a one-line comment at `final-account.ts:83` citing FR-FIN-006 and the §8 formula.
- If a second customer's form differs, the limit moves onto the certificate template. Do not do this now.

## 7. Finance-only acts stay open to transaction staff until roles land [go-live]

Ruling (a). No act in the product checks for Finance today, the interim FinancePayment included. A guard on the FINAL alone would make it differ from the act beside it. The confirmation already names the Person who confirmed (`paper("FinalAccount", "financeConfirmedBy")`), so the audit shows who acted.
- **[go-live]** Row under "Go-live conditions": "Finance's acts restricted to Finance". It covers every Finance act: FinancePayment on every payable kind, `confirmFinalPayments`, supply payments, and the FINAL payment with its retention-balance write. FR-FIN-004 names the Head of Accounts & Finance, so these acts must be restricted to a configured Finance office (unset refuses) before go-live.

## 8. Variations not yet on an issued adjustment refuse the raise [build now]

Ruling (a). The final sum is the original sum plus the issued adjustments only (FR-FIN-003). A variation that is approved or commenced but not yet on an issued Certificate of Adjustment would silently drop out of the final account. Nothing can add it after the final issues.
- `finalPreconditionFaults` refuses `VARIATIONS_NOT_ADJUSTED`, naming each variation by its reference. This covers variations that are approved but not on an issued adjustment, and variations commenced but still pending a decision.
- **Checked again at send and at issue.** `judgedUnder` lists only what was read at raise, so a variation approved after the raise would not trip `FINAL_BASIS_MOVED`. Add the same check to `finalRouteFaults` and to the FINAL issue hook.
- **Tests:** pure; db, in both orders, as C3 requires: a variation approved before the raise, and one approved while the FINAL is in routing.

## 9. Close refuses any issued payable certificate that is not paid [build now]

Ruling (a). FR-FIN-014 closes the contract "on completion of final payment".
- Generalise `FINAL_NOT_PAID` in `closureFaults` to `CERTIFICATES_NOT_PAID`. It covers every ISSUED certificate of a payable kind with no `FinancePayment`, including interims, advances and the FINAL, and names each one.
- Tests: pure; db, closing with an issued, unpaid interim.

## Migration 20261210000700_closeout_final, edited after it was applied: recorded, no further action

The builder edited the migration after applying it locally and patched its checksum by hand. Neither fix is needed:
- **Pushing:** only f2794a80 touches the file, and the branch has no remote.
- **The schema:** `prisma migrate status` reports that the schema is up to date (299 migrations), and C6 was checked on a fresh database.

Fix only this: if a separate test database applied the earlier text, run `db:reset` on it. From now on, an applied migration is never edited and a checksum is never patched. Every change is a new additive migration (coD M4). Add a line in the commit message that records the edit.

## Order of the fix pass

1, 2 and 3 (the FINAL's acceptance and the amount owed), then 8 and 9 (refusals), then 4 (the migration and the split), then 5 and 6 (documents and the comment), then the rows for 2, 3 and 7. Run `npm test`, `npm run typecheck` and `npm run lint` at the end, and also the db tests the rulings name. Re-run `demo:load` on a fresh database, and con13 must still reach CLOSED, with its FINAL signed on paper.
