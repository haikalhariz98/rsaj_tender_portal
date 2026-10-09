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
    const body = fn(read("src/app/configuration/tender-documents/core.ts"), "saveTenderPolicy");
    const tx = body.slice(body.indexOf("db.$transaction"));
    expect(tx).toMatch(/lockOrganisation[\s\S]*conditionsPolicyFaults\([^\n]*loadTaxonomyUses\(org\.id, tx\)/);
  });
});

describe("print and route polish (source scan)", () => {
  const readSrc = read("src/lib/tender-docs/read.ts");
  it("a draft print says where the window comes from, and an approved header states approval and window", () => {
    expect(readSrc).toContain('"[the start and closing days proposed at submission]"');
    expect(readSrc).toMatch(/approvedLine: pack\.status === "APPROVED"/);
  });
  it("the Tender Table Document has its own title and a link from the tab", () => {
    // The source text itself, placeholder and all, is what this scan looks for.
    // Changed for Phase 4d: the print view's article is the shared component the supplier portal's inspection also uses (`src/components/tender-document.tsx`), so the title is read there.
    // eslint-disable-next-line no-template-curly-in-string
    expect(read("src/components/tender-document.tsx")).toContain("Tender Table Document: ${v.exercise.title}");
    expect(read("src/app/sourcing/[id]/documents/print/page.tsx")).toContain("TenderDocumentArticle");
    expect(read("src/app/sourcing/[id]/documents/workspace.tsx")).toContain("?set=table");
  });
  it("the route card's subtitle names the version, and the crumb is 'Tender documents'", () => {
    expect(read("src/app/sourcing/[id]/documents/workspace.tsx")).toMatch(/versionLabel \? `\$\{versionLabel\}, submitted`/);
    expect(read("src/components/shell/topbar.tsx")).toContain('crumbs[i].label = "Tender documents"');
  });
});
