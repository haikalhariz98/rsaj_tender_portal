import { describe, expect, it } from "vitest";

import { confirmedPartsFault, newPartsKey, newPartsOf, newPartsView } from "./new-parts";
import type { ResolvedPart } from "./types";

const rp = (code: string, printedNumber: string): ResolvedPart => ({ code, printedNumber, labelEn: `Part ${code}` }) as ResolvedPart;

describe("parts configured after a draft was started (review M2)", () => {
  const composition = { parts: [rp("notice", "1"), rp("bill", "7a"), rp("declaration", "9")] };
  it("lists the parts the configuration gives that the draft does not hold, in printed order", () => {
    expect(newPartsOf(composition, [{ partCode: "notice" }, { partCode: "declaration" }]).map((p) => p.code)).toEqual(["bill"]);
    expect(newPartsOf(composition, composition.parts.map((p) => ({ partCode: p.code })))).toEqual([]);
  });
  it("only ever adds: a part the configuration no longer gives is neither listed nor removed", () => {
    expect(newPartsOf(composition, [{ partCode: "old" }, { partCode: "notice" }, { partCode: "bill" }, { partCode: "declaration" }])).toEqual([]);
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
    expect(confirmedPartsFault(newPartsKey([rp("other", "8")]), now)).toMatch(/changed while this was open/);
    expect(confirmedPartsFault(null, now)).toMatch(/changed while this was open/);
  });
});
