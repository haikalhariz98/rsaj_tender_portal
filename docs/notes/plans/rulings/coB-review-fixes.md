# Close-out stage B: code-review fixes (2026-10-28), BINDING

Review range `60946238^..16f50d8c`. Fix each in its own commit, with tests. The product owner's rulings on items P2, P3, P7 and P11 are appended at the end of this file and are binding too.

## MUST

**F1. A first release recorded after the balance pays retention twice.**
- Where: `src/lib/payment/retention.ts:169`, in the `releaseOf` RELEASED_FIRST branch. It checks `already.first` only.
- Fix: `if (i.already.first || i.already.balance) f("ALREADY_RELEASED", …)`.
- Tests: a unit test for this order, and a db test through `releaseRetention`.

## SHOULD (no ruling needed)

**F4. Release and return days are not bounded by the certificate that authorises them.**
- Where: `payment-actions.ts:517` (`releasedOn`) and `closeout-actions.ts:368` (`returnedOn`) refuse only a future day.
- Fix: when the trigger is MAKING_GOOD, refuse a day before the CMGD's issue day (`issueSnapshot.issuedOn`).
- Tests.

**F5. The CMGD's printed figures go stale before issue.**
- Where: `closeout-actions.ts:330-342` computes the bond value, the retention balance and the "n made good, m withdrawn" line at raise. `cmgdAtIssue` (`at-issue.ts`) refreezes only `frozenLines`.
- Fix: recompute the snapshot, `computed` and the defects line in `cmgdAtIssue`, or refuse the issue when they differ.
- Test: an interim issued between the CMGD's raise and its issue.

**F6. Defect events are accepted on lines of a draft CPC.**
- Where: `closeout-actions.ts:232-245` (`onDefect`) and `portal/projects/defect-store.ts`.
- Fix: for a PRACTICAL_COMPLETION-source line, require `cpc.certificate.status === "ISSUED"` in both places.
- Also: `removeCpcDefect` on a line that has events must give a named refusal, not a foreign-key error.

**F8. The certificate lock scan misses `${w.matterId}` / `${w.id}`.**
- Where: `certificate-scan.test.ts:111` uses the regex `\$\{\w+\}`.
- Fix: widen it to `[\w.]+`, and list `unapplyWaivers`' two locks (ContractMatter, LadWaiver) explicitly, with the reason (all under the contract lock).

**F9. The DLP reminder fires only when someone opens the Completion tab.**
- Fix: build the `/projects?view=dlp` work view (plan B5) and/or run `dlpNotice` from the inbox loader, so reminders go out without anyone opening the contract.
- A late first read must not write every passed offset at once: write the latest passed offset only.

**F10. DLP_NOT_ENDED gives a date one day late.**
- Where: `closeout/labels.ts:43` is passed `endExclusive`.
- Fix: pass `dayPlus(endExclusive, -1)`, or reword to "can be raised from {day}".

## Consider (do them)

- `removeCpcDefect` (`closeout-actions.ts:180`): lock by id AND `"contractId"`.
- **SecurityRelease:** add a CHECK that the MAKING_GOOD trigger implies `certificateId IS NOT NULL`. This needs a new migration.
- `completionVariant` unset: warn rather than read it as standard (gaps stay honest).
- `cmgdSnapshotOf` takes the first PERFORMANCE_BOND only. Handle several.
- `SECURITY_KIND_WORDS[s.kind] ?? s.kind` (`closeout-actions.ts:341`): never put a code on a certificate. Use a labelled fallback.
- **Logic restated in components:**
  - the supplier panel's `state === "OPEN"`: use `defectActFaults`;
  - `closeout-panels.tsx:63`'s recount: use `withdrawnCount`;
  - the supplier Due column shows the rectify-by day for lines already made good.
- **Go-live backlog row:** triggers or grants freezing PracticalCompletion, MakingGood (snapshot, frozenLines) and SecurityRelease after issue (ADR 0008).
- The release switches are read live at organisation level, not frozen per contract. Record this as a backlog row for the product owner unless a ruling below says otherwise.

## Missing money-path tests (add every one, db tests where the brief says)

1. RELEASED_FIRST after RELEASED_BALANCE is refused.
2. A balance release through `releaseRetention`: refused before the CMGD issues, allowed after, refused a second time.
3. A balance with no first release (100% held), and a balance where a later interim holds less than the first release.
4. A balance release while an interim is in routing, and an interim after the balance, per ruling P2.
5. M2 end to end: a raise applying a waiver, then a void, then a re-raise that credits it again.
6. M3 through `raiseInterimCertificate` with two approved waivers.
7. M4 at send and at resend, and an abandoned waiver, per ruling P7.
8. `returnSecurity` through the act: cash without a receipt, an advance payment guarantee not yet recouped, a design guarantee bond.
9. The CMGD snapshot when an interim issues between its raise and its issue (F5).
10. The CPC's issue against an interim in progress.

## Product owner rulings (P2, P3, P7, P11)

- **P2 = ruling 1a (build now).** `releaseOf` refuses RELEASED_BALANCE with INTERIM_IN_PROGRESS while either of these exists, naming each:
  - an INTERIM_PAYMENT certificate in DRAFT, IN_ROUTING or SIGNING;
  - an OPEN valuation.

  The words point to `withdrawValuation`. Also, a valuation opened after a release may not be dated before that release's day (`openInterimValuation` bounds the day only by the last issued interim, and `tierSum` counts releases on or before the valuation day).
- **Ruling 1b [STAGE C carries; stage B shows it].** Interims after RELEASED_BALANCE are NOT zeroed; the final certificate settles them. Stage B's Retention card shows "Held since the balance was released: RM x, paid on the final certificate" whenever that figure is above nothing.
- **Ruling 1c (build now in releaseOf; stage C recovers).** If held minus the first release is below nothing in any tier, refuse the whole balance release with BALANCE_BELOW_RELEASED, naming the tier and amount. Never clamp to 0. The words say it is settled on the final certificate.
- **P3 = ruling 2 (build now).** `cmgdRaiseFaults` refuses FINAL_INSPECTION_BEFORE_DLP_END when `finalInspectionOn` is before the DLP's last day (`endExclusive − 1`), and before the issued Schedule of Defects' day where one exists. `madeGoodOn` is not before the practical completion date. Pure function, not a DB CHECK. Moving the days in the making-good.test.ts fixtures is a fixture fix: log it as one.
- **P11 = ruling 3 (build now).** This overrules stage B's widening and restores ADR 0047 D1, "during the DLP".
  - A LIABILITY_PERIOD line records an observed-on day, required by the act.
  - The column is nullable because the DefectItem trigger refuses UPDATE. It needs a NEW migration, with a CHECK holding the day to LIABILITY_PERIOD lines. Older lines read "Not recorded".
  - The act refuses OBSERVED_OUTSIDE_DLP when the day is before the practical completion date or after the DLP's last day, and DAY_IN_FUTURE when it is after today.
  - Reporting may lag the observation until the Schedule of Defects issues.
- **P7 = ruling 4 (build now; stage C reads it).** `waivedOnDecision` counts a waiver only when it is applied, or when its matter is open and approved (`matterApproved`) or its latest route is pending. Recorded-never-sent, returned, recalled or refused waivers count for nothing. No withdraw act (add a backlog row). Update the M4 comments in load.ts and waiver.ts. db test: waiver A is recorded at the full LAD and never sent; waiver B is sent against the full headroom; sending A is then refused WAIVED_PAST_LAD.
