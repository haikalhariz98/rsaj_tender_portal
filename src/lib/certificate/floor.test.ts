import { describe, expect, it } from "vitest";

import { applyOverrides, overrideFaults } from "./override";
import { snapshotFaults, type ComputedSnapshot } from "./snapshot";

/// A money line's floor (6.13 Part A, code review run 2 item 3): the owning module names the part an officer may
/// not correct; an override below it is refused, naming the floor and why.
const SNAP: ComputedSnapshot = {
  version: 1,
  computedOn: "2026-10-03",
  rule: { en: "Test", ms: "Ujian" },
  lines: [
    { key: "work", labelEn: "Work", labelMs: "Kerja", type: "MONEY", value: "1000.00", overridable: false },
    { key: "charge", labelEn: "Charge", labelMs: "Caj", type: "MONEY", value: "300.00", overridable: true, floor: { value: "250.00", en: "the part recorded elsewhere", ms: "bahagian lain" } },
  ],
  totals: [{ key: "net", labelEn: "Net", labelMs: "Bersih", terms: [{ key: "work", sign: 1 }, { key: "charge", sign: -1 }] }],
  routingRatio: null,
};
const at = (value: string) => overrideFaults({ status: "DRAFT", snapshot: SNAP, current: applyOverrides(SNAP, []), fieldKey: "charge", value, justification: "j", personKnown: true }).faults;

describe("an override against a line's floor", () => {
  it("sound snapshot", () => expect(snapshotFaults(SNAP)).toEqual([]));
  it("249.99 refused, naming the floor; 250.00 and 260.00 accepted", () => {
    expect(at("249.99")).toEqual([{ code: "OVERRIDE_BELOW_FLOOR", level: "block", data: { floor: "250.00", why: "the part recorded elsewhere" } }]);
    expect(at("250.00")).toEqual([]);
    expect(at("260.00")).toEqual([]);
  });
});
