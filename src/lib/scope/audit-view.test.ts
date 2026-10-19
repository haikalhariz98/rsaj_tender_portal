import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { ENTITY, SCOPE_ENTITY_LABEL, bqExportAudit, bqFinalisedAudit, listValueLabel, panelAudit, type PanelAuditFacts, bqImportAudit, estimateEventAudit, estimateVersionAudit, historyChange, itemAudit, rateFromText, scopeTabledAudit, sealedLodgementAudit, verificationAudit } from "./audit-view";
import { scopeFaultText, WITHHELD_TEXT, withheldVersion } from "./labels";

// Ruling 20cw (b), AC-63: a version's figure is withheld from view and held unencrypted, so its rows say so. "Sealed" is kept for a copy sealed under the exercise key.
describe("the estimate's audit rows: 'Withheld from view, held unencrypted (version N)', never the figure or the reason", () => {
  it("an amendment's row contains neither the value's digits nor the reason text", () => {
    const rows = estimateVersionAudit({ versionNo: 2, preparerName: "Nurul Izzah Kamal", preparedOn: "2026-09-29" });
    expect(rows).toEqual([
      { field: "version", before: null, after: "2" },
      // Ruling 20cw (b), AC-63: the literal words, not the helper, so the row's text is pinned.
      { field: "value", before: null, after: "Withheld from view, held unencrypted (version 2)" },
      { field: "reason", before: null, after: "Withheld from view, held unencrypted (version 2)" },
      { field: "preparedBy", before: null, after: "Nurul Izzah Kamal" },
      { field: "preparedOn", before: null, after: "2026-09-29" },
    ]);
    const text = JSON.stringify(rows);
    for (const digits of ["330000", "330,000", "336500"]) expect(text).not.toContain(digits);
  });
  it("version 1 has no reason row", () => {
    expect(estimateVersionAudit({ versionNo: 1, preparerName: "A", preparedOn: "2026-09-20" }).map((c) => c.field)).toEqual(["version", "value", "preparedBy", "preparedOn"]);
  });
  // Ruling 20cw (b), AC-63: the History says the figure is withheld, in the literal words.
  it("History renders any figure-shaped change of a version row as withheld, whatever it holds", () => {
    expect(historyChange("CompanyEstimateVersion", { field: "value", before: null, after: "330000.00" }, 1)).toEqual({ field: "value", before: null, after: "Withheld from view, held unencrypted (version 1)" });
    expect(historyChange("CompanyEstimateVersion", { field: "reason", before: "x", after: "y" }, 3)).toEqual({ field: "reason", before: "Withheld from view, held unencrypted (version 3)", after: "Withheld from view, held unencrypted (version 3)" });
    expect(historyChange("CompanyEstimateVersion", { field: "preparedOn", before: null, after: "2026-09-29" }, 1)).toEqual({ field: "preparedOn", before: null, after: "2026-09-29" });
    expect(historyChange("BqItem", { field: "amount", before: null, after: "RM1.00" }, null)).toEqual({ field: "amount", before: null, after: "RM1.00" });
  });
  it("with no version known, the History still says withheld, never the figure (ruling 20cw (b), AC-63)", () => {
    expect(WITHHELD_TEXT).toBe("Withheld from view, held unencrypted");
    expect(historyChange("CompanyEstimateVersion", { field: "value", before: "330000.00", after: "336500.00" }, null)).toEqual({ field: "value", before: WITHHELD_TEXT, after: WITHHELD_TEXT });
  });
  it("a row stored before ruling 20cw (b) is relabelled on the History; the stored row is not rewritten (AC-63, J3)", () => {
    const stored = { field: "value", before: null, after: "Sealed (version 2)" };
    expect(historyChange("CompanyEstimateVersion", stored, 2)).toEqual({ field: "value", before: null, after: withheldVersion(2) });
    expect(stored.after).toMatch(/^Sealed/);
  });
  it("the version's words, its unknown-version words and the SEALED fault never say sealed (ruling 20cw (b), AC-63)", () => {
    const named = { WITHHELD_TEXT, "withheldVersion(3)": withheldVersion(3), 'scopeFaultText("SEALED")': scopeFaultText("SEALED") };
    expect(withheldVersion(3)).toBe("Withheld from view, held unencrypted (version 3)");
    expect(scopeFaultText("SEALED")).toBe("The figure is withheld from view until the bids are opened.");
    for (const [name, text] of Object.entries(named)) expect(text, name).not.toMatch(/\bsealed\b/i);
  });
  it("a copy really sealed under the exercise key keeps the word (ruling 20cw (b))", () => {
    expect(sealedLodgementAudit({ versionNo: 2, lodgedByName: "Nurul Izzah Kamal", superseded: 0 })).toContainEqual({ field: "copy", before: null, after: "Sealed under the exercise key" });
  });
  // Phase 2b (decisions log, 2026-10-07): the trail and the screen name the person and say how the act was recorded only from its attribution (signed, or recorded from
  // paper); the fixed words "recorded on behalf of, not signed" were written under every act and were true of some.
  it("custody events name who, and carry no figure", () => {
    expect(estimateEventAudit({ kind: "RETAINED", personName: "Chen Wei Ling", capacity: "Custodian", versionNo: 2, copyNo: 2, place: "C&P strong room" })).toEqual([
      { field: "event", before: null, after: "Copy retained" },
      { field: "by", before: null, after: "Chen Wei Ling" },
      { field: "capacity", before: null, after: "Custodian" },
      { field: "version", before: null, after: "2" },
      { field: "copy", before: null, after: "2" },
      { field: "keptAt", before: null, after: "C&P strong room" },
    ]);
  });
});

