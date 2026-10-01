import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Code review carries that are properties of how the acts and the demo are written, held by a
 * source scan (vitest has no database).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const fn = (src: string, name: string) => {
  const i = src.indexOf(`export async function ${name}(`);
  expect(i, `${name} exists`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function ", i + 10);
  return src.slice(i, next === -1 ? undefined : next);
};

describe("carry 5: the restriction question is not stored as the audit reason", () => {
  it("saveRestriction writes its audit row with no reason", () => {
    const body = fn(read("src/app/sourcing/[id]/documents/conditions-actions.ts"), "saveRestriction");
    expect(body).toMatch(/await audit\([^\n]*"UPDATE", diffFields\([^\n]*\)\);/);
    expect(body).not.toMatch(/restrictionQuestion|restrictionLabelEn/);
  });
  it("the demo's restriction answer carries no reason either", () => {
    const src = read("prisma/demo-tender-docs.ts");
    const line = src.split("\n").find((l) => l.includes("restrictedTender: yesNoNotSet(a.restrictedTender)"))!;
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/restrictionLabelEn/);
  });
});

describe("carry 6: saving the policy refuses a permit list that classifies contracts", () => {
  it("reads the taxonomy's uses inside the transaction, under the organisation's lock", () => {
    const body = fn(read("src/app/configuration/tender-documents/actions.ts"), "saveTenderPolicy");
    const tx = body.slice(body.indexOf("db.$transaction"));
    expect(tx).toMatch(/lockOrganisation[\s\S]*conditionsPolicyFaults\([^\n]*loadTaxonomyUses\(org\.id, tx\)/);
  });
});
