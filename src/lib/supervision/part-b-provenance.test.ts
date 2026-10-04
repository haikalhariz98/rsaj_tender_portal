import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Review S7 and BD-613-124 (6.13 Part B, Run 1a fix round and its residual round): each switch and ceiling records
 * where its own value came from. One provenance over two values could only say one of them truly: a STATED re-tender
 * cap (§8.9) beside an undecided loss-days composition (OD-B2) would read as both stated (AGENTS.md provenance, Rule 2).
 *
 * This is a rule over the whole model, read from the schema, not a list: a provenance column speaks for every value
 * column since the previous provenance, and must speak for exactly one. A value column is a scalar or enum field that is
 * not a provenance and carries no @id, @unique or @default (settings ship unset). Part B's settings (every value column
 * after the "6.13 Part B run 1a" marker) have no exception. Part A's three shared provenances are a logged carry
 * (residual round), held here as an exact list so the carry can only shrink.
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const MODEL = "PostAwardPolicy";
const PART_B_MARKER = "6.13 Part B run 1a";

const SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);
const ENUMS = new Set([...schema.matchAll(/\nenum (\w+) \{/g)].map((x) => x[1]));

type Field = { name: string; type: string; attrs: string; index: number; partB: boolean };

/** The fields of a model body, in order, each marked as before or after the Part B marker. */
function fieldsOf(body: string): Field[] {
  const out: Field[] = [];
  let partB = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.includes(PART_B_MARKER)) partB = true;
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const [name, type, ...rest] = line.split(/\s+/);
    out.push({ name, type, attrs: rest.join(" "), index: out.length, partB });
  }
  return out;
}

