import { describe, expect, it } from "vitest";

import { blockFaults, checkDefFaults, CONFIG_FAULT_TEXT, distributionFaultsOf, targetFaults } from "./config";
import { block, FIVE_RECIPIENTS, INTERIM_BLOCKS, row } from "./fixture";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const OFFICES = new Set(["RO", "SO", "HOS"]);

describe("signature blocks (FR-CRT-001, 004)", () => {
  it("the interim fixture's blocks are each sound against the others", () => {
    for (const b of INTERIM_BLOCKS) expect(blockFaults(b, INTERIM_BLOCKS.filter((x) => x !== b), OFFICES)).toEqual([]);
  });
  it("a place taken, no label, an office missing, unknown or misplaced, a refusal off a contractor block, a second dating block", () => {
    expect(codes(blockFaults(block(1), INTERIM_BLOCKS, OFFICES))).toEqual(["BLOCK_ORDER_TAKEN", "BLOCK_OFFICE_UNKNOWN"]);
    expect(codes(blockFaults(block(9, { labelEn: " ", officeCode: null }), [], OFFICES))).toEqual(["BLOCK_LABEL", "BLOCK_OFFICE_REQUIRED"]);
    expect(codes(blockFaults(block(9, { officeRule: "WITNESS", officeCode: "SO" }), [], OFFICES))).toEqual(["BLOCK_OFFICE_NOT_NAMED"]);
    expect(codes(blockFaults(block(9, { officeCode: "SO", refusalAllowed: true }), [], OFFICES))).toEqual(["BLOCK_REFUSAL_CONTRACTOR_ONLY"]);
    expect(codes(blockFaults(block(9, { officeCode: "SO", datesCertificate: true }), INTERIM_BLOCKS, OFFICES))).toEqual(["BLOCK_ONE_DATING"]);
    expect(codes(blockFaults(block(0, { officeCode: "SO" }), [], OFFICES))).toEqual(["BLOCK_ORDER"]);
  });
  it("whether a delegate may sign may be left undecided here; a certificate then cannot pin the form", () => {
    expect(blockFaults(block(9, { officeCode: "SO", delegable: null }), [], OFFICES)).toEqual([]);
  });
});

describe("distribution rows (FR-CRT-006)", () => {
  it("the five-recipient fixture is sound", () => {
    for (const r of FIVE_RECIPIENTS) expect(distributionFaultsOf(r, FIVE_RECIPIENTS.filter((x) => x !== r))).toEqual([]);
  });
  it("a code taken or malformed, no label, a second original", () => {
    expect(codes(distributionFaultsOf(row("finance", 9), FIVE_RECIPIENTS))).toEqual(["RECIPIENT_CODE_TAKEN"]);
    expect(codes(distributionFaultsOf(row("Bad Code", 9, { labelEn: "" }), []))).toEqual(["RECIPIENT_CODE", "RECIPIENT_LABEL"]);
    expect(codes(distributionFaultsOf(row("other", 9, { isOriginal: true }), FIVE_RECIPIENTS))).toEqual(["ONE_ORIGINAL"]);
  });
});

describe("routing checks and targets (FR-CRT-007, 008)", () => {
  it("checks: a place taken, an unknown office, days not whole", () => {
    const one = { order: 1, kind: "CHECKED" as const, labelEn: "Checked", officeCode: null, targetDays: 21 };
    expect(checkDefFaults({ ...one, order: 2 }, [one], OFFICES)).toEqual([]);
    expect(codes(checkDefFaults(one, [one], OFFICES))).toEqual(["CHECK_ORDER_TAKEN"]);
    expect(codes(checkDefFaults({ ...one, order: 2, officeCode: "NOPE", targetDays: 0 }, [one], OFFICES))).toEqual(["BLOCK_OFFICE_UNKNOWN", "TARGET_DAYS"]);
  });
  it("targets: the quotation variation's two bands share the 20% edge and do not overlap", () => {
    const a = { pctMin: null, pctMax: "20", targetDays: 14 };
    const b = { pctMin: "20", pctMax: null, targetDays: 42 };
    expect(targetFaults(b, [a])).toEqual([]);
    expect(codes(targetFaults({ pctMin: "10", pctMax: null, targetDays: 42 }, [a]))).toEqual(["TARGET_OVERLAP"]);
    expect(codes(targetFaults({ pctMin: "30", pctMax: "20", targetDays: 1 }, []))).toEqual(["TARGET_BAND_ORDER"]);
    expect(codes(targetFaults({ pctMin: null, pctMax: null, targetDays: 28 }, [a]))).toEqual(["TARGET_UNBANDED_ALONE"]);
    expect(codes(targetFaults(a, [{ pctMin: null, pctMax: null, targetDays: 28 }]))).toEqual(["TARGET_UNBANDED_ALONE"]);
    expect(codes(targetFaults({ pctMin: "1.23456", pctMax: null, targetDays: 1 }, []))).toEqual(["TARGET_PERCENT"]);
    expect(targetFaults({ pctMin: null, pctMax: null, targetDays: 28 }, [])).toEqual([]);
  });
  it("every configuration refusal is worded in both languages", () => {
    for (const [k, v] of Object.entries(CONFIG_FAULT_TEXT)) {
      expect(v.en.trim(), k).not.toBe("");
      expect(v.ms.trim(), k).not.toBe("");
    }
  });
});
