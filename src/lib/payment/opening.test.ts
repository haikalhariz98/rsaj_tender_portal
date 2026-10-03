import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";

import { chargedUntilOf, heldOnLatest, previousOf } from "./assemble";
import { openingAsIssued, openingFaults, openingReconciles, assumedGroups, OPENING_GROUPS, type OpeningInput } from "./opening";

/**
 * BD-613-41 as amended: a contract's opening position, the way out of INTERIM_NOT_FROM_VALUATION. Worked example
 * (invented): interim certificate 7 (IPC/2025/0007) was the last before the system. Gross certified to date
 * 450,000.00; retention held 45,000.00 on the main contractor, 5,000.00 of it released; previously certified to
 * date 410,000.00 (= 450,000.00 − (45,000.00 − 5,000.00)); damages charged until 1 Sep 2026.
 * The next certificate is interim certificate 8 and deducts 410,000.00 as previously certified.
 */
const s = parseSen;
const STATED = (note: string) => ({ provenance: "STATED" as const, note });
const INPUT: OpeningInput = {
  lastCertificateNumber: "IPC/2025/0007",
  lastSequence: 7,
  grossToDate: s("450000.00"),
  previouslyCertified: s("410000.00"),
  retention: { MAIN: s("45000.00"), NSC: 0n, NS: 0n },
  released: { MAIN: s("5000.00"), NSC: 0n, NS: 0n },
  advanceRecouped: [{ sequence: 3, amount: s("10000.00") }],
  damagesChargedUntil: "2026-09-01",
  provenance: { gross: STATED("IPC/2025/0007"), previous: STATED("IPC/2025/0007"), retention: STATED("IPC/2025/0007"), released: STATED("IPC/2025/0007"), advance: STATED("IPC/2025/0003"), damages: { provenance: "ASSUMED", note: "The CNC's register page is missing; from the finance ledger" } },
};
const ctx = { valuationRaised: false, existing: false, reason: "", foreignSequences: [] as number[] };
const codes = (i: OpeningInput, c = ctx) => openingFaults(i, c).map((f) => f.code);

describe("entering the opening position", () => {
  it("sound as entered", () => expect(codes(INPUT)).toEqual([]));
  it("closed once a valuation is raised here; a correction says why", () => {
    expect(codes(INPUT, { ...ctx, valuationRaised: true })).toEqual(["OPENING_CLOSED"]);
    expect(codes(INPUT, { ...ctx, existing: true })).toEqual(["OPENING_REASON_REQUIRED"]);
    expect(codes(INPUT, { ...ctx, existing: true, reason: "Retention misread" })).toEqual([]);
  });
  it("every figure says where it came from: stated with its source, or assumed with its reason", () => {
    expect(codes({ ...INPUT, provenance: { ...INPUT.provenance, gross: { provenance: null, note: "" } } })).toEqual(["OPENING_PROVENANCE_REQUIRED"]);
    expect(codes({ ...INPUT, provenance: { ...INPUT.provenance, gross: { provenance: "STATED", note: " " } } })).toEqual(["OPENING_SOURCE_REQUIRED"]);
    expect(codes({ ...INPUT, provenance: { ...INPUT.provenance, gross: { provenance: "ASSUMED", note: "" } } })).toEqual(["OPENING_ASSUMPTION_REASON_REQUIRED"]);
  });
  it("must cover every interim certificate issued here without a valuation", () => {
    expect(codes(INPUT, { ...ctx, foreignSequences: [7] })).toEqual([]);
    expect(openingFaults(INPUT, { ...ctx, foreignSequences: [8] })).toEqual([{ code: "OPENING_DOES_NOT_COVER", level: "block", data: { last: 7, uncovered: 8 } }]);
  });
  it("released never above held; an advance row after the last certificate refused", () => {
    expect(codes({ ...INPUT, released: { MAIN: s("45000.01"), NSC: 0n, NS: 0n } })).toEqual(["OPENING_RELEASED_ABOVE_HELD"]);
    expect(codes({ ...INPUT, advanceRecouped: [{ sequence: 8, amount: s("1.00") }] })).toEqual(["OPENING_ADVANCE_ROW_INVALID"]);
  });
  it("reconciles: previously certified = gross − retention held net; otherwise said, not refused", () => {
    expect(openingReconciles({ grossToDate: s("450000.00"), previouslyCertified: s("410000.00"), retention: INPUT.retention!, released: INPUT.released! })).toEqual([]);
    expect(openingReconciles({ grossToDate: s("450000.00"), previouslyCertified: s("405000.00"), retention: INPUT.retention!, released: INPUT.released! })[0]).toMatchObject({ code: "OPENING_NOT_RECONCILED", level: "warn" });
  });
  it("the ASSUMED groups are named (they warn on every later certificate)", () => {
    expect(assumedGroups(INPUT.provenance)).toEqual(["damages"]);
    expect(OPENING_GROUPS).toHaveLength(6);
  });
});

describe("read as the latest issued interim certificate", () => {
  const o = openingAsIssued({ id: "op1", lastSequence: 7, grossToDate: s("450000.00"), previouslyCertified: s("410000.00"), retention: INPUT.retention!, released: INPUT.released!, damagesChargedUntil: "2026-09-01" });
  it("the next certificate deducts 410,000.00 as previously certified, its previous gross 450,000.00", () => {
    const p = previousOf([o]);
    expect(senToDecimalString(p.previous)).toBe("410000.00");
    expect(senToDecimalString(p.previousGross)).toBe("450000.00");
  });
  it("retention held before release, damages charged until the day entered, sequence 7", () => {
    expect(heldOnLatest([o])?.held).toEqual({ MAIN: s("45000.00"), NSC: 0n, NS: 0n });
    expect(chargedUntilOf([o])).toBe("2026-09-01");
    expect(o.sequence).toBe(7);
  });
});