describe("the bill's rows: formatted money and labels, never codes", () => {
  // Phase 3b, a deliberate change to this test (logged): the priced bill is SULIT, so a line's rate and amount are written under their registered keys (bqRate, bqAmount), which History
  // judges and the audit export withholds. Rows written before read as "rate" and "amount" and are mapped by entity (sulit-trail.ts).
  it("a line's amount is computed, formatted, and its kind labelled", () => {
    const rows = itemAudit(null, { itemRef: "B", description: "Pipe laying", unit: "m", kind: "MEASURED", quantity: "1250.5", rate: parseSen("182.40"), provisional: false });
    expect(rows).toContainEqual({ field: "bqAmount", before: null, after: "RM228,091.20" });
    expect(rows).toContainEqual({ field: "kind", before: null, after: "Measured work" });
    expect(JSON.stringify(rows)).not.toContain("MEASURED");
  });
  it("a verification names who verified it", () => {
    expect(verificationAudit({ column: "Checked by", personName: "Lim Kok Seng", verifiedOn: "2026-09-25", note: "" })[1]).toEqual({ field: "verifiedBy", before: null, after: "Lim Kok Seng" });
  });
});

describe("increment 2 audit rows", () => {
  it("a schedule-priced line says where its rate came from; an entered one says so only when asked", () => {
    const base = { itemRef: "2.1", description: "Pipe", unit: "m", kind: "MEASURED" as const, quantity: "10", rate: 18240n, provisional: false };
    const from = rateFromText({ label: "Pipe works", issue: "Issue 2", effectiveFrom: "2026-07-01", itemCode: "P1" }, (d) => d);
    expect(from).toBe("Pipe works, Issue 2 (in force from 2026-07-01), item P1");
    // A superseded issue is said, and the line is said to keep its price; the audit row's words are unchanged without it.
    expect(rateFromText({ label: "Pipe works", issue: "Issue 2", effectiveFrom: "2026-07-01", itemCode: "P1", supersededOn: "2026-09-28" }, (d) => d)).toBe("Pipe works, Issue 2 (in force from 2026-07-01, superseded on 2026-09-28; the line keeps this price), item P1");
    expect(rateFromText({ label: "Pipe works", issue: "Issue 2", effectiveFrom: "2026-07-01", itemCode: "P1", supersededOn: null }, (d) => d)).toBe(from);
    const rows = itemAudit({ ...base, rateFrom: null }, { ...base, rateFrom: from });
    expect(rows).toContainEqual({ field: "rateFrom", before: "Entered", after: from });
    // Increment 1's rows are unchanged when no source is given.
    expect(itemAudit(null, base).map((c) => c.field)).not.toContain("rateFrom");
  });
  it("an export records the version, the file and its digest, and never a figure", () => {
    const rows = bqExportAudit({ versionNo: 1, priced: true, fileName: "DEMO-SX-15-2026-bill-v1-priced.csv", sha256: "ab".repeat(32), lines: 5 });
    expect(rows.map((c) => c.field).sort()).toEqual(["file", "fingerprint", "lines", "priced", "version"]);
    expect(JSON.stringify(rows)).not.toMatch(/RM|\d{1,3},\d{3}\.\d\d/);
  });
  it("an import records the file and what it added", () => {
    const rows = bqImportAudit({ file: "bill.csv", documentTitle: "Bill as received", versionNo: 1, sha256: "cd".repeat(32), sections: 3, lines: 5, replacedLines: 0, mismatches: 1, priced: true });
    expect(rows).toContainEqual({ field: "importedFrom", before: null, after: "bill.csv" });
    expect(rows.map((c) => c.field)).not.toContain("linesReplaced");
  });
  it("a scope matter tabled names the sitting and who tabled it", () => {
    const rows = scopeTabledAudit({ subject: "Scope of X: bill of quantities, version 1", versionNo: 1, sitting: "SIT/1", committee: "Technical Committee", act: "Approve", tabledBy: "Aminah", tabledOn: "2026-09-29" });
    expect(rows).toContainEqual({ field: "tabledBy", before: null, after: "Aminah" });
  });
});

