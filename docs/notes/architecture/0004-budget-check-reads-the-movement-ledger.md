# 0004 — The requisition budget check reads the movement ledger

**Status:** proposed (plan `docs/notes/plans/6.1-requisition.md`, OD-2)

## Context

Two budget ledgers exist.

- `BudgetAllocation`/`BudgetCommitment`, keyed on cost centre and account code, is what `checkAgainstBudget` reads. No screen writes it: its editors in `src/app/configuration/budget/editors.tsx` are imported by no panel, and only `prisma/demo.ts` populates it.
- `BudgetCode`/`BudgetMovement` is what every Budget screen writes and totals (`figuresFor`). A `BudgetCode` names an account code and an owning unit, but no cost centre.

## Decision

- A requisition names a `BudgetCode`. Its check goes through `BudgetCheckProvider` (`src/lib/integration/budget-check.ts`), and the `portalLedger` adapter computes it from `BudgetMovement`.
- The requisition's account code must equal the budget code's account. A cost centre outside the code's owning unit warns and does not block.
- Each check is stored as an append-only `RequisitionBudgetCheck` snapshot: the four spec figures, the as-at date and the source.
- Approval writes a `COMMITMENT` movement in the same transaction, but only when `BudgetSettings.commitOnApproval` is true.
- `FinanceIntegration.budgetCheckSource` chooses the provider. When it is null, the screen says the source is not set.
- `checkAgainstBudget`, its tests and the old tables are left in place, **superseded and unread** by requisitions. Removing them is a later, separate decision.

## Consequences

- Only one ledger can say what is available, and the Budget screens and the requisition agree by construction.
- The finance system's figure is reconciled through the existing `FinanceVariance`, never adopted silently.
- If a customer's codes do not map one-to-one to an account, adding `BudgetCode.costCentreCode` later is additive.
- "Approved Account" is mapped as committed plus spent, with provenance ASSUMED, until the customer confirms what it means.
