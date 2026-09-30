# 0004 — The requisition budget check reads the movement ledger

**Status:** accepted 2026-09-30 by the product owner (`docs/notes/decisions-log.md`, "· 6.1 ·" entries; plan
`docs/notes/plans/6.1-requisition.md`, OD-2, OD-5, OD-6)

## Context

Two budget ledgers exist.

- `BudgetAllocation`/`BudgetCommitment`, keyed on cost centre and account code, is what `checkAgainstBudget` reads. No screen writes it: its editors in `src/app/configuration/budget/editors.tsx` are imported by no panel, and only `prisma/demo.ts` populates it.
- `BudgetCode`/`BudgetMovement` is what every Budget screen writes and totals (`figuresFor`). A `BudgetCode` names an account code and an owning unit, but no cost centre.

## Decision

- **The code and the provider.** A requisition names a `BudgetCode`. The check goes through `BudgetCheckProvider` (`src/lib/integration/budget-check.ts`), and the `portalLedger` adapter computes it from `BudgetMovement`. The account must equal the budget code's account. A cost centre outside the code's owning unit warns and does not block.
- **Snapshots.** Each check is an append-only `RequisitionBudgetCheck` snapshot: the four spec figures, the as-at date and the source.
- **Approved Account.** It is **committed + spent, provenance ASSUMED, stored on each snapshot with that provenance**, until RSAJ finance confirms the meaning.
  - The verdict never reads it. It is computed from the balance and the requested amount alone.
  - The identity `actualBudget − approvedAccount = balanceAsAt` is checked on portal-ledger snapshots only.
  - Figures entered by hand from the ERP are stored exactly as typed and never corrected.
- **Over budget.** An EXCEEDS requisition always routes with the over-budget condition, never by band. It proceeds automatically, with a warning, only when `BudgetSettings.availabilityCheck` is `warning`. When the setting is `blocking` or **unset**, the officer must invoke the over-budget route explicitly, and unset also shows "control not set".
- **Commitment.** Approval writes a `COMMITMENT` movement in the same transaction only when `BudgetSettings.commitOnApproval` is true. It is dated on the organisation's today. A closed period refuses the approval and names the period.
- **Provider choice.** `FinanceIntegration.budgetCheckSource` chooses the provider. When it is null, the screen says the source is not set.
- **The old ledger.** `checkAgainstBudget`, its tests and the old tables are left in place, **superseded and unread** by requisitions. Removing them is a later, separate decision.

## Consequences

- Only one ledger can say what is available, and the Budget screens and the requisition agree by construction.
- The finance system's figure is reconciled through `FinanceVariance`, never adopted silently.
- If a customer's codes do not map one-to-one to an account, adding `BudgetCode.costCentreCode` later is additive.
