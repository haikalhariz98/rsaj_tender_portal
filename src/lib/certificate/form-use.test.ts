import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { blockPinChanged, notACertificateFormText, otherUsesOf, rowPinChanged, TEMPLATE_OTHER_USES } from "./config";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS } from "./fixture";

/**
 * 6.14 inc 1 residual, BD-614-21: a form's version moves with its blocks and list, and only a certificate form's.
 * (a) A template other modules use (an award's letters, a tender pack, an invitation, an addendum, an evaluation
 *     paper) is not a certificate form: block and recipient edits are refused and its version never moves
 *     without a text change, because what it issues names that version as its text's.
 * (b) A provenance or a note alone is not what a certificate pins: it does not move the version.
 * (c) The pin reads the form under a shared lock taken after the certificate's, and every edit locks the form
 *     FOR UPDATE, so a pin never mixes two versions.
 */

const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");

describe("(a) only a certificate form takes blocks and recipients", () => {
  it("its other uses, from DocumentTemplate's relations, named in words", () => {
    expect(otherUsesOf({})).toEqual([]);
    expect(otherUsesOf({ policiesLoa: 1, certificates: 3, invitationLetters: 0 })).toEqual(["policiesLoa"]);
    expect(notACertificateFormText(["policiesLoa", "windowAddendumPolicies"]).en).toMatch(/^This template prints the letter of acceptance, the addendum, which name its version/);
    expect(notACertificateFormText(["proposalPapers"]).ms).toMatch(/Kertas Cadangan yang telah dihasilkan/);
  });
  it("every relation DocumentTemplate has to another module's document is listed (the list cannot go stale)", () => {
    const model = /^model DocumentTemplate \{([\s\S]*?)^\}/m.exec(read("prisma/schema.prisma"))![1];
    const relations = [...model.matchAll(/^\s+(\w+)\s+([A-Z]\w+)\[\]/gm)].map((m) => m[1]);
    const certificateOwn = ["signatureBlocks", "distributionRows", "certificates", "certificateDocuments", "routingSheetTypes"];
    expect(relations.filter((r) => !certificateOwn.includes(r)).sort()).toEqual(Object.keys(TEMPLATE_OTHER_USES).sort());
  });
  it("the acts refuse a block or a recipient on such a template, and never move its version", () => {
    const src = read("src/app/configuration/templates/form-actions.ts");
    for (const name of ["saveSignatureBlock", "saveDistributionRow"]) {
      const at = src.indexOf(`export async function ${name}(`);
      const body = src.slice(at, src.indexOf("\nexport async function ", at + 10));
      expect(body, name).toMatch(/if \(t\.uses\.length\) return \{ ok: false, message: notACertificateFormText\(t\.uses\)\.en \};/);
    }
    expect(src).toMatch(/async function bumpFormVersion\(tx: Tx, t: LockedTemplate, what: string\) \{\n  if \(t\.uses\.length\) return;/);
    expect(src).toMatch(/_count: \{ select: USE_COUNTS \}/);
  });
});

describe("(b) a provenance or a note alone does not move the version", () => {
  it("a block: only the fields a certificate pins", () => {
    const b = INTERIM_BLOCKS[0];
    expect(blockPinChanged(b, { ...b })).toBe(false);
    expect(blockPinChanged(b, { ...b, ...({ provenance: "STATED", notes: "x" } as object) })).toBe(false);
    expect(blockPinChanged(b, { ...b, labelEn: "Recommended by" })).toBe(true);
    expect(blockPinChanged(b, { ...b, delegable: null })).toBe(true);
    expect(blockPinChanged(null, b)).toBe(true);
  });
  it("a recipient: only the fields a certificate pins", () => {
    const r = FIVE_RECIPIENTS[1];
    expect(rowPinChanged(r, { ...r, ...({ provenance: "OBSERVED" } as object) })).toBe(false);
    expect(rowPinChanged(r, { ...r, mandatory: false })).toBe(true);
    expect(rowPinChanged(r, { ...r, sortOrder: 9 })).toBe(true);
  });
  it("the acts bump only on such a change", () => {
    const src = read("src/app/configuration/templates/form-actions.ts");
    expect(src).toMatch(/if \(blockPinChanged\(before \? blockOf\(before\) : null, v\)\) await bumpFormVersion/);
    expect(src).toMatch(/if \(rowPinChanged\(before \? rowOf\(before\) : null, row\)\) await bumpFormVersion/);
  });
});

describe("(c) the pin reads the form under a shared lock", () => {
  it("recordSignature locks the form FOR SHARE before it reads it, and the edits lock it FOR UPDATE", () => {
    const w = read("src/lib/certificate/write.ts");
    const body = w.slice(w.indexOf("export async function recordSignature"));
    const share = body.indexOf(`$queryRaw\`SELECT id FROM "DocumentTemplate" WHERE id = \${cert.templateId} FOR SHARE\``);
    expect(share).toBeGreaterThan(-1);
    expect(share).toBeLessThan(body.indexOf("templateNow(cert.templateId, c.tx)"));
    expect(read("src/app/configuration/templates/form-actions.ts")).toMatch(/SELECT id FROM "DocumentTemplate" WHERE id = \$\{templateId\} FOR UPDATE/);
    expect(read("src/app/configuration/templates/actions.ts")).toMatch(/SELECT id FROM "DocumentTemplate" WHERE id = \$\{id\} FOR UPDATE/);
  });
});
