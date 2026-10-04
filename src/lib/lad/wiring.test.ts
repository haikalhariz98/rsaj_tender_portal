import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 6.13 Part B run 1b, C6 (flagged against Part A): the acts call the rules (source). What it does not read (its blind
 * spots, declared): whether the call's result is used beyond `refuse` (the rules' own tests and the verify cases in
 * phase B hold that), and any act outside the two files named.
 */

const acts = readFileSync("src/app/projects/[id]/payment-actions.ts", "utf8");
const body = (name: string) => {
  const at = acts.indexOf(`export async function ${name}(`);
  return acts.slice(at, acts.indexOf("\n}\n", at));
};

describe("the damages decision reads the EOT record, per scope (613A-C2 (a)(1); FR-LAD-001, 011)", () => {
  const d = body("recordNonCompletion");
  it("refuses on decisionBasisFaults and the scope's own replacement rule, under the claim's locks", () => {
    expect(d).toMatch(/const basisFs = decisionBasisFaults\(\{ outcome, scope: decScope \?\? "WHOLE", sectionRef: decRef, claims: claimFactsOf\(p\), eotClaimId: lad0 \? null : eotClaimId \}\);\n\s+if \(basisFs\.length\) refuse\("Not recorded:", basisFs\);/);
    expect(d).toMatch(/replacementFaultsOnScope\(liveDecisionsOf\(p\), decScope \?\? "WHOLE", decRef,/);
    expect(d).not.toMatch(/\breplacementFaults\(/);
    expect(d).not.toMatch(/\bliveDecisionOf\(/);
    const m = d.indexOf('FROM "ContractMatter"');
    const c = d.indexOf('FROM "EotClaim"');
    const n = d.indexOf('FROM "NonCompletion"');
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(c);
    expect(c).toBeLessThan(n);
  });
  it("every new decision is EOT_RECORD; an excusable one names its claim", () => {
    expect(d).toMatch(/basis: "EOT_RECORD", eotClaimId: lad \? null : \(named\?\.id \?\? null\)/);
  });
});

describe("the interim's issue refuses a moved damages basis (ADR 0030 §6)", () => {
  const at = readFileSync("src/lib/payment/at-issue.ts", "utf8");
  it("reads the basis now on the act's day and compares it with the frozen one", () => {
    expect(at).toMatch(/const now = \{ \.\.\.ladBasisOf\(p, baseline\), waiversApplied: j\.ladBasis\.waiversApplied \};\n\s+fs\.push\(\.\.\.ladBasisMoved\(j\.ladBasis, now, basisNamesOf\(p, baseline\)\)\);/);
    expect(readFileSync("src/lib/certificate/write.ts", "utf8")).toMatch(/issueRefusal\(c\.tx, c\.l, cert, sequence, c\.today\)/);
  });
  it("the raise assembles per scope from the load (damagesOf)", () => {
    expect(readFileSync("src/lib/payment/load.ts", "utf8")).toMatch(/damages: damagesOf\(p, baseline\),/);
  });
});
