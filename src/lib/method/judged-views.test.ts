import { describe, expect, it } from "vitest";

import { judgedViewIds } from "./judged-views";

describe("judgedViewIds (ST-8)", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const windows = new Map([
    ["a", { phaseCode: "OPEN_FOR_PURCHASE" as const, closingDay: "2026-10-26" }],
    ["b", { phaseCode: "OPEN_FOR_PURCHASE" as const, closingDay: "2026-12-30" }],
    ["c", { phaseCode: "CLOSED" as const, closingDay: "2026-10-25" }],
  ]);
  const judged = { windows, today: "2026-10-24", granted: new Set(["b", "d"]) };
  it("keeps the candidates' order, so sort is set before paging", () => {
    expect(judgedViewIds("boundary", [...candidates].reverse(), judged)).toEqual(["d", "b"]);
  });
  it("open is the phase, soon is the closing within the horizon of an open phase, boundary is the reader's grant", () => {
    expect(judgedViewIds("open", candidates, judged)).toEqual(["a", "b"]);
    expect(judgedViewIds("soon", candidates, judged)).toEqual(["a"]);
    expect(judgedViewIds("boundary", candidates, judged)).toEqual(["b", "d"]);
  });
  it("a reader granted none, or an exercise with no window, passes nothing", () => {
    expect(judgedViewIds("boundary", candidates, { ...judged, granted: new Set() })).toEqual([]);
    expect(judgedViewIds("open", [{ id: "zz" }], judged)).toEqual([]);
  });
});
