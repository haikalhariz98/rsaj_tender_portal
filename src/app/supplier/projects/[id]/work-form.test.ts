import { describe, expect, it } from "vitest";

import { moveBody, raiseBody, raiseMissing } from "./work-form";

const base = { contractId: "c1", title: "Drain levels", description: "", location: "", dueOn: "", severity: "", happenedDay: "", happenedTime: "", stagedVersionIds: [] as string[] };

describe("the contractor's Work forms", () => {
  it("a question needs its date and an incident its severity and time", () => {
    expect(raiseMissing({ ...base, type: "RFI" })).toEqual({ dueOn: "Say when you need the answer." });
    expect(raiseMissing({ ...base, type: "RFI", dueOn: "2026-11-02" })).toEqual({});
    expect(Object.keys(raiseMissing({ ...base, type: "SAFETY_INCIDENT", happenedDay: "2026-10-30" })).sort()).toEqual(["happenedAt", "severity"]);
    expect(raiseMissing({ ...base, title: " ", type: "RFI", dueOn: "2026-11-02" })).toHaveProperty("title");
  });

  it("posts only the fields of its own type", () => {
    const q = raiseBody({ ...base, type: "RFI", dueOn: "2026-11-02", severity: "NEAR_MISS" });
    expect(q).toMatchObject({ type: "RFI", dueOn: "2026-11-02" });
    expect(q).not.toHaveProperty("severity");
    expect(q).not.toHaveProperty("happenedAt");
    const i = raiseBody({ ...base, type: "SAFETY_INCIDENT", dueOn: "2026-11-02", severity: "NEAR_MISS", happenedDay: "2026-10-30", happenedTime: "09:15", stagedVersionIds: ["v1abcdefgh"] });
    expect(i).toMatchObject({ severity: "NEAR_MISS", happenedAt: "2026-10-30T09:15", stagedVersionIds: ["v1abcdefgh"] });
    expect(i).not.toHaveProperty("dueOn");
  });

  it("a move names the status the screen showed", () => {
    expect(moveBody("c1", "RFI-1", "ASK_AGAIN", "IN_REVIEW", "Still missing")).toEqual({ contractId: "c1", item: "RFI-1", action: "ASK_AGAIN", expectedFrom: "IN_REVIEW", comment: "Still missing" });
  });
});
