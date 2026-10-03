import { describe, expect, it } from "vitest";

import { snapshotFaults } from "@/lib/certificate/snapshot";

import { assembleInterim } from "./assemble";
import { INPUT_FOR_TESTS } from "./opening-residual.fixture";

/// Code review run 2 residual (consider): the certificate's sentences are stored in English and Malay, as its labels.
describe("TEXT lines carry their Malay", () => {
  it("every sentence line the interim certificate writes has valueMs", () => {
    const a = assembleInterim({ ...INPUT_FOR_TESTS, openingAssumed: ["Damages charged until"] });
    const text = a.result.snapshot!.lines.filter((l) => l.type === "TEXT");
    expect(text.map((l) => l.key).sort()).toEqual(["minimumMeasure", "openingNote", "retentionNote"]);
    for (const l of text) expect(l.valueMs, l.key).toBeTruthy();
    expect(snapshotFaults(a.result.snapshot!)).toEqual([]);
  });
  it("Malay words on a money line are not a sound snapshot", () => {
    const s = assembleInterim(INPUT_FOR_TESTS).result.snapshot!;
    const bad = { ...s, lines: s.lines.map((l) => (l.key === "mainWorks" ? { ...l, valueMs: "x" } : l)) };
    expect(snapshotFaults(bad).map((f) => f.code)).toContain("FIELD_VALUE");
  });
});
