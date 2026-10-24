import { describe, expect, it } from "vitest";

import { requisitionPipelineSplit } from "@/lib/dashboard/pipeline";
import { EXERCISE_STATUS_ORDER } from "@/lib/method/labels";
import type { ExerciseStatus } from "@/lib/method/types";
import type { RequisitionStatus } from "@/lib/requisition/types";

import { daysToApproval, groups, median, pipelineBars } from "./tiles";

describe("median", () => {
  it("of an odd count is the middle value, unsorted input included", () => {
    expect(median([9, 1, 4])).toBe(4);
  });
  it("of an even count is the mean of the two middle values", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([5, 3])).toBe(4);
  });
  it("of nothing is null, not nought", () => {
    expect(median([])).toBeNull();
  });
});

describe("days to approval", () => {
  it("counts calendar days from the stored raised day to the organisation day the route closed", () => {
    // Raised 2 March; approved 07:30 on 9 March in Kuala Lumpur, which is still 8 March in UTC.
    expect(daysToApproval(new Date("2026-03-02T00:00:00Z"), new Date("2026-03-08T23:30:00Z"), "Asia/Kuala_Lumpur")).toBe(7);
    expect(daysToApproval(new Date("2026-03-02T00:00:00Z"), new Date("2026-03-08T23:30:00Z"), null)).toBe(6);
  });
});

describe("Pipeline now adds up to Home's three cards", () => {
  // Every status with a count, as the groupBy queries would return them (the sourcing filter leaves cancelled out).
  const requisitions = (["DRAFT", "ENDORSED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL", "APPROVED", "RETURNED", "RECALLED", "SOURCING", "PARTIALLY_FULFILLED"] as RequisitionStatus[]).map((status, i) => ({ status, count: i + 1 }));
  const exercises = EXERCISE_STATUS_ORDER.filter((s) => s !== "CANCELLED").map((status: ExerciseStatus, i) => ({ status, count: 10 * (i + 1) }));
  const cases = { AWARDING: 3, SIGNING: 5, ON_SITE: 7 };
  const bars = pipelineBars({ requisitions, exercises, cases });
  const count = (s: string) => bars.find((b) => b.stage === s)!.count;

  it("keeps the case's order", () => {
    expect(bars.map((b) => b.stage)).toEqual(["WITH_CP", "PREPARING", "IN_MARKET", "EVALUATING", "AWARDING", "SIGNING", "ON_SITE"]);
  });
  it("With C&P is Home's Requisitions card", () => {
    expect(count("WITH_CP")).toBe(requisitionPipelineSplit(requisitions).total);
  });
  it("the three phases are Home's Sourcing card", () => {
    // Home's fold (`pipelineCounts`): every status's count, in the status order, summed.
    const home = EXERCISE_STATUS_ORDER.map((s) => exercises.find((e) => e.status === s)?.count ?? 0).reduce((a, b) => a + b, 0);
    expect(count("PREPARING") + count("IN_MARKET") + count("EVALUATING")).toBe(home);
    expect(count("PREPARING")).toBe(10 + 20 + 30 + 40);
  });
  it("the three stages are Home's Contracts card", () => {
    expect(count("AWARDING") + count("SIGNING") + count("ON_SITE")).toBe(15);
  });
});

describe("groups", () => {
  const labels = new Map([
    ["WS", "Water Supply"],
    ["FIN", "Finance"],
  ]);
  const words = { none: "No department", unlisted: "Unlisted unit" };
  it("a department total and No department add up to the total, and no group is dropped", () => {
    const rows = [
      { key: "WS", count: 4, amount: 400n },
      { key: null, count: 2, amount: 50n },
      { key: "", count: 1, amount: 25n },
      { key: "FIN", count: 3, amount: 900n },
      { key: "GONE", count: 1, amount: 1n },
    ];
    const g = groups(rows, labels, words);
    expect(g.reduce((s, x) => s + x.count, 0)).toBe(11);
    expect(g.reduce((s, x) => s + x.amount, 0n)).toBe(1376n);
    expect(g.map((x) => [x.label, x.count])).toEqual([
      ["Finance", 3],
      ["Water Supply", 4],
      ["No department", 3],
      ["Unlisted unit", 1],
    ]);
  });
  it("orders by count where there are no amounts, ties by label", () => {
    const g = groups([{ key: "WS", count: 2 }, { key: "FIN", count: 2 }, { key: null, count: 5 }], labels, words);
    expect(g.map((x) => x.label)).toEqual(["No department", "Finance", "Water Supply"]);
  });
  it("never shows a code as a label", () => {
    expect(groups([{ key: "GONE", count: 1 }], labels, words)[0].label).toBe("Unlisted unit");
  });
});
