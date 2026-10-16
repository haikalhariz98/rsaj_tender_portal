import { describe, expect, it } from "vitest";

import { initialFields, renewedBefore } from "./audit-view";

describe("a confirmation in the trail (ruling 22, security audit)", () => {
  it("names the column revision it was taken on and the decision it was given on", () => {
    const f = initialFields({ person: "Officer A", listingNo: 2, at: new Date("2026-11-09T02:00:00Z"), revision: 5, decision: "REJECT" }, "Asia/Kuala_Lumpur");
    expect(f).toMatchObject({ initialledBy: "Officer A", offer: "No. 2", columnRevision: "5" });
    expect(f.decision).toMatch(/not carried/i);
    expect(initialFields({ person: "Officer A", listingNo: 2, at: new Date(), revision: 0, decision: null }, null).decision).toBeNull();
  });
  it("words a renewal by its cause: an as-read correction, or a change of answers or decision", () => {
    expect(renewedBefore({ correctionNo: 0, columnRevision: 3 }, { asReadCorrections: 1, columnRevision: 3 })).toBe("Before the correction");
    const moved = renewedBefore({ correctionNo: 1, columnRevision: 3 }, { asReadCorrections: 1, columnRevision: 5 });
    expect(moved).toContain("Before a change of answers or decision");
    expect(moved).toContain("revision 3");
    expect(moved).toContain("now 5");
    expect(moved).not.toContain("correction");
  });
});
