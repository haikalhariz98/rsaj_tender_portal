import { describe, expect, it } from "vitest";

import { commencementState } from "./commencement";
import { indentState, expiredIfReceivedBefore, indentLateWords, indentReturnLate } from "./indent";

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

describe("when an expired indent is raised", () => {
  const expired = { state: "EXPIRED" as const, expiresOn: "2026-09-25" };
  it("until work commences, and not on a cancelled award", async () => {
    const { indentExpiryRaised } = await import("./indent");
    expect(indentExpiryRaised(expired, null, "ISSUED")).toBe(true);
    expect(indentExpiryRaised(expired, "2026-09-22", "ACCEPTED")).toBe(false);
    expect(indentExpiryRaised(expired, null, "CANCELLED")).toBe(false);
    expect(indentExpiryRaised({ state: "VALID", expiresOn: "2026-10-25" }, null, "ISSUED")).toBe(false);
  });
});

describe("counting expired indents", () => {
  it("agrees with the indent's own state on either side of the line", () => {
    const before = expiredIfReceivedBefore(14, "2026-10-01")!;
    expect(before).toBe("2026-09-17");
    expect(indentState("2026-09-17", 14, "2026-10-01").state).toBe("VALID");
    expect(indentState("2026-09-16", 14, "2026-10-01").state).toBe("EXPIRED");
    expect(expiredIfReceivedBefore(null, "2026-10-01")).toBeNull();
  });
});

describe("an acceptance received after the indent expired (FR-AWD-006, product owner ruling of 2026-10-24)", () => {
  it("Worked example: received 1 September, valid 14 days: returned on 15 September is taken, on 16 September refused", () => {
    expect(indentReturnLate("2026-09-01", 14, "2026-09-15")).toBeNull();
    expect(indentReturnLate("2026-09-01", 14, "2026-09-16")).toBe("2026-09-15");
  });
  it("is never refused where the validity is not set or the indent not received", () => {
    expect(indentReturnLate("2026-09-01", null, "2026-12-31")).toBeNull();
    expect(indentReturnLate(null, 14, "2026-12-31")).toBeNull();
  });
  it("says it in the office's words and, without the office's instruction, in the contractor's", () => {
    expect(indentLateWords("2026-09-15", "2026-09-16", true)).toBe("The indent expired on 15 Sep 2026; an acceptance received on 16 Sep 2026 is not taken. Cancel this award and raise a fresh indent.");
    expect(indentLateWords("2026-09-15", "2026-09-16", false)).toBe("The indent expired on 15 Sep 2026; an acceptance received on 16 Sep 2026 is not taken.");
  });
});
