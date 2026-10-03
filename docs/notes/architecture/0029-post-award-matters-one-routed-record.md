# 0029 — Post-award matters are one routed record (`ContractMatter`)

**Status:** Accepted (product owner's go with changes, 2026-10-04: decisions log "6.13 Part B · step 0 go WITH CHANGES",
BD-613-73, OD-B5 A). Written at 6.13 Part B run 0, before any Part B schema; built in run 1a. Plan:
`docs/notes/plans/6.13-post-award-lifecycle.md` Part B, B3 OD-B5, B4 run 1, B5 `matter/matter.ts`.

## Context

Part B has seven post-award matters that are decided on an approval route, several with a mandatory committee
recommendation: an extension of time (FR-EOT-007, the VOC's recommendation), a contract period extension (FR-EOT-012), a
LAD waiver (FR-LAD-009, routed at the ratio waived ÷ LAD amount), a termination (FR-TRM-005), a nominated-sum increase on
renomination (FR-TRM-010), a nomination's approval (FR-NSC-006) and a loss-and-expense claim (FR-EOT-006, OD-B20).

Today a route with a committee step exists only on a variation: `ApprovalInstance.variationId` and
`CommitteeDecision.variationId`, each with a CHECK tying it to MatterKind VARIATION, and the variation's own tabling
(`variation/tabling.ts`). `MatterKind.CONTRACT` exists and nothing uses it. Repeating the variation's shape seven times
would add seven foreign keys to each of the two tables, seven CHECK pairs, seven tabling paths, seven lock lines on
`/approvals` and seven approval-of-record hooks, each a place for one matter to drift from the others.

## Decision

1. **One record owns the route and the tabling.** `ContractMatter` (contract, kind EOT | PERIOD_EXTENSION | LAD_WAIVER |
   TERMINATION | NOMINATED_INCREASE | NOMINATION | LOSS_EXPENSE, reference from the `contract_matter` series at first send,
   the routed value or the exact ratio, the routing condition, the approval of record, closed with a reason). Each domain
   record (`EotClaim`, `PeriodExtension`, `LadWaiver`, `TerminationCase`, …) points to its matter by `matterId @unique`.
   This is the certificate precedent (ADR 0022) applied to routes.
2. **Routes and decisions point to the matter.** `ApprovalInstance.contractMatterId` with CHECK
   `(matterKind = 'CONTRACT') = (contractMatterId IS NOT NULL)`; `CommitteeDecision.contractMatterId` with CHECK
   `contractMatterId IS NULL OR matterKind = 'CONTRACT'`. A pre-check (the SELECT CAST pattern) proves no route or
   decision is a CONTRACT matter before the CHECKs are added.
3. **One tabling rule.** `tablingOf(matter)` generalises the variation's tabling: a committee step on a matter's route is
   tabled from the matter, never at a sitting (CONTRACT joins `RECORD_TABLED_MATTER_KINDS`). It lands in its own commit,
   flagged against Part A, with the variation's tabling tests unchanged.
4. **One approval of record.** Only an APPROVED latest route is a matter's approval of record; the certificate a matter
   authorises (an EOT certificate, the termination, a period agreement) reads it through one hook.
5. **The amount is not decided as SULIT or open.** A CONTRACT matter's amount stays "not decided" in
   `MATTER_AMOUNT_SULIT`, so every screen reads it as SULIT and chips it; whether it is SULIT is a question to RSAJ.
6. **No approver is added.** Every domain is a matrix domain the customer configures; rows ship empty.

## Consequences

- `/approvals` gains one lock line (`ContractMatter`), read under the contract's lock, and refuses by the one act × status
  table (ADR 0031).
- A matter's history (sent, tabled, recommended, approved, closed) reads the same for every kind.
- Rules out: a foreign key per domain record on the route tables, and a matter tabled at a sitting.
