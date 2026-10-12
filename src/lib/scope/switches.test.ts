import { describe, expect, it } from "vitest";

import { scopeFaultText } from "./labels";
import { pinFrom, switchWords, takeSettingFaults } from "./switches";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const base = { status: "DOCUMENTS_IN_PREPARATION" as const, submitted: false };

describe("pinning the two scope switches on an exercise (SR-08, SR-09, ruling G1)", () => {
  it("a new exercise takes the organisation's setting as it is, set or not", () => {
    expect(pinFrom({ specPanelUsed: false, onScreenBillUsed: false })).toEqual({ specPanelUsed: false, onScreenBillUsed: false });
    expect(pinFrom({ specPanelUsed: null, onScreenBillUsed: true })).toEqual({ specPanelUsed: null, onScreenBillUsed: true });
  });
  it("says a pin in words, and never reads an unset one as off", () => {
    expect(switchWords(true)).toBe("Used");
    expect(switchWords(false)).toBe("Not used");
    expect(switchWords(null)).toBe("Not set");
  });
});

describe("taking the organisation's setting for a pin that is not set (ADR 0035)", () => {
  it("copies the configured value into each pin that is not set, and changes nothing that is", () => {
    const r = takeSettingFaults({ ...base, pin: { specPanelUsed: null, onScreenBillUsed: true }, setting: { specPanelUsed: false, onScreenBillUsed: false } });
    expect(r.faults).toEqual([]);
    // The bill's pin was set, so it keeps its value although the setting now differs.
    expect(r.changes).toEqual({ specPanelUsed: false });
    expect(r.stillUnset).toEqual([]);
  });
  it("refuses in words while the organisation's own setting is not set, naming which", () => {
    const r = takeSettingFaults({ ...base, pin: { specPanelUsed: null, onScreenBillUsed: null }, setting: { specPanelUsed: null, onScreenBillUsed: null } });
    expect(codes(r.faults)).toEqual(["SETTING_NOT_SET", "SETTING_NOT_SET"]);
    expect(scopeFaultText(r.faults[0])).toMatch(/has not set "Specification panel used"\. Set it under Configuration, Scope and estimate/);
    expect(scopeFaultText(r.faults[1])).toMatch(/On-screen bill used/);
    expect(r.changes).toEqual({});
  });
  it("takes the one it can, and reports the other as still not set", () => {
    const r = takeSettingFaults({ ...base, pin: { specPanelUsed: null, onScreenBillUsed: null }, setting: { specPanelUsed: true, onScreenBillUsed: null } });
    expect(r.faults).toEqual([]);
    expect(r.changes).toEqual({ specPanelUsed: true });
    expect(r.stillUnset).toEqual(["onScreenBillUsed"]);
  });
  it("is frozen from the first submission, and for a cancelled exercise", () => {
    expect(codes(takeSettingFaults({ ...base, submitted: true, pin: { specPanelUsed: null, onScreenBillUsed: null }, setting: { specPanelUsed: true, onScreenBillUsed: true } }).faults)).toEqual(["ALREADY_SUBMITTED"]);
    expect(codes(takeSettingFaults({ ...base, status: "CANCELLED", pin: { specPanelUsed: null, onScreenBillUsed: null }, setting: { specPanelUsed: true, onScreenBillUsed: true } }).faults)).toEqual(["EXERCISE_CANCELLED"]);
  });
  it("has nothing to take when both are set", () => {
    const r = takeSettingFaults({ ...base, pin: { specPanelUsed: true, onScreenBillUsed: false }, setting: { specPanelUsed: false, onScreenBillUsed: true } });
    expect(codes(r.faults)).toEqual(["NOTHING_TO_TAKE"]);
    expect(r.changes).toEqual({});
  });
});
