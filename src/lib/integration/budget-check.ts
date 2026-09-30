/**
 * The budget-check façade (FR-REQ-007, INT-02, ADR 0004).
 *
 * `BudgetCheckProvider` is the contract. `portalLedger` computes the check from the
 * portal's own movement ledger through the requisition's budget code, with the code's
 * row locked for the length of the caller's transaction. `manualEntry` takes figures
 * typed from the finance system and stores them as typed. Which one runs is
 * `FinanceIntegration.budgetCheckSource`; unset runs neither. Nothing here contacts an
 * outside system.
 */

import type { Tx } from "@/lib/audit/record";
import type { BudgetCode, Movement, MovementKind } from "@/lib/budget/codes";
import type { Sen } from "@/lib/money";
import { ledgerCheck, manualSnapshot, type BudgetSnapshot } from "@/lib/requisition/budget";

export interface CheckInput {
  budgetCodeId: string | null;
  accountCode: string;
  /// The unit the requisition's cost centre belongs to, for the owner warning.
  costCentreUnitCode: string | null;
  requested: Sen;
  /// The organisation's day, midnight UTC.
  on: Date;
}

export interface BudgetCheckProvider {
  check(tx: Tx, input: CheckInput): Promise<BudgetSnapshot & { budgetCodeCode: string | null }>;
}

export const portalLedger: BudgetCheckProvider = {
  async check(tx, input) {
    if (!input.budgetCodeId) return { ...ledgerCheck(null, [], input, input.on), budgetCodeCode: null };
    // Lock the code for the transaction, so a commitment landing at the same moment is
    // either counted here or waits for this check's transaction to finish.
    await tx.$queryRaw`SELECT id FROM "BudgetCode" WHERE id = ${input.budgetCodeId} FOR UPDATE`;
    const row = await tx.budgetCode.findUnique({ where: { id: input.budgetCodeId }, include: { movements: true } });
    if (!row) return { ...ledgerCheck(null, [], input, input.on), budgetCodeCode: null };
    const code: BudgetCode = { ...row };
    const movements: Movement[] = row.movements.map((m) => ({
      ...m,
      kind: m.kind as MovementKind,
      amount: m.amount.toString(),
    }));
    return { ...ledgerCheck(code, movements, input, input.on), budgetCodeCode: row.code };
  },
};

/// A provider over figures already typed in from the finance system.
export function manualEntry(typed: {
  actualBudget: Sen | null;
  balanceAsAt: Sen;
  approvedAccount: Sen | null;
  projectedBalance: Sen | null;
  budgetCodeCode: string | null;
}): BudgetCheckProvider {
  return {
    async check(_tx, input) {
      return { ...manualSnapshot(typed, input.requested), budgetCodeCode: typed.budgetCodeCode };
    },
  };
}
