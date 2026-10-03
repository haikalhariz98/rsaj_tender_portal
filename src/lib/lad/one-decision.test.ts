import { describe, expect, it } from "vitest";

import { liveDecision, replacementFaults, type DecisionRow } from "./non-completion";

/// Code review run 2 item 6: one live non-completion decision a contract; a later one only as an explicit
/// replacement with its reason, and never while the earlier's Certificate of Non-Completion is open.
const d = (id: string, certificateStatus: string | null, replacesId: string | null = null): DecisionRow => ({ id, certificateStatus, replacesId });
const codes = (i: Parameters<typeof replacementFaults>[0]) => replacementFaults(i).map((f) => f.code);

describe("the decision in force", () => {
  it("the latest not replaced and not void", () => {
    expect(liveDecision([])).toBeNull();
    expect(liveDecision([d("a", null)])?.id).toBe("a");
    expect(liveDecision([d("a", "ISSUED"), d("b", "ISSUED", "a")])?.id).toBe("b");
    expect(liveDecision([d("a", "ISSUED"), d("b", "VOID", "a")])?.id).toBeUndefined();
    expect(liveDecision([d("a", "VOID")])).toBeNull();
  });
});

describe("a further decision", () => {
  it("the first needs no replacement; naming one when none is live is refused", () => {
    expect(codes({ live: null, replacesId: null, reason: "" })).toEqual([]);
    expect(codes({ live: null, replacesId: "x", reason: "r" })).toEqual(["REPLACES_NOT_LIVE"]);
  });
  it("a second with no replacement named is refused", () => {
    expect(codes({ live: d("a", "ISSUED"), replacesId: null, reason: "" })).toEqual(["DECISION_ALREADY_LIVE"]);
    expect(codes({ live: d("a", null), replacesId: null, reason: "" })).toEqual(["DECISION_ALREADY_LIVE"]);
  });
  it("a replacement names the live one and says why", () => {
    expect(codes({ live: d("a", "ISSUED"), replacesId: "b", reason: "r" })).toEqual(["REPLACES_NOT_LIVE"]);
    expect(codes({ live: d("a", "ISSUED"), replacesId: "a", reason: " " })).toEqual(["REPLACE_REASON_REQUIRED"]);
    expect(codes({ live: d("a", "ISSUED"), replacesId: "a", reason: "Extension of time granted" })).toEqual([]);
    expect(codes({ live: d("a", null), replacesId: "a", reason: "Entitlement decided" })).toEqual([]);
  });
  it("never while the live decision's certificate is open, whatever the replacement says", () => {
    for (const st of ["DRAFT", "IN_ROUTING", "SIGNING"]) expect(codes({ live: d("a", st), replacesId: "a", reason: "r" })).toEqual(["EARLIER_CNC_OPEN"]);
  });
});
