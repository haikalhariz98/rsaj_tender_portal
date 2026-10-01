import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { committedSen } from "./dashboard-sums";

describe("the dashboard's value approved, in sen (C6)", () => {
  it("adds exactly where a float would drift", () => {
    // 0.1 + 0.2 as amounts: a float gives 0.30000000000000004.
    const decisions = [
      { outcome: "CARRIED", domain: "appointment", amount: new Prisma.Decimal("0.10") },
      { outcome: "CARRIED", domain: "appointment", amount: new Prisma.Decimal("0.20") },
    ];
    expect(committedSen(decisions).total).toBe(30n);
  });

  it("adds a thousand one-sen amounts to RM10.00 exactly", () => {
    const many = Array.from({ length: 1000 }, () => ({ outcome: "CARRIED", domain: "appointment", amount: new Prisma.Decimal("0.01") }));
    expect(committedSen(many).total).toBe(1000n);
  });

  it("counts only carried appointments, and says how many stated no amount", () => {
    const r = committedSen([
      { outcome: "CARRIED", domain: "appointment", amount: new Prisma.Decimal("180000.00") },
      { outcome: "NOT_CARRIED", domain: "appointment", amount: new Prisma.Decimal("5.00") },
      { outcome: "CARRIED", domain: "vo", amount: new Prisma.Decimal("7.00") },
      { outcome: "CARRIED", domain: "appointment", amount: null },
    ]);
    expect(r).toEqual({ total: 18_000_000n, counted: 1, withoutAmount: 1 });
  });
});
