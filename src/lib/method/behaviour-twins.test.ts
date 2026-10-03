import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isSumAdjustmentTrigger, SUM_ADJUSTMENT_TRIGGER_WORDS, SUM_ADJUSTMENT_TRIGGERS, triggerFaults, triggerFaultWords } from "./behaviour-twins";

/**
 * 6.13 Part A step 1 (plan A7, FR-MTD-012): the typed twin of a contract type's free-text adjustment drivers.
 * FR-PAD-001's five triggers; empty is "not set" and refuses naming the setting, never "none allowed".
 */

describe("the five triggers (FR-PAD-001)", () => {
  it("are the schema's enum, in order, each worded in both languages", () => {
    const schema = readFileSync(path.join(__dirname, "../../../prisma/schema.prisma"), "utf8");
    const body = /enum SumAdjustmentTrigger \{([^}]*)\}/.exec(schema)![1];
    expect(body.split("\n").map((l) => l.trim()).filter(Boolean)).toEqual([...SUM_ADJUSTMENT_TRIGGERS]);
    for (const k of SUM_ADJUSTMENT_TRIGGERS) {
      expect(SUM_ADJUSTMENT_TRIGGER_WORDS[k].en.length).toBeGreaterThan(0);
      expect(SUM_ADJUSTMENT_TRIGGER_WORDS[k].ms.length).toBeGreaterThan(0);
    }
    expect(isSumAdjustmentTrigger("VARIATION")).toBe(true);
    expect(isSumAdjustmentTrigger("Variations")).toBe(false);
  });
});

describe("a contract of a type adjusts its sum only by a trigger the type allows", () => {
  it("not set refuses, naming the setting", () => {
    const f = triggerFaults("Works", [], "VARIATION");
    expect(f.map((x) => x.code)).toEqual(["TRIGGERS_NOT_SET"]);
    expect(triggerFaultWords(f[0]).en).toMatch(/Works allows is not set\. Set its contract-sum adjustment triggers under Configuration › Reference data\./);
  });
  it("a trigger not on the list refuses; one on it passes", () => {
    expect(triggerFaults("Supply", ["VARIATION"], "REMEASUREMENT").map((x) => x.code)).toEqual(["TRIGGER_NOT_FOR_TYPE"]);
    expect(triggerFaultWords(triggerFaults("Supply", ["VARIATION"], "REMEASUREMENT")[0]).en).toBe("Re-measurement of provisional quantities is not a contract-sum adjustment Supply allows.");
    expect(triggerFaults("Works", ["VARIATION", "REMEASUREMENT"], "REMEASUREMENT")).toEqual([]);
  });
});
