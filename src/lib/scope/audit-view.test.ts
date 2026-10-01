import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { estimateEventAudit, estimateVersionAudit, historyChange, itemAudit, verificationAudit } from "./audit-view";

describe("the estimate's audit rows: 'Sealed (version N)', never the figure or the reason", () => {
  it("an amendment's row contains neither the value's digits nor the reason text", () => {
    const rows = estimateVersionAudit({ versionNo: 2, preparerName: "Nurul Izzah Kamal", preparedOn: "2026-09-29" });
    expect(rows).toEqual([
      { field: "version", before: null, after: "2" },
      { field: "value", before: null, after: "Sealed (version 2)" },
      { field: "reason", before: null, after: "Sealed (version 2)" },
      { field: "preparedBy", before: null, after: "Nurul Izzah Kamal (recorded on behalf of, not signed)" },
      { field: "preparedOn", before: null, after: "2026-09-29" },
    ]);
    const text = JSON.stringify(rows);
    for (const digits of ["330000", "330,000", "336500"]) expect(text).not.toContain(digits);
  });
  it("version 1 has no reason row", () => {
    expect(estimateVersionAudit({ versionNo: 1, preparerName: "A", preparedOn: "2026-09-20" }).map((c) => c.field)).toEqual(["version", "value", "preparedBy", "preparedOn"]);
  });
  it("History renders any figure-shaped change of a version row as sealed, whatever it holds", () => {
    expect(historyChange("CompanyEstimateVersion", { field: "value", before: null, after: "330000.00" }, 1)).toEqual({ field: "value", before: null, after: "Sealed (version 1)" });
    expect(historyChange("CompanyEstimateVersion", { field: "reason", before: "x", after: "y" }, 3)).toEqual({ field: "reason", before: "Sealed (version 3)", after: "Sealed (version 3)" });
    expect(historyChange("CompanyEstimateVersion", { field: "preparedOn", before: null, after: "2026-09-29" }, 1)).toEqual({ field: "preparedOn", before: null, after: "2026-09-29" });
    expect(historyChange("BqItem", { field: "amount", before: null, after: "RM1.00" }, null)).toEqual({ field: "amount", before: null, after: "RM1.00" });
  });
  it("custody events name who, recorded on behalf of, and carry no figure", () => {
    expect(estimateEventAudit({ kind: "RETAINED", personName: "Chen Wei Ling", capacity: "Custodian", versionNo: 2, copyNo: 2, place: "C&P strong room" })).toEqual([
      { field: "event", before: null, after: "Copy retained" },
      { field: "by", before: null, after: "Chen Wei Ling (recorded on behalf of, not signed)" },
      { field: "capacity", before: null, after: "Custodian" },
      { field: "version", before: null, after: "2" },
      { field: "copy", before: null, after: "2" },
      { field: "keptAt", before: null, after: "C&P strong room" },
    ]);
  });
});

describe("the bill's rows: formatted money and labels, never codes", () => {
  it("a line's amount is computed, formatted, and its kind labelled", () => {
    const rows = itemAudit(null, { itemRef: "B", description: "Pipe laying", unit: "m", kind: "MEASURED", quantity: "1250.5", rate: parseSen("182.40"), provisional: false });
    expect(rows).toContainEqual({ field: "amount", before: null, after: "RM228,091.20" });
    expect(rows).toContainEqual({ field: "kind", before: null, after: "Measured work" });
    expect(JSON.stringify(rows)).not.toContain("MEASURED");
  });
  it("a verification is attested, not signed", () => {
    expect(verificationAudit({ column: "Checked by", personName: "Lim Kok Seng", verifiedOn: "2026-09-25", note: "" })[1]).toEqual({ field: "verifiedBy", before: null, after: "Lim Kok Seng (recorded on behalf of, not signed)" });
  });
});
