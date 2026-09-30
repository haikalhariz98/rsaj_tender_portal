import { describe, expect, it } from "vitest";

import { SPEC_TYPES } from "./fixture";
import { behaviourProfile } from "./profile";

const t = (code: string) => SPEC_TYPES.find((x) => x.code === code)!;
const get = (code: string, key: string) => behaviourProfile(t(code)).find((b) => b.key === key)!.value;

describe("the twelve behaviours a contract type drives (FR-MTD-012)", () => {
  it("lists all twelve", () => {
    expect(behaviourProfile(t("WORK"))).toHaveLength(12);
  });
  it("a Supply contract offers no defects liability and no nomination; a Work contract offers both", () => {
    expect(get("SUPPLY", "defectsLiabilityApplies")).toBe(false);
    expect(get("SUPPLY", "nominationAllowed")).toBe(false);
    expect(get("WORK", "defectsLiabilityApplies")).toBe(true);
    expect(get("WORK", "nominationAllowed")).toBe(true);
  });
  it("where the sources conflict and nothing is set, it is not set — never false", () => {
    expect(get("SERVICE", "defectsLiabilityApplies")).toBeNull();
    expect(get("SERVICE", "sumAdjustmentDrivers")).toBeNull();
  });
  it("changing the type on a draft visibly changes each of the twelve", () => {
    const work = behaviourProfile(t("WORK"));
    const supply = behaviourProfile(t("SUPPLY"));
    const same = work.filter((w, i) => JSON.stringify(w.value) === JSON.stringify(supply[i].value));
    expect(same.map((s) => s.key)).toEqual([]);
  });
});