const isProvenance = (f: Field) => f.type.replace(/[?[\]]/g, "") === "Provenance";
const isColumn = (f: Field) => {
  const base = f.type.replace(/[?[\]]/g, "");
  return SCALARS.has(base) || ENUMS.has(base);
};
const isBookkeeping = (f: Field) => /@id\b|@unique\b|@default\(/.test(f.attrs);
const isValue = (f: Field) => isColumn(f) && !isProvenance(f) && !isBookkeeping(f);

type Group = { provenance: string | null; values: Field[]; provenanceIndex: number };

/** Each provenance with the value columns it speaks for (those since the previous provenance). A trailing group with no
 * provenance holds the value columns nobody speaks for. */
function groupsOf(fields: Field[]): Group[] {
  const groups: Group[] = [];
  let open: Field[] = [];
  for (const f of fields) {
    if (isProvenance(f)) {
      groups.push({ provenance: f.name, values: open, provenanceIndex: f.index });
      open = [];
    } else if (isValue(f)) open.push(f);
  }
  if (open.length) groups.push({ provenance: null, values: open, provenanceIndex: -1 });
  return groups;
}

/** Part A's shared provenances: a carry logged in the residual round (its own flagged commit), not built here. */
const PART_A_SHARED: Record<string, string[]> = {
  delegationFormsProvenance: ["delegationLetterConventionalId", "delegationNoticeConventionalId", "delegationLetterDesignBuildId", "delegationNoticeDesignBuildId"],
  variationProvenance: ["variationPctBasis", "variationBase"],
  scheduleFormProvenance: ["scheduleFormAgreedRate", "scheduleFormNoAgreedRate"],
};

/** Every violation of the rule in a model body: a value nobody speaks for, a provenance for none or for several. */
function faultsOf(body: string, allowShared: Record<string, string[]>): string[] {
  const faults: string[] = [];
  for (const g of groupsOf(fieldsOf(body))) {
    const names = g.values.map((v) => v.name);
    if (g.provenance === null) faults.push(`no provenance for ${names.join(", ")}`);
    else if (names.length === 0) faults.push(`${g.provenance} speaks for no value`);
    else if (names.length > 1 && JSON.stringify(allowShared[g.provenance]) !== JSON.stringify(names)) faults.push(`${g.provenance} speaks for ${names.join(", ")}`);
    else if (names.length > 1 && g.values.some((v) => v.partB)) faults.push(`${g.provenance} speaks for Part B's ${names.join(", ")}`);
  }
  return faults;
}

const bodyOf = (src: string, name: string) => new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(src)![1];
const body = bodyOf(schema, MODEL);
const fields = fieldsOf(body);
const fieldLine = (f: string) => body.split("\n").find((l) => new RegExp(`^\\s+${f}\\s`).test(l)) ?? "";

describe("every post-award setting value column has its own provenance (BD-613-124: a rule over the model)", () => {
  it("the model holds Part B's marker, and the only fields that are not settings are its key, its organisation and its notes", () => {
    expect(body).toContain(PART_B_MARKER);
    expect(fields.filter((f) => isColumn(f) && isBookkeeping(f)).map((f) => f.name)).toEqual(["id", "organisationId", "notes"]);
  });

  it("no value column in the model lacks a provenance, and no provenance speaks for two, except Part A's logged carry", () => {
    expect(faultsOf(body, PART_A_SHARED)).toEqual([]);
  });

  it("Part B: every value column has exactly one provenance of its own, nullable, with no default, on the very next field", () => {
    const partB = groupsOf(fields).filter((g) => g.values.some((v) => v.partB) || g.provenance === null);
    expect(partB.length).toBeGreaterThan(0);
    for (const g of partB) {
      expect(g.values.map((v) => v.name), String(g.provenance)).toHaveLength(1);
      expect(g.provenance, g.values[0].name).not.toBeNull();
      expect(g.provenanceIndex, g.provenance!).toBe(g.values[0].index + 1);
      expect(fieldLine(g.provenance!), g.provenance!).toMatch(/\sProvenance\?(\s|$)/);
      expect(fieldLine(g.provenance!), g.provenance!).not.toContain("@default");
    }
  });

  it("BD-613-124: the re-tender cap, the loss-days composition and the design bond's rate and years each have their own", () => {
    const own = Object.fromEntries(groupsOf(fields).filter((g) => g.values.length === 1).map((g) => [g.values[0].name, g.provenance]));
    expect(own).toMatchObject({
      retenderCapDays: "retenderCapProvenance",
      lossDaysComposition: "lossDaysCompositionProvenance",
      designBondPct: "designBondPctProvenance",
      designBondYears: "designBondYearsProvenance",
      performanceBondReleaseAt: "performanceBondReleaseProvenance",
      retentionBalanceReleaseAt: "retentionBalanceReleaseProvenance",
      nominatedBondPct: "nominatedBondProvenance",
      nominatedQuotationCeiling: "nominatedQuotationCeilingProvenance",
      nominationLetterForms: "nominationLetterFormsProvenance",
    });
    for (const gone of ["releaseProvenance", "nominatedProvenance", "terminationProvenance", "designBondProvenance"]) expect(fieldLine(gone), gone).toBe("");
  });

  it("self-test: the rule fails on a shared provenance, a value with none, a provenance for none, and a shared one in Part B", () => {
    const fake = (lines: string[]) => `\n  id String @id @default(cuid())\n${lines.map((l) => `  ${l}`).join("\n")}\n  notes String @default("")`;
    expect(faultsOf(fake(["a Int?", "aProvenance Provenance?"]), {})).toEqual([]);
    expect(faultsOf(fake(["a Int?", "b Int?", "abProvenance Provenance?"]), {})).toEqual(["abProvenance speaks for a, b"]);
    expect(faultsOf(fake(["a Int?", "aProvenance Provenance?", "b Int?"]), {})).toEqual(["no provenance for b"]);
    expect(faultsOf(fake(["a Int?", "aProvenance Provenance?", "orphanProvenance Provenance?"]), {})).toEqual(["orphanProvenance speaks for no value"]);
    expect(faultsOf(fake([`/// ${PART_B_MARKER}`, "a Int?", "b Int?", "abProvenance Provenance?"]), { abProvenance: ["a", "b"] })).toEqual(["abProvenance speaks for Part B's a, b"]);
    expect(faultsOf(fake(["a Int?", "b Int?", "abProvenance Provenance?"]), { abProvenance: ["a", "b"] })).toEqual([]);
    expect(faultsOf(fake(["a Int?", "b Int?", "c Int?", "abProvenance Provenance?"]), { abProvenance: ["a", "b"] })).toEqual(["abProvenance speaks for a, b, c"]);
    // A relation field is not a column: the id it reads is the value.
    expect(faultsOf(fake(["tId String?", "t Template? @relation(fields: [tId], references: [id])", "tProvenance Provenance?"]), {})).toEqual([]);
  });
});

describe("the migrations", () => {
  const read = (dir: string) => {
    const sql = readFileSync(path.join(ROOT, "prisma/migrations", dir, "migration.sql"), "utf8");
    return { sql, statements: sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n") };
  };

  it("S7: the pre-check first, the five columns with no DEFAULT, the two shared ones dropped, no row written", () => {
    const { sql, statements } = read("20261004100601_post_award_provenance_split");
    expect(statements.indexOf("SELECT CAST((SELECT 'Pre-check failed: a post-award policy already records the provenance of its releases or its nominated settings")).toBe(0);
    expect(statements).toMatch(/WHERE EXISTS \(SELECT 1 FROM "PostAwardPolicy" WHERE "releaseProvenance" IS NOT NULL OR "nominatedProvenance" IS NOT NULL\)\) AS INTEGER\);/);
    for (const p of ["performanceBondReleaseProvenance", "retentionBalanceReleaseProvenance", "nominatedBondProvenance", "nominatedQuotationCeilingProvenance", "nominationLetterFormsProvenance"]) expect(statements, p).toMatch(new RegExp(`ADD COLUMN\\s+"${p}" "Provenance"[,;]`));
    expect(statements).toMatch(/DROP COLUMN "releaseProvenance"/);
    expect(statements).toMatch(/DROP COLUMN "nominatedProvenance"/);
    expect(statements).not.toMatch(/\bDEFAULT\b/);
    expect(statements).not.toMatch(/^\s*(UPDATE|INSERT|DELETE)\b/m);
    for (const l of sql.split("\n").filter((x) => x.trim().startsWith("--"))) expect(l, l).not.toContain(";");
  });

  it("BD-613-124: the pre-check first, the four columns with no DEFAULT, the two shared ones dropped, no row written", () => {
    const { sql, statements } = read("20261004100701_post_award_provenance_split_two");
    expect(statements.indexOf("SELECT CAST((SELECT 'Pre-check failed: a post-award policy already records the provenance of its termination settings or its design guarantee bond")).toBe(0);
    expect(statements).toMatch(/WHERE EXISTS \(SELECT 1 FROM "PostAwardPolicy" WHERE "terminationProvenance" IS NOT NULL OR "designBondProvenance" IS NOT NULL\)\) AS INTEGER\);/);
    for (const p of ["retenderCapProvenance", "lossDaysCompositionProvenance", "designBondPctProvenance", "designBondYearsProvenance"]) expect(statements, p).toMatch(new RegExp(`ADD COLUMN\\s+"${p}" "Provenance"[,;]`));
    expect(statements).toMatch(/DROP COLUMN "terminationProvenance"/);
    expect(statements).toMatch(/DROP COLUMN "designBondProvenance"/);
    expect(statements).not.toMatch(/\bDEFAULT\b/);
    expect(statements).not.toMatch(/^\s*(UPDATE|INSERT|DELETE)\b/m);
    expect(sql).not.toMatch(/\bDO\b/);
    for (const l of sql.split("\n").filter((x) => x.trim().startsWith("--"))) expect(l, l).not.toContain(";");
  });
});