describe("History names every 6.2 record in words", () => {
  it("every entity 6.2 writes has a label", () => {
    for (const e of [...Object.values(ENTITY), "CommitteeDecision", "RateSchedule", "RateScheduleItem"]) expect(SCOPE_ENTITY_LABEL[e], e).toBeTruthy();
  });
});

describe("finalising: the totals are money in words, never raw decimals", () => {
  it("total, builders' works and firm value formatted; an unstated firm value says so", () => {
    const t = { total: parseSen("317973.70"), buildersWorks: parseSen("293473.70"), firmValue: parseSen("297591.20") };
    expect(bqFinalisedAudit(t, { standard: "Standard method", preparerQualification: "Qualified measurer" })).toEqual([
      { field: "status", before: "Draft", after: "Finalised" },
      { field: "bqTotals", before: null, after: "RM317,973.70" },
      { field: "bqBuildersWorks", before: null, after: "RM293,473.70" },
      { field: "bqFirmValue", before: null, after: "RM297,591.20" },
      { field: "standard", before: null, after: "Standard method" },
      { field: "preparerQualification", before: null, after: "Qualified measurer" },
    ]);
    const unstated = bqFinalisedAudit({ ...t, firmValue: null }, { standard: null, preparerQualification: null });
    expect(unstated.find((c) => c.field === "bqFirmValue")?.after).toBe("Not stated");
    expect(JSON.stringify(unstated)).not.toContain("317973.70");
  });
});

describe("the panel's trail: list values by name, never their code", () => {
  const kinds = [{ code: "WORKS_MEASURED", nameEn: "Measured works" }, { code: "WORKS_DESIGN", nameEn: "Design and build" }];
  const facts = (x: Partial<PanelAuditFacts> = {}): PanelAuditFacts => ({
    contractKind: null, contractKindOther: "", projectStatus: null, projectStatusOther: "", currentRevisionNo: null, currentRevisionOn: null,
    revisedRevisionNo: null, revisedRevisionOn: null, completionPeriodText: "", bqVersionNo: null, ...x,
  });
  it("listValueLabel: the value's name; a code gone from the list says so; none is null", () => {
    expect(listValueLabel(kinds, "WORKS_MEASURED")).toBe("Measured works");
    expect(listValueLabel(kinds, "RETIRED_CODE")).toBe("A value no longer on the list");
    expect(listValueLabel(kinds, null)).toBeNull();
  });
  it("a changed kind is recorded by name, before and after; unchanged facts are not recorded", () => {
    const before = facts({ contractKind: listValueLabel(kinds, "WORKS_MEASURED"), currentRevisionOn: new Date("2026-09-01T00:00:00Z"), bqVersionNo: 1 });
    const after = facts({ contractKind: listValueLabel(kinds, "WORKS_DESIGN"), currentRevisionOn: new Date("2026-09-01T00:00:00Z"), bqVersionNo: 2 });
    const rows = panelAudit(before, after);
    expect(rows).toEqual([
      { field: "contractKind", before: "Measured works", after: "Design and build" },
      { field: "certifiesBill", before: "version 1", after: "version 2" },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/WORKS_/);
  });
  it("on creation every fact given is recorded, days as days", () => {
    expect(panelAudit(null, facts({ projectStatus: "New works", currentRevisionNo: "A", currentRevisionOn: new Date("2026-09-14T00:00:00Z"), completionPeriodText: "Twelve weeks" }))).toEqual([
      { field: "projectStatus", before: null, after: "New works" },
      { field: "currentRevision", before: null, after: "A" },
      { field: "currentRevisionOn", before: null, after: "2026-09-14" },
      { field: "completionPeriod", before: null, after: "Twelve weeks" },
    ]);
  });
});
