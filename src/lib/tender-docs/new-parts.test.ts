import { describe, expect, it } from "vitest";

import { confirmedPartsFault, newPartsKey, newPartsOf, newPartsView } from "./new-parts";
import type { ResolvedPart } from "./types";

const rp = (code: string, printedNumber: string, role = code): ResolvedPart => ({ code, printedNumber, role, labelEn: `Part ${code}` }) as ResolvedPart;

describe("parts configured after a draft was started (review M2)", () => {
  const composition = { parts: [rp("notice", "1"), rp("bill", "7a"), rp("declaration", "9")] };
  it("lists the parts the configuration gives that the draft does not hold, in printed order", () => {
    expect(newPartsOf(composition, [{ partCode: "notice", role: "notice" }, { partCode: "declaration", role: "declaration" }]).map((p) => p.code)).toEqual(["bill"]);
    expect(newPartsOf(composition, composition.parts.map((p) => ({ partCode: p.code, role: p.role })))).toEqual([]);
  });
  it("only ever adds: a part the configuration no longer gives is neither listed nor removed", () => {
    expect(newPartsOf(composition, [{ partCode: "old", role: "old" }, { partCode: "notice", role: "notice" }, { partCode: "bill", role: "bill" }, { partCode: "declaration", role: "declaration" }])).toEqual([]);
  });
  it("does not give a draft a second part of a role it holds (a basis-specific part would replace the general one), except OTHER", () => {
    const conditions = { parts: [rp("conditions_bq", "5", "CONDITIONS"), rp("extra2", "8", "OTHER")] };
    expect(newPartsOf(conditions, [{ partCode: "conditions", role: "CONDITIONS" }, { partCode: "extra1", role: "OTHER" }]).map((p) => p.code)).toEqual(["extra2"]);
    expect(newPartsOf(conditions, [{ partCode: "notice", role: "INVITATION" }]).map((p) => p.code)).toEqual(["conditions_bq", "extra2"]);
  });
  it("lists nothing where the composition cannot be resolved", () => {
    expect(newPartsOf({ fault: "COMPOSITION_NOT_SET" }, [])).toEqual([]);
  });
  it("says them in words, and none as null", () => {
    expect(newPartsView([rp("bill", "7a")])).toEqual({ parts: ["7a. Part bill"] });
    expect(newPartsView([])).toBeNull();
  });
  it("is refused when the list confirmed is not the list now", () => {
    const now = [rp("bill", "7a")];
    expect(confirmedPartsFault(newPartsKey(now), now)).toBeNull();
    expect(confirmedPartsFault(newPartsKey([rp("other", "8")]), now)).toMatch(/Configured parts changed/); // 0005, founder 2026-10-19
    expect(confirmedPartsFault(null, now)).toMatch(/Configured parts changed/);
  });
});
