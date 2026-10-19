import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dateCorrectionFaults } from "./contract-date";
import { executedSnapshot, frozenSigningDays } from "./executed-snapshot";
import { contractFaultWords } from "./fault-text";
import { signFaults, type SignInputs } from "./sign";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

/**
 * 6.12 review M-1: a corrected Contract Date could fall before the contractor signed.
 *
 * WORKED EXAMPLE (by hand):
 *   ready to sign since  25 Sep (the last condition met: the bond verified)
 *   contractor signed    29 Sep (witnessed the same day)
 *   RSAJ signature act   30 Sep → Contract Date 30 Sep
 *   correct to 29 Sep → allowed (the contractor had signed);
 *   correct to 25 Sep → refused: the contractor signed on 29 Sep (before this fix it was allowed);
 *   correct to 24 Sep → refused twice: before ready to sign, and before the contractor signed;
 *   correct to 30 Sep → refused: not earlier.
 */
describe("the Contract Date is never corrected to before the contractor signed (M-1)", () => {
  const base = { executed: true, current: "2026-09-30", readySince: "2026-09-25", reason: "Signed on paper on the 29th; recorded on the 30th.", signed: { contractor: "2026-09-29", witness: "2026-09-29" } };
  it("29 Sep: allowed", () => expect(dateCorrectionFaults({ ...base, proposed: "2026-09-29" })).toEqual([]));
  it("25 Sep: refused, the contractor signed on 29 Sep", () => {
    const fs = dateCorrectionFaults({ ...base, proposed: "2026-09-25" });
    expect(fs).toEqual([{ code: "BEFORE_CONTRACTOR_SIGNED", level: "block", data: { party: "CONTRACTOR", signedOn: "2026-09-29" } }]);
    expect(contractFaultWords(fs[0]).en).toBe("The contractor signed on 29 Sep 2026: the employer signs after the contractor, so the Contract Date cannot be before that day.");
  });
  it("24 Sep: before ready to sign and before the contractor signed", () => {
    expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-09-24" }))).toEqual(["BEFORE_READY", "BEFORE_CONTRACTOR_SIGNED"]);
  });
  it("30 Sep: not earlier", () => expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-09-30" }))).toEqual(["NOT_EARLIER"]));
  it("a witness recorded on a later day than the contractor binds too", () => {
    const fs = dateCorrectionFaults({ ...base, proposed: "2026-09-29", signed: { contractor: "2026-09-28", witness: "2026-09-29" } });
    expect(fs).toEqual([]);
    const late = dateCorrectionFaults({ ...base, proposed: "2026-09-28", signed: { contractor: "2026-09-28", witness: "2026-09-29" } });
    expect(late).toEqual([{ code: "BEFORE_CONTRACTOR_SIGNED", level: "block", data: { party: "WITNESS", signedOn: "2026-09-29" } }]);
    expect(contractFaultWords(late[0]).en).toMatch(/^The contractor's signature was witnessed on 29 Sep 2026/);
  });
});

describe("the executed snapshot freezes the signature days", () => {
  it("built once, read back", () => {
    const s = executedSnapshot({ contractDate: "2026-09-30", readySince: "2026-09-25", contractorSignedOn: "2026-09-29", witnessSignedOn: "2026-09-29", gate: [], legal: [], signatory: {}, checks: [], formation: null });
    expect(s.v).toBe(1);
    expect(frozenSigningDays(JSON.parse(JSON.stringify(s)))).toEqual({ readySince: "2026-09-25", contractorSignedOn: "2026-09-29", witnessSignedOn: "2026-09-29" });
  });
  it("a snapshot frozen before M-1 says so (undefined), so the act reads the signature rows instead", () => {
    expect(frozenSigningDays({ v: 1, readySince: "2026-09-25" })).toEqual({ readySince: "2026-09-25", contractorSignedOn: undefined, witnessSignedOn: undefined });
    expect(frozenSigningDays(null).readySince).toBeNull();
  });
  it("the days are required by the rule (S-4), and the drawer says so", () => {
    expect(readFileSync(path.join(__dirname, "contract-date.ts"), "utf8")).toMatch(/signed: \{ contractor: string \| null; witness: string \| null \} \}/);
    expect(readFileSync(path.join(__dirname, "../../app/projects/[id]/editors.tsx"), "utf8")).toContain("nor before the contractor signed");
  });
  it("the signature act freezes them and the correction act passes them", () => {
    const src = readFileSync(path.join(__dirname, "../../app/projects/[id]/actions.ts"), "utf8");
    const sign = src.slice(src.indexOf("export async function recordRsajSignature("), src.indexOf("async function writeVersion("));
    expect(sign).toContain("executedSnapshot(");
    expect(sign).toMatch(/contractorSignedOn: s\.inputs\.contractorSignedOn/);
    const correct = src.slice(src.indexOf("export async function correctContractDate("), src.indexOf("export async function recordStamping("));
    expect(correct).toMatch(/dateCorrectionFaults\(\{.*signed: \{ contractor: /);
  });
});

/**
 * 6.12 review R-4: with no approval matrix issued and in force, the signatory was null and nothing refused
 * the RSAJ signature on it. Now it is refused, naming it, as the award's evaluation does.
 */
describe("no approval-matrix issue in force refuses the RSAJ signature (R-4)", () => {
  const MET = { ready: true, items: [] };
  const clear: SignInputs = { status: "LEGALLY_ENDORSED", gate: MET, resolutionLive: true, contractorSignedOn: "2026-09-29", witnessRecorded: true, formationFaults: 0, commitment: null, signatoryCond: "CONTRACT_AGREEMENT", signatory: { ok: true }, signer: [], baselineBlocks: 0, today: "2026-09-30", issueInForce: true };
  it("an issue in force: clear", () => expect(signFaults(clear)).toEqual([]));
  it("none in force: refused, NO_ISSUE_IN_FORCE, the signatory unresolved", () => {
    expect(codes(signFaults({ ...clear, issueInForce: false, signatory: null }))).toEqual(["NO_ISSUE_IN_FORCE"]);
    expect(contractFaultWords({ code: "NO_ISSUE_IN_FORCE", level: "block" }).en).toMatch(/^No approval matrix is issued and in force today/);
  });
  it("no condition frozen is said first; the issue is then not asked", () => {
    expect(codes(signFaults({ ...clear, issueInForce: false, signatory: null, signatoryCond: null }))).toEqual(["SIGNATORY_COND_NOT_FROZEN"]);
  });
  it("the facts the screen and the act share pass whether an issue is in force", () => {
    const judge = readFileSync(path.join(__dirname, "judge.ts"), "utf8");
    expect(judge).toMatch(/issueInForce: f\.facts\.funder != null/);
  });
});
