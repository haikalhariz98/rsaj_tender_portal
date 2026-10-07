import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { nextFormVersion } from "./config";

/**
 * 6.14 inc 1 fix round: a certificate pins the form's text, blocks and list together and names the version it
 * pinned. An edit to the blocks or the list is a new version of the form, as an edit to its text is, so two
 * certificates "pinned at version N" can never have pinned different blocks or recipients.
 */

const read = (p: string) => readFileSync(path.join(__dirname, "../../..", p), "utf8");

describe("a form's version moves with its blocks and its list", () => {
  it("each change is the next version; a form with no text yet stays at 0", () => {
    expect(nextFormVersion(1)).toBe(2);
    expect(nextFormVersion(7)).toBe(8);
    expect(nextFormVersion(0)).toBe(0);
  });
  it("every act that changes a block or a recipient bumps it, under the form's lock, and audits it", () => {
    const src = read("src/app/configuration/templates/form-actions.ts");
    for (const name of ["saveSignatureBlock", "removeSignatureBlock", "saveDistributionRow", "removeDistributionRow"]) {
      const at = src.indexOf(`export async function ${name}(`);
      const body = src.slice(at, src.indexOf("\nexport async function ", at + 10) === -1 ? undefined : src.indexOf("\nexport async function ", at + 10));
      expect(body, name).toMatch(/await bumpFormVersion\(tx, toAuditActor\(actor\), t, /); // Phase 1b: who acted is the argument after the transaction
      // Phase 1c (ADR 0034 D10): the lock is now asked for the signed-in person's organisation first; the call is otherwise as pinned.
      expect(body, name).toMatch(/return onTemplate\(actor, templateId/);
    }
    expect(src).toMatch(/FOR UPDATE/);
    expect(src).toMatch(/diffFields\(\{ formVersion: cur\.bodyVersion \}, \{ formVersion: next \}\)/);
  });
  it("the certificate names the form's version, not its text's", () => {
    expect(read("src/lib/certificate/write.ts")).toMatch(/, form version \$\{rev\.bodyVersion\}/);
    // 6.14 increment 2 (faithful, as the facts changed): the issued text's line is the fidelity line, which names the
    // form's version from the document's own bodyVersion.
    expect(read("src/app/projects/[id]/certificates/[certId]/page.tsx")).toMatch(/fidelityLine\(\{ name: d\.templateName, [^}]*bodyVersion: d\.templateBodyVersion \}/);
    expect(read("src/lib/certificate/printed.ts")).toMatch(/`form version \$\{f\.bodyVersion\}`/);
  });
});
