import { describe, expect, it } from "vitest";

import { judgeListFile, judgeValueFile } from "./seed-files";

const ctx = { bodyCodes: ["cidb"], existing: [{ bodyCode: "cidb", kind: "GRADE", code: "G1", rank: 1 }] };
const row = (over: Record<string, unknown> = {}) => ({ bodyCode: "cidb", kind: "GRADE", code: "G2", nameEn: "Grade G2", rank: 2, provenance: "STATED", ...over });

describe("judging a customer's values file", () => {
  it("accepts a clean row and carries it as it was written", () => {
    const j = judgeValueFile([row()], ctx);
    expect(j.errors).toEqual([]);
    expect(j.rows).toHaveLength(1);
    expect(j.rows[0]).toMatchObject({ bodyCode: "cidb", code: "G2", rank: 2, provenance: "STATED" });
  });
  it("refuses a row with no name, and says which", () => {
    const j = judgeValueFile([row({ nameEn: "  " })], ctx);
    expect(j.rows).toEqual([]);
    expect(j.errors[0]).toMatch(/Row 1 \(G2\): it has no name/);
  });
  it("refuses a row that does not say where it comes from", () => {
    expect(judgeValueFile([row({ provenance: undefined })], ctx).errors[0]).toMatch(/PROVENANCE_REQUIRED/);
  });
  it("refuses a body that is not configured, so a code is never loaded under a guess", () => {
    expect(judgeValueFile([row({ bodyCode: "mof" })], ctx).errors[0]).toMatch(/"mof" is not configured/);
  });
  it("leaves a code already on the register alone", () => {
    const j = judgeValueFile([row({ code: "G1", rank: 1 })], ctx);
    expect(j.skipped).toBe(1);
    expect(j.rows).toEqual([]);
    expect(j.errors).toEqual([]);
  });
  it("refuses a rank already taken, whether by the register or an earlier row of the file", () => {
    expect(judgeValueFile([row({ rank: 1 })], ctx).errors[0]).toMatch(/RANK_TAKEN/);
    expect(judgeValueFile([row(), row({ code: "G3" })], ctx).errors[0]).toMatch(/RANK_TAKEN/);
  });
  it("refuses a code twice in one file", () => {
    expect(judgeValueFile([row(), row()], ctx).errors[0]).toMatch(/twice/);
  });
  it("takes a specialisation under a category named later in the same file", () => {
    const j = judgeValueFile([row({ kind: "SPECIALISATION", code: "CIV01", nameEn: "Pipe laying", parentCode: "CIV", rank: null }), row({ kind: "CATEGORY", code: "CIV", nameEn: "Civil", rank: null })], ctx);
    expect(j.errors).toEqual([]);
    expect(j.rows).toHaveLength(2);
  });
  it("one row refused refuses the whole file's loading: the caller writes only when there are no errors", () => {
    const j = judgeValueFile([row(), row({ code: "G3", rank: 3, nameEn: "" })], ctx);
    expect(j.errors).toHaveLength(1);
  });
  it("refuses a file that is not a list", () => {
    expect(judgeValueFile({ rows: [] }, ctx).errors).toEqual(["The file must be a list of rows."]);
  });
});

describe("judging a customer's lists file", () => {
  const lctx = { existing: [{ list: "BANK", code: "b1" }] };
  it("accepts banks and account types", () => {
    const j = judgeListFile([{ list: "BANK", code: "b2", nameEn: "A Bank", provenance: "STATED" }, { list: "ACCOUNT_TYPE", code: "cur", nameEn: "Current", provenance: "OBSERVED" }], lctx);
    expect(j.errors).toEqual([]);
    expect(j.rows).toHaveLength(2);
  });
  it("refuses an entry with no name, and any other list", () => {
    expect(judgeListFile([{ list: "BANK", code: "b2", nameEn: "", provenance: "STATED" }], lctx).errors[0]).toMatch(/no name/);
    expect(judgeListFile([{ list: "COUNTRY", code: "x", nameEn: "X", provenance: "STATED" }], lctx).errors[0]).toMatch(/BANK or ACCOUNT_TYPE/);
  });
  it("skips one already there", () => {
    expect(judgeListFile([{ list: "BANK", code: "b1", nameEn: "Same", provenance: "STATED" }], lctx).skipped).toBe(1);
  });
});
