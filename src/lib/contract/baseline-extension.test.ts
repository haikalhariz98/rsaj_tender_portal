import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { scopeDate } from "@/lib/time/extension";

import { derive, type BaselineValues } from "./baseline";
import { rowOf, sectionRows } from "./load";
import { extensionValues } from "./version-write";

/**
 * 6.13 Part B run 1b, C7 (ADR 0030; flagged against accepted 6.12): an extension is a baseline version, and its days
 * survive a later correction. Fixture: 31 Aug 2026 + 14 days → 14 Sep 2026 (plan B5).
 */

const base = (o: Partial<BaselineValues> = {}): BaselineValues => ({
  contractSum: 107750860n, contractDate: "2026-01-05", possessionDate: "2026-03-02", completionPeriod: 26, completionUnit: "WEEKS", dateForCompletion: "2026-08-31",
  dlpApplies: true, dlpMonths: 12, dlpSource: null, ladKind: null, ladAmount: null, ladPct: null, ladUnit: "", ladDaily: 26938n, ladSource: null,
  retentionApplies: null, retentionPercent: null, retentionCapPercent: null, retentionSource: null, pcSums: null, provisionalSums: null, sumsSource: null, buildersWorksValue: null,
  firstInterimMinimum: null, firstInterimSource: null, subsequentInterimMinimum: null, subsequentInterimSource: null, honourCertificateDays: null, honourSource: null,
  unfixedMaterialsPct: null, onCostPct: null, designWorkValue: null, sectionalCompletion: true, sectionalSource: null,
  sections: [{ ref: "1", description: "Pump house", ladKind: null, ladAmount: null, ladPct: null, ladDaily: null }, { ref: "2", description: "Reservoir", ladKind: null, ladAmount: null, ladPct: null, ladDaily: null }],
  ...o,
});
const policy = { floor: null, pct: null } as unknown as Parameters<typeof derive>[1];

describe("the extension's version (EXTENSION_OF_TIME)", () => {
  it("whole works: 31 Aug 2026 + 14 → 14 Sep 2026, the days kept on the version", () => {
    const v = extensionValues(base(), "WHOLE", null, 14);
    expect(v.dateForCompletion).toBe("2026-09-14");
    expect(v.extensionDays).toBe(14);
    expect(v.sections.map((s) => s.extensionDays ?? 0)).toEqual([0, 0]);
  });
  it("a section's moves only its section", () => {
    const v = extensionValues(base(), "SECTION", "2", 14);
    expect(v.dateForCompletion).toBe("2026-08-31");
    expect(v.extensionDays ?? 0).toBe(0);
    expect(v.sections.map((s) => s.extensionDays ?? 0)).toEqual([0, 14]);
    expect(scopeDate({ dateForCompletion: v.dateForCompletion, sections: v.sections.map((s) => ({ ref: s.ref, extensionDays: s.extensionDays ?? 0 })) }, "SECTION", "2")).toBe("2026-09-14");
  });
});

describe("a later correction keeps the extension (derive)", () => {
  it("derive adds the extension days to the date it works out from possession and the period", () => {
    const extended = extensionValues(base(), "WHOLE", null, 14);
    const corrected = derive({ ...extended, contractSum: 107750861n }, policy);
    expect(corrected.dateForCompletion).toBe("2026-09-14");
    expect(derive(base(), policy).dateForCompletion).toBe("2026-08-31");
  });
});

describe("the rows carry the days", () => {
  it("rowOf and sectionRows write them; valuesOf reads them (source)", () => {
    const v = extensionValues(extensionValues(base(), "WHOLE", null, 14), "SECTION", "1", 3);
    expect(rowOf(v).extensionDays).toBe(14);
    expect(sectionRows(v, "org").map((s) => s.extensionDays)).toEqual([3, 0]);
    expect(readFileSync("src/lib/contract/load.ts", "utf8")).toMatch(/extensionDays: b\.extensionDays,/);
  });
});
