import { describe, expect, it } from "vitest";

import { applyOverrides, overrideFaults } from "./override";
import { englishOnly, readComputedSnapshot, snapshotFaults, type ComputedSnapshot } from "./snapshot";

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

describe("the refusal prints the floor as money", () => {
  it("RM250.00, never a bare decimal string", async () => {
    const { certificateFaultWords } = await import("./fault-text");
    const t = certificateFaultWords({ code: "OVERRIDE_BELOW_FLOOR", level: "block", data: { floor: "1250.00", why: "the part recorded elsewhere" } }).en;
    expect(t).toMatch(/^Not below RM1,250\.00: the part recorded elsewhere\./);
  });
});

// Founder, 2026-10-20: a new snapshot is English only; one stored before keeps its Malay and is read, overridden and judged as it was.
describe("a new snapshot is English only", () => {
  it("leaves out every Malay label, sentence and floor wording, and stays sound", () => {
    const text: ComputedSnapshot = { ...SNAP, lines: [...SNAP.lines, { key: "note", labelEn: "Note", labelMs: "Nota", type: "TEXT", value: "A sentence", valueMs: "Satu ayat", overridable: false }], routingRatio: { num: "1.00", den: "2.00", labelEn: "Ratio", labelMs: "Nisbah" } };
    const out = englishOnly(text);
    expect(JSON.stringify(out)).not.toMatch(/Ujian|Kerja|Caj|Bersih|Nota|Satu ayat|Nisbah|bahagian lain/);
    expect(out.lines[1]).toMatchObject({ floor: { value: "250.00", en: "the part recorded elsewhere" } });
    expect(out.rule).toEqual({ en: "Test" });
    expect(snapshotFaults(out)).toEqual([]);
    expect(applyOverrides(out, []).totals.map((t) => t.key)).toEqual(["net"]);
  });
  it("does not change the snapshot it is given, and an older one with its Malay still reads and judges as before", () => {
    const before = JSON.stringify(SNAP);
    englishOnly(SNAP);
    expect(JSON.stringify(SNAP)).toBe(before);
    expect(readComputedSnapshot(JSON.parse(before))).toEqual(SNAP);
    expect(at("249.99")).toHaveLength(1);
  });
});
