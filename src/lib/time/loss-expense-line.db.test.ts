import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";

/** Phase 2 close-out stage A2 (migration 20261208000000_loss_expense_line): only a loss-and-expense line of an adjustment names a claim. */

describe("SumAdjustmentLine_loss_expense", () => {
  it("is the CHECK the migration adds, refusing a claim on any other trigger", async () => {
    const [row] = await db.$queryRaw<{ def: string }[]>`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'SumAdjustmentLine_loss_expense'`;
    expect(row.def).toMatch(/"lossExpenseClaimId" IS NULL/);
    expect(row.def).toMatch(/trigger = 'LOSS_AND_EXPENSE'/);
  });
});
