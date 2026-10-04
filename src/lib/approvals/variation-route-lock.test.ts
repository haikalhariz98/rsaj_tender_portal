import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * 614-C4 (6.13 Part A step 4): a variation's route is decided under the one lock order (Requisition → Exercise → Award
 * → Contract → the variation → the step), wherever it is acted on, the same way as a certificate's. Source scans, so a
 * new path cannot take another order; and escalation refuses on a cancelled contract or a closed variation, read under
 * the locks, before anything moves.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const body = (() => {
  const src = read("src/app/approvals/actions.ts");
  return src.slice(src.indexOf("export async function escalateStep"));
})();
const at = (t: string, from = 0) => body.indexOf(`FROM "${t}" WHERE id`, from);

describe("a variation's route, under the lock order", () => {
  it("escalation from Approvals locks the requisition, the exercise, the award, the contract, then the variation", () => {
    const v = at("Variation");
    expect(v).toBeGreaterThan(-1);
    const contractForVariation = body.lastIndexOf('FROM "Contract" WHERE id', v);
    expect(contractForVariation).toBeGreaterThan(at("Award"));
    expect(at("Award")).toBeGreaterThan(at("SourcingExercise"));
    expect(at("SourcingExercise")).toBeGreaterThan(at("Requisition"));
    expect(body.indexOf("tx.approvalInstance.findUnique")).toBeGreaterThan(v);
    expect(body.indexOf("tx.approvalStep.updateMany")).toBeGreaterThan(v);
  });

  it("refuses a cancelled contract and a closed variation after the locks and before the step is moved", () => {
    // Run 1a (faithful, ADR 0031): the cancelled contract's refusal is the one act × status table's; the order is unchanged.
    const cancelled = body.indexOf('const variationRefused = inst.variation?.contract ? actStatusFault("VARIATION",');
    const closed = body.indexOf('inst.variation?.status === "CLOSED"');
    const write = body.indexOf("approvalStep.updateMany");
    for (const x of [cancelled, closed]) {
      expect(x).toBeGreaterThan(at("Variation"));
      expect(x).toBeLessThan(write);
    }
  });

  it("every act that decides it runs inside inContract (withLockedContract) and locks the variation, reading the clock once", () => {
    const src = read("src/app/projects/[id]/variation-actions.ts");
    for (const name of ["sendVariationForApproval", "decideVariationApprovalStep", "citeVariationCommittee", "chooseVariationRefusal", "tableVariationMatter"]) {
      const a = src.indexOf(`export async function ${name}(`);
      expect(a, name).toBeGreaterThan(-1);
      const next = src.indexOf("\nexport async function ", a + 10);
      const b = src.slice(a, next === -1 ? undefined : next);
      expect(b, name).toMatch(/return inContract\(/);
      expect(b, name).toMatch(/lockVariation\(c, variationId\)/);
      expect((b.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
    }
  });

  it("the route's helpers read no clock, take no lock of their own and never reach outside the transaction", () => {
    for (const f of ["src/lib/variation/route-write.ts", "src/lib/variation/at-certificate.ts"]) {
      const m = lex(read(f));
      expect(m, f).not.toMatch(/new Date\(\)/);
      expect(m, f).not.toMatch(/FOR UPDATE|FOR SHARE/);
      expect(m, f).not.toMatch(/\bdb\./);
    }
  });

  it("the worklist links a variation's step to the variation's Approval tab, where it is decided", () => {
    expect(read("src/lib/approvals/load.ts")).toMatch(/href: `\/projects\/\$\{r\.variation\.contract\.id\}\/variations\/\$\{r\.variation\.id\}\?tab=approval`/);
  });
});
