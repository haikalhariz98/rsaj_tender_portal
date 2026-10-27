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

describe("Phase 2 close-out stage A2: the loss-and-expense and waiver acts call their rules (source)", () => {
  const time = readFileSync("src/app/projects/[id]/time-actions.ts", "utf8");
  const damages = readFileSync("src/app/projects/[id]/damages-actions.ts", "utf8");
  const of = (src: string, name: string) => {
    const at = src.indexOf(`export async function ${name}(`);
    return src.slice(at, src.indexOf("\n}\n", at));
  };
  it("record, value and send a loss-and-expense claim; the claims committee is checked on the resolved chain", () => {
    expect(of(time, "recordLossExpense")).toMatch(/lossRecordFaults\(/);
    expect(of(time, "valueLossExpense")).toMatch(/lossValueFaults\(\{ sent: x\.matterId != null,/);
    expect(of(time, "sendLossExpense")).toMatch(/lossSendFaults\(\{ valued \}\)/);
    expect(of(time, "sendLossExpense")).toMatch(/chainCheck: \(codes, nameOf\) => claimsCommitteeFaults\(codes, claims, nameOf\)/);
  });
  it("the adjustment drawer posts each line's claim, shown only for a loss-and-expense line, from the approved claims not yet paid", () => {
    const drawer = readFileSync("src/app/projects/[id]/variation-editors.tsx", "utf8");
    expect(drawer).toMatch(/name: `other\$\{n\}LossClaim`, label: "The claim it pays"/);
    expect(drawer).toMatch(/`other\$\{n\}LossClaim`, \{ name: `other\$\{n\}Trigger`, in: \["LOSS_AND_EXPENSE"\] \}/);
    expect(readFileSync("src/app/projects/[id]/variation-panels.tsx", "utf8")).toMatch(/losses=\{v\.losses\}/);
  });
  it("a 1.2 line takes an approved claim, once, never above its value", () => {
    expect(of(readFileSync("src/app/projects/[id]/variation-actions.ts", "utf8"), "raiseSumAdjustment")).toMatch(/lossLineFaults\(\{ approved, label, adjustedOn:/);
  });
  it("a waiver is judged at record, at send and at re-send, and routed at the exact ratio", () => {
    for (const a of ["recordLadWaiver", "sendLadWaiver", "resendLadWaiver"]) expect(of(damages, a), a).toMatch(/waiverRecordFaults\(/);
    expect(of(damages, "sendLadWaiver")).toMatch(/ratio: waiverRatio\(waived, b\.amount\)/);
    expect(damages).toMatch(/actStatusFault\(family, l\.contract\.status as ContractStatus\)/);
    for (const a of ["recordLadWaiver", "sendLadWaiver", "resendLadWaiver"]) expect(of(damages, a), a).toMatch(/"LAD_WAIVER"/);
  });
  it("the interim's raise applies the approved waivers the switch names, locked before the valuation", () => {
    const raise = body("raiseInterimCertificate");
    expect(raise.indexOf("lockUnappliedWaivers(")).toBeGreaterThan(-1);
    expect(raise.indexOf("lockUnappliedWaivers(")).toBeLessThan(raise.indexOf("openValuationOf("));
    expect(raise).toMatch(/const waivers = waiversToApplyOf\(p, baseline, setting\);/);
    expect(raise).toMatch(/appliedOnCertificateId: null \}, data: \{ appliedOnCertificateId: certId/);
  });
});
