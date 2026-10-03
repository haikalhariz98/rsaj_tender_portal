import { describe, expect, it } from "vitest";

import { freezeRoutingType, routingSheet, type TypeNow } from "./routing-sheet";
import { bandWords, targetText, verdictText } from "./sheet-words";

/**
 * 6.14 inc 1 fix M-3: the sheet's target names its band by the frozen type's edge switch, with the same words
 * the type's own page uses. "Above 20% and up to 40%" claimed an edge side the type may not have decided.
 */

const type = (upperEdgeInclusive: boolean | null): TypeNow => ({
  id: "t",
  code: "vo",
  labelEn: "Variation (quotation)",
  labelMs: null,
  subject: "CERTIFICATE",
  certificateKind: "VARIATION",
  upperEdgeInclusive,
  provenance: "ASSUMED",
  retiredOn: null,
  checks: [],
  targets: [
    { pctMin: null, pctMax: "20", targetDays: 14, provenance: "ASSUMED" },
    { pctMin: "20", pctMax: "40", targetDays: 42, provenance: "ASSUMED" },
  ],
});
const sheet = (upper: boolean | null, num: bigint) => routingSheet({ type: freezeRoutingType(type(upper), "2026-10-01"), receivedOn: "2026-10-01", routes: [], checks: [], ratio: { num, den: 10_000_000n }, today: "2026-10-03" });

describe("a band in words, by the edge switch (one function for every screen)", () => {
  it("upper edge inclusive: (min, max]", () => {
    expect(bandWords("20", "40", true).en).toBe("Above 20% and up to and including 40%");
    expect(bandWords(null, "20", true).en).toBe("Up to and including 20%");
    expect(bandWords("20", null, true).en).toBe("Above 20%");
    expect(bandWords("20", "40", true).ms).toBe("Melebihi 20% dan hingga dan termasuk 40%");
  });
  it("lower edge inclusive: [min, max)", () => {
    expect(bandWords("20", "40", false).en).toBe("From 20% and below 40%");
    expect(bandWords(null, "20", false).en).toBe("Below 20%");
    expect(bandWords("20", null, false).en).toBe("From 20%");
  });
  it("not decided: neither side claimed, and it says so", () => {
    expect(bandWords("20", "40", null).en).toBe("From 20% to 40% (which side of an edge counts is not decided)");
    expect(bandWords("20", "40", null).ms).toBe("Dari 20% hingga 40% (pihak sempadan yang dikira belum diputuskan)");
    expect(bandWords(null, null, null).en).toBe("Whatever the percentage");
  });
});

describe("the sheet's target line (M-3)", () => {
  it("true: 30% reads above 20% and up to and including 40%", () => {
    expect(targetText(sheet(true, 3_000_000n))).toBe("42 days (above 20% and up to and including 40%, for this percentage)");
  });
  it("false: 30% reads from 20% and below 40%", () => {
    expect(targetText(sheet(false, 3_000_000n))).toBe("42 days (from 20% and below 40%, for this percentage)");
  });
  it("unset: a value inside a band names it without claiming an edge; a value on the edge has no target", () => {
    expect(targetText(sheet(null, 3_000_000n))).toBe("42 days (from 20% to 40%, which side of an edge counts is not decided, for this percentage)");
    expect(targetText(sheet(null, 2_000_000n))).toBe("Target not set: which side of the band's edge counts is not decided");
  });
  it("the verdict says received, never the printed sheet's numbered days", () => {
    const s = routingSheet({ type: freezeRoutingType(type(true), "2026-10-01"), receivedOn: null, routes: [], checks: [], ratio: { num: 1n, den: 10n }, today: "2026-10-03" });
    expect(verdictText(s)).toBe("Not started: the day it was received is not recorded. Target: 14 days (up to and including 20%, for this percentage).");
    expect(verdictText(s)).not.toMatch(/DATE|TARIKH/);
  });
});
