import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { dataListRegions, SULIT_FIELDS, sulitFieldsIn, unflaggedSulitFields } from "./sulit-fields";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx$/.test(name) ? [p] : [];
  });
}

describe("the SULIT-field registry", () => {
  it("names the fields the ruling lists", () => {
    const names = SULIT_FIELDS.map((f) => f.field);
    for (const n of ["estimatedValue", "companyEstimate", "openingPrice", "correctedPrice", "score", "cprPercent"]) expect(names).toContain(n);
  });
  it("matches whole words only", () => {
    expect(sulitFieldsIn("r.estimatedValue")).toHaveLength(1);
    expect(sulitFieldsIn("r.estimatedValueBand")).toHaveLength(0);
    expect(sulitFieldsIn("scoreboard")).toHaveLength(0);
  });
});

describe("the scan finds an unflagged registered field", () => {
  const list = (cols: string) => `const rows = r.map((x) => ({ v: x.estimatedValue }));\n<DataList columns={[${cols}]} rows={rows} />`;
  it("fails a list whose registered field has no flagged column", () => {
    const [d] = dataListRegions(list(`{ key: "v", label: "Value" }`));
    expect(unflaggedSulitFields(d.region).map((f) => f.field)).toEqual(["estimatedValue"]);
  });
  it("passes once a column is flagged", () => {
    const [d] = dataListRegions(list(`{ key: "v", label: "Value", sulit: true }`));
    expect(unflaggedSulitFields(d.region)).toEqual([]);
  });
  it("judges each list on its own", () => {
    const src = `<DataList columns={[{ key: "a" }]} rows={a} />\nconst b = x.estimatedValue;\n<DataList columns={[{ key: "v", sulit: true }]} rows={b} />`;
    const regions = dataListRegions(src);
    expect(regions).toHaveLength(2);
    expect(unflaggedSulitFields(regions[0].region)).toEqual([]);
    expect(unflaggedSulitFields(regions[1].region)).toEqual([]);
  });
});

describe("no screen lists a SULIT field in an unflagged DataList", () => {
  it("scans src/app", () => {
    const bad: string[] = [];
    for (const file of sources(join(process.cwd(), "src/app"))) {
      for (const d of dataListRegions(readFileSync(file, "utf8"))) {
        for (const f of unflaggedSulitFields(d.region)) bad.push(`${file.replace(process.cwd() + "/", "")}:${d.line} reads ${f.field} (${f.what}) with no column flagged sulit: true`);
      }
    }
    expect(bad).toEqual([]);
  });
});
