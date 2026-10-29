import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import type { PaymentRows } from "@/lib/payment/load";

import { paidDiffersOf } from "./final-load";

/** S1 of the code review of close-out stage C: a recorded payment other than the certified figure is named with both, at its latest correction. */

const snap = (key: string, value: string) => ({ figures: { lines: [], totals: [{ key, value }] } });
const cert = (kind: string, number: string, figure: [string, string], paid: string | null, corrected: string | null = null) => ({
  kind,
  number,
  status: "ISSUED",
  issueSnapshot: snap(...figure),
  financePayment: paid == null ? null : { paidOn: new Date(), batchNo: "PV/1", amount: paid, corrections: corrected == null ? [] : [{ paidOn: new Date(), batchNo: "PV/1A", amount: corrected }] },
});
const rows = (interims: unknown[], advances: unknown[] = []) => ({ interimValuations: interims.map((certificate) => ({ certificate })), advancePayments: advances.map((certificate) => ({ certificate })) }) as unknown as PaymentRows;

describe("paidDiffersOf", () => {
  it("names a part payment of an interim and an advance paid over its figure, and passes those paid exactly or not yet paid", () => {
    const r = paidDiffersOf(rows([cert("INTERIM_PAYMENT", "IPC/1", ["recommended", "100000.00"], "100000.00"), cert("INTERIM_PAYMENT", "IPC/2", ["recommended", "50000.00"], "40000.00"), cert("INTERIM_PAYMENT", "IPC/3", ["recommended", "1.00"], null)], [cert("ADVANCE_PAYMENT", "APC/1", ["advanceAmount", "48000.00"], "48000.01")]));
    expect(r).toEqual([
      { label: "Interim payment certificate IPC/2", certified: 5000000n, paid: 4000000n },
      { label: "Advance payment certificate APC/1", certified: 4800000n, paid: 4800001n },
    ]);
  });
  it("reads the payment at its latest correction", () => {
    expect(paidDiffersOf(rows([cert("INTERIM_PAYMENT", "IPC/2", ["recommended", "50000.00"], "40000.00", "50000.00")]))).toEqual([]);
  });
});
