# Close-out stage A: code-review fixes (2026-10-28), BINDING

Review range: `85440036^..803cf3eb`. Fix each item in its own commit, each with a db test. Must 3 needs a new migration.

## MUST fix (money path)

**M1. The same loss-and-expense claim on two lines of one adjustment is paid twice**
- Where: `src/app/projects/[id]/variation-actions.ts:1069-1079`.
- Cause: `lossOf` is not de-duplicated, and `claim.adjustmentLines` is still empty when the lines are checked.
- Fix: refuse a duplicate claim id before the loop, with a finding like LOSS_ALREADY_ADJUSTED. The drawer should not offer a claim already picked on another line.
- Test: one db test.

**M2. A waiver applied on an interim that is later voided is stranded**
- Where: `payment-actions.ts:446-451` sets `LadWaiver.appliedOnCertificateId`, and `voidCertificate` (`src/lib/certificate/write.ts:502`) never clears it, so the credit is lost.
- Fix: in the same transaction as an INTERIM_PAYMENT void, clear `appliedOnCertificateId` and `appliedAt` together (the CHECK requires both), audited. The other option is to read "applied on a VOID certificate" as unapplied everywhere, as pending deductions do; pick one.
- Test: a db test with void, then re-raise, which credits again.

**M3. Two waivers on one interim crash the raise**
- Cause: `LadWaiver.appliedOnCertificateId` is `@unique` (`schema.prisma` ~12320, index `LadWaiver_appliedOnCertificateId_key` from migration 20261004110201). The second write is a P2002, and every interim on that contract is refused.
- Fix: a NEW migration that drops the unique index and creates a plain index. The Certificate back-relation becomes a list: fix every reader of it.
- Test: a db test with two waivers on one raise.

**M4. Waivers on one decision can add up past the LAD amount, and then block every later interim**
- Where: `damages-actions.ts:87` and `:123`.
- Fix: at record and at send, take the other open, approved and applied waivers on the same decision off the LAD amount before comparing.
- Test: a db test.

## SHOULD fix

**S1. The resend guard disagrees with the raise**
- Where: `damages-actions.ts:151-153` compares the frozen amount only, against `basisOn` read today.
- Fix: compute `applicationOf({ …, now: waiverBasisOf(p, baseline, d, storedDay(w.asOf)) })`, require `state === "MOVED"`, and filter the Waivers card's resend options the same way (`payment-panels.tsx`).

**S2. A returned EOT claim cannot be re-sent from any screen**
- Fix: in `src/lib/time/claim-state.ts`, make SEND the primary action when the latest route is REJECTED with RETURN_TO_ORIGINATOR, or RECALLED. Update `claim-state.test.ts`.

**S3. The claim page always says "The whole works"**
- Where: `eot/[claimId]/page.tsx:139` is hard-coded.
- Fix: derive the text from `c.scope` / `c.sectionRef`.

**S4. The TERMINATION refusal is no longer pinned**
- Fix: assert that `certificateMatterFacts` (`src/lib/time/at-issue.ts:39-48`) handles only EOT and CONTRACT_PERIOD_AGREEMENT, and returns null for TERMINATION.

## Consider (cheap, do them)

- **`payment-actions.ts:449`:** `return CHANGED` inside the transaction commits a partial write. Throw instead.
- **"Both orders" test:** the one in `eot-certificate.db.test.ts` runs only one order. Make it run both.
- **The Time tab restates rules:** `toSend`, `periodOpts`, the period chips, and `lossStateOf`'s inline `matterApproved`. Move them behind pure rules in `src/lib/time`.
- **One primary action per card:** Loss and expense, Waivers and Contract period.
- **SumAdjustment CREATE audit** (`variation-actions.ts:1090`): name the claim each loss line pays.
- **An OMISSION-direction loss line** marks its claim as paid: require ADDITION.
