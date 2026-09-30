import { describe, expect, it } from "vitest";

import { commencementState } from "./commencement";
import { indentState } from "./indent";

describe("the indent's validity (FR-AWD-006)", () => {
  it("received 1 September with 14 days' validity expires on 15 September: valid that day, expired the next", () => {
    expect(indentState("2026-09-01", 14, "2026-09-15")).toEqual({ state: "VALID", expiresOn: "2026-09-15" });
    expect(indentState("2026-09-01", 14, "2026-09-16")).toEqual({ state: "EXPIRED", expiresOn: "2026-09-15" });
  });
  it("an unset validity is not set, never valid", () => {
    expect(indentState("2026-09-01", null, "2026-09-02")).toEqual({ state: "NOT_SET" });
  });
  it("no number received yet", () => {
    expect(indentState(null, 14, "2026-09-02")).toEqual({ state: "NOT_RECEIVED" });
  });
});

describe("the commencement clock (FR-AWD-009)", () => {
  it("start 1 October, seven days' grace: fine on the 8th, late on the 9th with the consequence", () => {
    expect(commencementState("2026-10-01", null, 7, "2026-10-08", "CANCEL_AND_BLACKLIST")).toEqual({ state: "NOT_DUE", deadline: "2026-10-08" });
    expect(commencementState("2026-10-01", null, 7, "2026-10-09", "CANCEL_AND_BLACKLIST")).toEqual({ state: "LATE", deadline: "2026-10-08", consequence: "CANCEL_AND_BLACKLIST" });
  });
  it("an unset grace period is not set", () => {
    expect(commencementState("2026-10-01", null, null, "2026-12-01", null)).toEqual({ state: "NOT_SET" });
  });
  it("work that commenced is never late", () => {
    expect(commencementState("2026-10-01", "2026-10-03", 7, "2026-12-01", "WARNING_LETTER")).toEqual({ state: "COMMENCED", on: "2026-10-03" });
  });
});
