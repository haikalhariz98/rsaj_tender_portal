import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import type { PaymentRows } from "@/lib/payment/load";

import { advanceRecoupedOf } from "./view";

/** Review of close-out stage C (Consider): a guarantee that secures no advance is "not applicable" (null), never "recouped", even once the final is paid. */

const rows = (advances: unknown[]) => ({ advancePayments: advances, interimValuations: [], openingPosition: null }) as unknown as PaymentRows;
const advance = { id: "a1", amount: "1000.00", security: { id: "apg1" }, certificate: { status: "ISSUED" } };

describe("advanceRecoupedOf", () => {
  it("is null for a guarantee securing no advance, the final paid or not", () => {
    expect(advanceRecoupedOf(rows([advance]), "other", true)).toBeNull();
    expect(advanceRecoupedOf(rows([]), "apg1", false)).toBeNull();
  });
  it("is settled once the final is paid, and not before while nothing is recouped", () => {
    expect(advanceRecoupedOf(rows([advance]), "apg1", true)).toBe(true);
    expect(advanceRecoupedOf(rows([advance]), "apg1", false)).toBe(false);
  });
});
