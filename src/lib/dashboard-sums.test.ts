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

describe("waiting days carry no fixed judgement (6.9 review ruling R5)", () => {
  it("no screen compares a waiting or days-away count against a literal number of days", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? (f === "generated" ? [] : walk(p)) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
      });
    // A count compared with a day figure written in the code: "aged over 14 days" was
    // one, and a threshold that varies by customer is configuration (AGENTS.md rule 1).
    // Comparing with 0 or 1 (today, one day) is wording, not a threshold.
    const literal = /\b(waitingDays|daysAway|daysWaiting|ageDays)\s*(>=|<=|>|<)\s*([2-9]|\d{2,})\b/;
    const found = walk(join(process.cwd(), "src")).filter((f) => literal.test(readFileSync(f, "utf8")));
    expect(found).toEqual([]);
  });
});

import { exerciseTally } from "./dashboard-sums";

describe("exercises by status (exerciseTally)", () => {
  const order = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "CANCELLED"] as const;
  it("counts each status, lists the ones with none, and leaves cancelled out of the open count", () => {
    const t = exerciseTally(["DRAFT", "DRAFT", "CANCELLED", "DOCUMENTS_IN_PREPARATION", "DRAFT"], order);
    expect(t.byStatus).toEqual([{ status: "DRAFT", count: 3 }, { status: "DOCUMENTS_IN_PREPARATION", count: 1 }, { status: "CANCELLED", count: 1 }]);
    expect(t).toMatchObject({ open: 4, total: 5 });
  });
  it("the open breakdown adds up to the open headline; cancelled is counted apart", () => {
    const t = exerciseTally(["DRAFT", "DRAFT", "CANCELLED", "DOCUMENTS_IN_PREPARATION", "DRAFT"], order);
    expect(t.openByStatus.reduce((n, b) => n + b.count, 0)).toBe(t.open);
    expect(t.cancelled).toBe(1);
  });
  it("is all zeros, not absent, when there are none", () => {
    expect(exerciseTally([], order)).toMatchObject({ open: 0, total: 0, byStatus: [{ count: 0 }, { count: 0 }, { count: 0 }] });
  });
});
