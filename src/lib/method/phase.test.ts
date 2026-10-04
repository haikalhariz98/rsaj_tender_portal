import { describe, expect, it } from "vitest";

import { EXERCISE_STATUS_ORDER } from "./labels";
import { EXERCISE_PHASE, phaseSummary, statusBreakdown } from "./phase";

const demo = [
  { status: "DRAFT", count: 1 },
  { status: "DOCUMENTS_IN_PREPARATION", count: 10 },
  { status: "PENDING_APPROVAL_FOR_TENDERING", count: 1 },
  { status: "APPROVED_FOR_TENDERING", count: 1 },
  { status: "ADVERTISED", count: 1 },
  { status: "INVITED", count: 1 },
  { status: "OPENING_IN_PROGRESS", count: 1 },
  { status: "UNDER_EVALUATION", count: 1 },
  { status: "EVALUATED", count: 1 },
] as const;

describe("a sourcing exercise's phase on the dashboard card", () => {
  it("every open status belongs to exactly one phase", () => {
    for (const s of EXERCISE_STATUS_ORDER) if (s !== "CANCELLED") expect(EXERCISE_PHASE[s]).toBeDefined();
  });
  it("sums the statuses into three phases whose total is the card's figure", () => {
    expect(phaseSummary(demo)).toBe("13 preparing · 2 out to market · 3 at opening or evaluation");
  });
  it("leaves out a phase with none, and never counts cancelled", () => {
    expect(phaseSummary([{ status: "DRAFT", count: 2 }, { status: "CANCELLED", count: 5 }])).toBe("2 preparing");
    expect(phaseSummary([])).toBe("");
  });
  it("keeps the full breakdown, cancelled said to be not counted, for the tooltip", () => {
    expect(statusBreakdown([{ status: "INVITED", count: 1 }, { status: "DRAFT", count: 1 }], 2)).toBe(
      "1 draft · 1 invited · 2 cancelled, not counted",
    );
  });
});
