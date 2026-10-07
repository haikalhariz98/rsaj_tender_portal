import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { dataListRegions, isSulitField, SULIT_FIELDS, SULIT_SCOPES, sulitFieldsIn, unflaggedSulitFields } from "./sulit-fields";

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

// Phase 3a (ADR 0034 D14), a deliberate change to this group-J file: the registry gains `scope`, the record that decides who may read a field.
describe("every registered field says whose record it belongs to", () => {
  it("each entry has one of the five scopes", () => {
    for (const f of SULIT_FIELDS) expect(SULIT_SCOPES as readonly string[], f.field).toContain(f.scope);
  });
  it("a field is registered once", () => {
    const names = SULIT_FIELDS.map((f) => f.field);
    expect(new Set(names).size).toBe(names.length);
  });
  it("the department estimate is a requisition's and also an exercise's, and the company estimate an exercise's", () => {
    const by = (n: string) => SULIT_FIELDS.find((f) => f.field === n)!;
    expect(by("estimatedValue")).toMatchObject({ scope: "requisition", alsoIn: ["exercise"] });
    expect(by("companyEstimate").scope).toBe("exercise");
    expect(by("score").scope).toBe("evaluation");
  });
});

// Phase 3b: the priced bill of quantities and the identity-card number join the registry (a deliberate change to this group-J file, logged).
describe("the fields Phase 3b adds say whose record they belong to", () => {
  const by = (n: string) => SULIT_FIELDS.find((f) => f.field === n)!;
  it("the priced bill is an exercise's, and the unpriced bill is not a field at all", () => {
    for (const n of ["bqRate", "bqAmount", "bqTotals"]) expect(by(n).scope, n).toBe("exercise");
  });
  it("the identity-card number is the award's (an exercise's) and is also carried on a contract's signature", () => {
    expect(by("icNumber")).toMatchObject({ scope: "exercise", alsoIn: ["contract"] });
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

describe("a History trail shows a registered SULIT field's change with the chip (6.2 condition 3)", () => {
  it("isSulitField names the registered fields exactly", () => {
    expect(isSulitField("estimatedValue")).toBe(true);
    expect(isSulitField("estimatedValueBand")).toBe(false);
    expect(isSulitField("subject")).toBe(false);
  });
  // The trails that show a requisition's or an exercise's department estimate as it changed.
  // Phase 3a, a deliberate change to this test: the exercise's History no longer chips the estimate with the one form `isSulitField(field) && value ? <SulitValue>`; the estimate's changes
  // are shown or withheld as the figure is (`estimate`, a `Sulit<string>` judged for this reader, ADR 0034 D14).
  // Phase 3b, a deliberate change to this test (logged): the children form of `<SulitValue>` is retired. Every other registered field in either trail is judged by the record it
  // belongs to (`sulitHistoryValue`: the requisition's, the exercise's or the evaluation's own answer) and withheld on a guess. What still holds for both trails: the History reads the
  // registry, every value it prints goes through the chipping reader, never the bare one, and none is drawn without a judgement.
  for (const file of ["src/app/requisitions/[id]/page.tsx", "src/app/sourcing/[id]/page.tsx"]) {
    it(file, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const history = src.slice(src.indexOf("function HistoryPanel("));
      if (file.includes("sourcing")) {
        expect(history, "the exercise's History reads the registry, shows the estimate as the reader may see it, and judges every other registered field by its record").toMatch(/isSulitField\(field\)/);
        expect(history).toMatch(/<SulitValue of=\{/);
        expect(history).toMatch(/sulitHistoryValue\(field, scope, gate, read\(field/);
      } else {
        expect(history, "the requisition's History judges the registry's fields by the requisition's one answer").toMatch(/sulitHistoryValue\(field, "requisition", estimate, read\(field/);
        expect(history).toMatch(/<SulitValue of=\{sulit\} \/>/);
      }
      expect(history, "no value is drawn from the children form").not.toMatch(/<SulitValue>/);
      // Every value the trail prints goes through the chipping reader, never the bare one.
      expect(history).not.toMatch(/\{read\(ch\.field/);
      expect(history).toMatch(/\{chipped\(ch\.field/);
    });
  }
});
