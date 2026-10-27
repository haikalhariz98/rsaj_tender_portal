import { Prisma } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

const audits = vi.hoisted(() => [] as { ctx: { entity: string; entityId: string; reason: string }; action: string; changes: unknown }[]);
vi.mock("@/lib/audit/record", () => ({ writeAudit: async (_tx: unknown, ctx: { entity: string; entityId: string; reason: string }, action: string, changes: unknown) => void audits.push({ ctx, action, changes }) }));
vi.mock("@/lib/certificate/repo", () => ({ certificateLabel: () => "IPC 1" }));
vi.mock("@/lib/db", () => ({ db: {} }));

import type { CertCtx } from "@/lib/certificate/write";

import { correctFinancePayment } from "./finance-write";

// Phase 0.3 item 12: a certificate's payment is corrected by a new row on the act's own rule; its amount is the certificate's figure and is carried over.
const paid = { id: "fp1", paidOn: new Date("2026-10-05T00:00:00Z"), batchNo: "B-1", amount: new Prisma.Decimal("1000.00") };
function ctx(corrections: { paidOn: Date; batchNo: string; amount: Prisma.Decimal }[], payment: typeof paid | null = paid) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    financePayment: { findUnique: async () => (payment ? { ...payment, corrections: corrections.slice(0, 1), _count: { corrections: corrections.length } } : null) },
    paymentCorrection: { create: async ({ data }: { data: Record<string, unknown> }) => void created.push(data) },
  };
  const c = { tx, actor: {}, l: { org: { id: "o1" }, cert: { id: "c1", status: "ISSUED", issueSnapshot: { issuedOn: "2026-10-01" } } }, now: new Date("2026-10-20T01:00:00Z"), today: "2026-10-20" } as unknown as CertCtx;
  return { c, created };
}

describe("correctFinancePayment", () => {
  it("adds the next correction with the amount carried over, and audits the payment's before and after with the reason", async () => {
    audits.length = 0;
    const { c, created } = ctx([{ paidOn: new Date("2026-10-06T00:00:00Z"), batchNo: "B-2", amount: new Prisma.Decimal("1000.00") }]);
    await correctFinancePayment(c, { batchNo: "B-3", paidOn: "2026-10-06", reason: "Wrong batch." });
    expect(created).toEqual([{ organisationId: "o1", financePaymentId: "fp1", sequence: 2, paidOn: new Date("2026-10-06T00:00:00Z"), batchNo: "B-3", amount: "1000.00", reason: "Wrong batch.", recordedAt: c.now }]);
    expect(audits).toEqual([{ ctx: expect.objectContaining({ entity: "FinancePayment", entityId: "fp1", reason: "Wrong batch." }), action: "UPDATE", changes: [{ field: "batchNo", before: "B-2", after: "B-3" }] }]);
  });
  it("refuses in words, writing nothing: no payment; nothing changed; before the certificate was issued", async () => {
    await expect(correctFinancePayment(ctx([], null).c, { batchNo: "B-1", paidOn: "2026-10-05", reason: "x" })).rejects.toThrow("Not corrected: No payment is recorded, so there is nothing to correct.");
    const same = ctx([]);
    await expect(correctFinancePayment(same.c, { batchNo: "B-1", paidOn: "2026-10-05", reason: "x" })).rejects.toThrow("Not corrected: Nothing differs from the payment as it stands.");
    await expect(correctFinancePayment(same.c, { batchNo: "B-1", paidOn: "2026-09-30", reason: "x" })).rejects.toThrow(/Not corrected: .*before it was issued/);
    expect(same.created).toEqual([]);
  });
});
