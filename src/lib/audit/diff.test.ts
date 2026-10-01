import { describe, expect, it } from "vitest";

import { diffFields, fieldLabel, renderValue, snapshotFields } from "./diff";

describe("rendering a value for the trail", () => {
  it("keeps null and empty apart", () => {
    expect(renderValue(null)).toBe(null);
    expect(renderValue(undefined)).toBe(null);
    expect(renderValue("")).toBe("");
  });

  it("renders booleans as words rather than as true and false", () => {
    expect(renderValue(true)).toBe("yes");
    expect(renderValue(false)).toBe("no");
  });

  it("renders a date as the day, not as a timestamp", () => {
    expect(renderValue(new Date("2026-03-04T09:15:00Z"))).toBe("2026-03-04");
  });

  it("renders zero rather than treating it as absent", () => {
    expect(renderValue(0)).toBe("0");
  });
});

describe("diffing", () => {
  it("records only the fields that moved", () => {
    const changes = diffFields(
      { nameEn: "Old", sortOrder: 1, notes: "" },
      { nameEn: "New", sortOrder: 1, notes: "" },
    );
    expect(changes).toEqual([{ field: "nameEn", before: "Old", after: "New" }]);
  });

  it("treats a create as every field arriving from nothing", () => {
    expect(diffFields(null, { nameEn: "New", sortOrder: 2 })).toEqual([
      { field: "nameEn", before: null, after: "New" },
      { field: "sortOrder", before: null, after: "2" },
    ]);
  });

  it("ignores fields the update did not mention", () => {
    const changes = diffFields({ a: "1", b: "2" }, { a: "9" });
    expect(changes.map((c) => c.field)).toEqual(["a"]);
  });

  it("records a field being cleared", () => {
    expect(diffFields({ notes: "something" }, { notes: null })).toEqual([
      { field: "notes", before: "something", after: null },
    ]);
  });

  it("does not report a change when a boolean stays put", () => {
    expect(diffFields({ isActive: true }, { isActive: true })).toEqual([]);
  });

  it("reports a boolean flipping", () => {
    expect(diffFields({ isActive: true }, { isActive: false })).toEqual([
      { field: "isActive", before: "yes", after: "no" },
    ]);
  });

  it("does not confuse a number with the string of that number", () => {
    // Both render as "5", so the trail correctly says nothing changed: the value a
    // reader would see is the same.
    expect(diffFields({ n: 5 }, { n: "5" })).toEqual([]);
  });
});

describe("snapshot for a deletion", () => {
  it("keeps the whole row, since there is no after to compare with", () => {
    expect(snapshotFields({ code: "abc", sortOrder: 3 })).toEqual([
      { field: "code", before: "abc", after: null },
      { field: "sortOrder", before: "3", after: null },
    ]);
  });
});

describe("field labels", () => {
  it("turns a column name into something a person reads", () => {
    expect(fieldLabel("organisationProcures")).toBe("Organisation procures");
    expect(fieldLabel("effectiveFrom")).toBe("Effective from");
    expect(fieldLabel("cost_centre_code")).toBe("Cost centre code");
    expect(fieldLabel("code")).toBe("Code");
  });

  it("reads a bilingual pair the way the forms print it", () => {
    expect(fieldLabel("nameEn")).toBe("Name (EN)");
    expect(fieldLabel("nameMs")).toBe("Name (BM)");
    expect(fieldLabel("reasonMs")).toBe("Reason (BM)");
    // Only a trailing language suffix counts.
    expect(fieldLabel("openedOn")).toBe("Opened on");
    // A reference reads as what it points at: no label says "id" (6.10 follow-up).
    expect(fieldLabel("tabledByPersonId")).toBe("Tabled by");
    expect(fieldLabel("standingInForSeatId")).toBe("Standing in for");
    expect(fieldLabel("budgetCodeId")).toBe("Budget code");
    expect(fieldLabel("relatedRequisitionIds")).toBe("Related requisitions");
    expect(fieldLabel("id")).toBe("Id");
    expect(fieldLabel("generateCoreChain")).toBe("Chain from core routing");
    expect(fieldLabel("coreChainReason")).toBe("Why the chain is as entered");
  });
});
