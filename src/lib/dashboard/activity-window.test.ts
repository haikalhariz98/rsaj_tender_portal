import { describe, expect, it } from "vitest";

import { activityLine, type ActivityEntry } from "./activity";

/// 6.5 (X-8): the feed reads the two acts that open the window, and a published exercise's cancellation.
const ex = (before: string, after: string, reason = ""): ActivityEntry => ({
  id: "e1",
  entity: "SourcingExercise",
  entityId: "x1",
  entityLabel: "SX/1 · Filter works",
  action: "UPDATE",
  changes: [{ field: "status", before, after }],
  reason,
  at: new Date("2026-10-01T02:00:00Z"),
});
const line = (e: ActivityEntry) => activityLine(e, {}, "Asia/Kuala_Lumpur");

describe("the window's acts in Recent activity", () => {
  it("reads advertised and invited, never the state's code", () => {
    expect(line(ex("APPROVED_FOR_TENDERING", "ADVERTISED"))!.headline).toBe("Exercise SX/1 advertised");
    expect(line(ex("APPROVED_FOR_TENDERING", "INVITED"))!.headline).toBe("Exercise SX/1: letters of invitation issued");
  });
  it("reads a published exercise's cancellation with its reason", () => {
    expect(line(ex("ADVERTISED", "CANCELLED", "Scope withdrawn."))).toMatchObject({ headline: "Exercise SX/1 cancelled", reason: "Scope withdrawn." });
  });
});
