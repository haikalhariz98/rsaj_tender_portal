import { describe, expect, it } from "vitest";

import { leadIds } from "./lead";

/** The 3a lead (W-4): the S.O. office's holders and acting holders today; nobody with no time zone or no S.O. */

const so = { roleLabel: "S.O.", holderIds: ["nurul", "hafiz"], actingIds: ["aisyah", "nurul"] };

describe("leadIds", () => {
  it("the holders and those acting in the office, each once", () => {
    expect(leadIds(so, "2026-11-05")).toEqual(["aisyah", "hafiz", "nurul"]);
  });
  it("no S.O. in force: no lead", () => {
    expect(leadIds(null, "2026-11-05")).toEqual([]);
  });
  it("no time zone: no today, so no lead, even with an office", () => {
    expect(leadIds(so, null)).toEqual([]);
  });
  it("an office with nobody in it today: no lead", () => {
    expect(leadIds({ roleLabel: "S.O.", holderIds: [], actingIds: [] }, "2026-11-05")).toEqual([]);
  });
});
