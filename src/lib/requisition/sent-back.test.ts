import { describe, expect, it } from "vitest";

import { sentBackBy, type RouteForSentBack } from "./sent-back";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rejected = (over: Partial<RouteForSentBack> = {}): RouteForSentBack => ({
  status: "REJECTED", openedAt: d("2026-06-01"), closedAt: d("2026-06-05"), rejectionApplied: "RETURN_TO_ORIGINATOR", rejectionReason: "Raise against the term contract.", ...over,
});

describe("a requisition sent back (sentBackBy)", () => {
  it("a draft whose latest route was rejected and returned to the originator is sent back, with the reason", () => {
    expect(sentBackBy("DRAFT", [rejected()], null)).toEqual({ reason: "Raise against the term contract." });
  });

  it("only a draft is sent back: the stored status is what says it is open for changes", () => {
    for (const s of ["ENDORSED", "REJECTED", "PENDING_APPROVAL", "CANCELLED"] as const) expect(sentBackBy(s, [rejected()], null)).toBeNull();
  });

  it("a draft that never had a route, or whose rejection went elsewhere or awaits the officer's choice, is not sent back", () => {
    expect(sentBackBy("DRAFT", [], null)).toBeNull();
    expect(sentBackBy("DRAFT", [rejected({ rejectionApplied: "TERMINATE" })], null)).toBeNull();
    expect(sentBackBy("DRAFT", [rejected({ rejectionApplied: null })], null)).toBeNull();
  });

  it("a later submission supersedes it: only the latest route counts", () => {
    const later = rejected({ status: "RECALLED", openedAt: d("2026-07-01"), closedAt: d("2026-07-02"), rejectionApplied: null, rejectionReason: "" });
    expect(sentBackBy("DRAFT", [rejected(), later], null)).toBeNull();
    expect(sentBackBy("DRAFT", [later, rejected()], null)).toBeNull();
  });

  it("a return at endorsement after the rejection means it was submitted again", () => {
    expect(sentBackBy("DRAFT", [rejected()], d("2026-06-20"))).toBeNull();
    expect(sentBackBy("DRAFT", [rejected()], d("2026-06-01"))).not.toBeNull();
  });
});
