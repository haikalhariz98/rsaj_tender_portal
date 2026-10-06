import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EMPTY_APPENDIX, type AppendixFacts } from "./appendix";
import { appendixAudit, appendixAuditView } from "./audit-view";
import { LAD_KIND_LABEL } from "./labels";

/**
 * The Appendix's trail records its variation limits and its sections in words, so each of
 * the four acts on them (save or remove a limit, save or remove a section) writes a change.
 * Before this, the view left both lists out and those acts wrote no audit row at all.
 */

const office = (code: string | null) => ({ HOD_CP: "Head of Contract & Procurement", TBC: "Tender Board" })[code ?? ""] ?? "An office no longer configured";
const cp = { label: "Head of Contract & Procurement", roleCode: "HOD_CP", committeeCode: null, limit: 2_000_000n };
const board = { label: "Tender Board", roleCode: null, committeeCode: "TBC", limit: null };
const roof = { description: "Section A, the roof", ladKind: "AMOUNT_PER_DAY" as const, ladAmount: 50_000n, ladPct: null };
const tank = { description: "Section B, the tank", ladKind: "PERCENT_OF_SUM_PER_DAY" as const, ladAmount: null, ladPct: "0.025" };
const appx = (x: Partial<AppendixFacts> = {}): AppendixFacts => ({ ...EMPTY_APPENDIX, ...x });
const fields = (before: AppendixFacts, after: AppendixFacts) => appendixAudit(before, after, office).map((c) => c.field);

describe("the Appendix's trail: variation limits in words", () => {
  it("each holder by name and its limit formatted; none entered reads Not set", () => {
    expect(appendixAuditView(appx(), office).variationLimits).toBe("Not set");
    expect(appendixAuditView(appx({ variationLimits: [cp, board] }), office).variationLimits).toBe("Head of Contract & Procurement: RM20,000.00; Tender Board: Not set");
  });
  it("saveVariationLimit, adding one, records a change", () => {
    expect(appendixAudit(appx(), appx({ variationLimits: [cp] }), office)).toContainEqual({ field: "variationLimits", before: "Not set", after: "Head of Contract & Procurement: RM20,000.00" });
  });
  it("saveVariationLimit, changing a limit, records a change", () => {
    expect(appendixAudit(appx({ variationLimits: [cp] }), appx({ variationLimits: [{ ...cp, limit: 2_500_000n }] }), office)).toEqual([{ field: "variationLimits", before: "Head of Contract & Procurement: RM20,000.00", after: "Head of Contract & Procurement: RM25,000.00" }]);
  });
  it("removeVariationLimit records a change", () => {
    expect(fields(appx({ variationLimits: [cp, board] }), appx({ variationLimits: [cp] }))).toEqual(["variationLimits"]);
  });
  it("a holder with no name kept is named from configuration", () => {
    expect(appendixAuditView(appx({ variationLimits: [{ ...board, label: "" }] }), office).variationLimits).toBe("Tender Board: Not set");
  });
});

describe("the Appendix's trail: sections in words", () => {
  it("each description and its liquidated damages, amount or percentage", () => {
    expect(appendixAuditView(appx(), office).sections).toBe("Not set");
    expect(appendixAuditView(appx({ sections: [roof, tank] }), office).sections).toBe(`Section A, the roof: ${LAD_KIND_LABEL.AMOUNT_PER_DAY}: RM500.00; Section B, the tank: ${LAD_KIND_LABEL.PERCENT_OF_SUM_PER_DAY}: 0.025%`);
  });
  it("saveAppendixSection, adding one, records a change", () => {
    expect(fields(appx({ sectionalCompletion: true }), appx({ sectionalCompletion: true, sections: [roof] }))).toEqual(["sections"]);
  });
  it("saveAppendixSection, changing a section's damages, records a change", () => {
    expect(fields(appx({ sections: [roof] }), appx({ sections: [{ ...roof, ladAmount: 60_000n }] }))).toEqual(["sections"]);
    expect(fields(appx({ sections: [tank] }), appx({ sections: [{ ...tank, ladPct: "0.05" }] }))).toEqual(["sections"]);
  });
  it("removeAppendixSection records a change", () => {
    expect(fields(appx({ sections: [roof, tank] }), appx({ sections: [tank] }))).toEqual(["sections"]);
  });
  it("a new Appendix carried from a returned version records its limits and sections when created", () => {
    const created = appendixAudit(null, appx({ variationLimits: [cp], sections: [roof] }), office);
    expect(created.find((c) => c.field === "variationLimits")?.after).toBe("Head of Contract & Procurement: RM20,000.00");
    expect(created.find((c) => c.field === "sections")?.after).toMatch(/^Section A, the roof: .*RM500\.00$/);
  });
});

describe("the four acts write the Appendix's trail through the view", () => {
  it("each saves or removes, then records the change from the Appendix as it stood before", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/actions.ts"), "utf8");
    for (const act of ["saveVariationLimit", "removeVariationLimit", "saveAppendixSection", "removeAppendixSection"]) {
      const start = src.indexOf(`export async function ${act}(`);
      const body = src.slice(start, src.indexOf("\nexport ", start + 1));
      expect(body, act).toMatch(/const before = appendixFactsOf\(appendix\);/);
      expect(body, act).toMatch(/return appendixChanged\(tx, toAuditActor\(actor\), l, pack, before\);/); // Phase 1b: who acted is the argument after the transaction
    }
    expect(src).toMatch(/appendixAudit\(before, \{ \.\.\.facts, status \}, names\.name\)/);
  });
});
