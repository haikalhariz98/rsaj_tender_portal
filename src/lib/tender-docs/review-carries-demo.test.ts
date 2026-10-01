import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/// Code review carries 9 and 10: the demo wipe's dependents, and the plan's rows as built. A source scan (vitest has no database).

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("carry 9: the demo wipe lists what its permit list would leave pointing at nothing", () => {
  it("an exercise naming a demo permit type and a kept policy naming the demo list are dependents", () => {
    const src = read("prisma/demo-tender-docs.ts");
    const deps = src.slice(src.indexOf("export async function tenderDocsDependents("), src.indexOf("export async function wipeTenderDocs") === -1 ? undefined : src.indexOf("function policyHoldsDemoValues"));
    expect(deps).toMatch(/regulatedActivity: true, regulatorPermitCode: \{ in: permitCodes \}/);
    expect(deps).toMatch(/regulatorPermitTaxonomyCode: PERMITS\.code/);
    expect(deps).toMatch(/which names a permit type from the demo permit list/);
    expect(deps).toMatch(/which names the demo permit list/);
  });
  it("the wipe refuses whatever the flag when any is listed", () => {
    const demo = read("prisma/demo.ts");
    expect(demo).toMatch(/tenderDependents\.length\) \{\s*console\.error\(\[\"Refused whatever the flag/);
  });
});

describe("carry 10: the plan states the restriction and eligibility columns as built", () => {
  const plan = read("docs/notes/plans/6.4-tender-documents.md");
  it("rows FR-DOC-009 and the pack's columns say restrictedTender and configured bodies, and no longer name the retired columns", () => {
    expect(plan).toMatch(/\| FR-DOC-009 \|[^\n]*As built \(BD-64-33\): `restrictedTender Boolean\?`/);
    expect(plan).toMatch(/inc 2, as built \(BD-64-32 to 34\)/);
    expect(plan.split("\n").slice(0, 66).join("\n")).not.toMatch(/restrictedToBumiputera|cidbGrade/);
  });
});
