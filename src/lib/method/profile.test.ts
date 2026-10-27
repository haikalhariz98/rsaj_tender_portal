import { describe, expect, it } from "vitest";

import { SPEC_TYPES } from "./fixture";
import { behaviourProfile } from "./profile";
import type { ContractTypeRow } from "./types";

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
  // Phase 0.2 item 6: a set typed twin is what the type says; the free text stands only while the twin is unset.
  it("how it is paid stands for the interim payment rule, and the triggers for the adjustment drivers, once set", () => {
    const base: ContractTypeRow = { ...t("SERVICE"), interimPaymentRule: "Monthly, work executed only", sumAdjustmentDrivers: ["Variations"] };
    const at = (x: ContractTypeRow, key: string) => behaviourProfile(x).find((b) => b.key === key)!.value;
    expect(at({ ...base, paymentRoute: "CERTIFIED_CLAIM" }, "interimPaymentRule")).toBe("Certified claim");
    expect(at({ ...base, paymentRoute: null }, "interimPaymentRule")).toBe("Monthly, work executed only");
    expect(at({ ...base, paymentRoute: null, interimPaymentRule: null }, "interimPaymentRule")).toBeNull();
    expect(at({ ...base, sumAdjustmentTriggers: ["VARIATION", "REMEASUREMENT"] }, "sumAdjustmentDrivers")).toEqual(["Variation of works", "Re-measurement of provisional quantities"]);
    expect(at({ ...base, sumAdjustmentTriggers: [] }, "sumAdjustmentDrivers")).toEqual(["Variations"]);
    expect(at({ ...base, sumAdjustmentTriggers: [], sumAdjustmentDrivers: [] }, "sumAdjustmentDrivers")).toBeNull();
  });
});
