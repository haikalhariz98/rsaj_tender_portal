import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contractFaultWords } from "./fault-text";
import { signFaults, type SignInputs } from "./sign";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.13 Part A (FR-SUP-001, against accepted 6.12): the employer's signature resolves the contract's
 * Superintending Officer from the matrix in force, at the sum it executes and the method it was let by. A
 * signature that would execute a contract nobody supervises is refused, naming the matrix; a caller that does
 * not ask (absent) is judged as before.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const MET = { ready: true, items: [{ key: "RETURNED", state: "MET" as const, detail: [] }] };
const clear: SignInputs = { status: "LEGALLY_ENDORSED", gate: MET, resolutionLive: true, contractorSignedOn: "2026-09-29", witnessRecorded: true, formationFaults: 0, commitment: null, signatoryCond: "CONTRACT_AGREEMENT", signatory: { ok: true }, signer: [], baselineBlocks: 0, today: "2026-09-30" };

describe("the S.O. at the employer's signature", () => {
  it("resolved: nothing more stands in the way", () => {
    expect(signFaults({ ...clear, so: { ok: true } })).toEqual([]);
  });
  it("not resolved: refused, naming the matrix", () => {
    const fs = signFaults({ ...clear, so: { ok: false, matrix: "Issue 3 (2026)", why: "NO_RULE" } });
    expect(codes(fs)).toEqual(["SO_UNRESOLVED"]);
    const t = contractFaultWords(fs[0]);
    expect(t.en).toMatch(/Issue 3 \(2026\)/);
    expect(t.en).toMatch(/Superintending Officer/);
  });
  it("no issue in force: that refusal alone, not the S.O.'s too", () => {
    expect(codes(signFaults({ ...clear, issueInForce: false, so: { ok: false, matrix: null, why: "NO_RULE" } }))).toEqual(["NO_ISSUE_IN_FORCE"]);
  });
  it("absent or null (not asked): judged as before", () => {
    expect(signFaults(clear)).toEqual([]);
    expect(signFaults({ ...clear, so: null })).toEqual([]);
  });
});

describe("the act writes the assignment it resolved (source)", () => {
  const src = readFileSync(path.join(__dirname, "../../app/projects/[id]/actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function recordRsajSignature"), src.indexOf("async function writeVersion("));
  it("an EXECUTION assignment, effective from the Contract Date, audited in the same transaction", () => {
    expect(body).toMatch(/contractSoAssignment\.create\(/);
    expect(body).toMatch(/reason: "EXECUTION"/);
    expect(body).toMatch(/effectiveOn: dayToDate\(contractDate\)/);
    expect(body).toMatch(/audit\(c, "ContractSoAssignment"/);
  });
});

describe("BD-613-9 ruling: the refusal's words", () => {
  it("says 'S.O. not resolved', names the matrix, says in words that its S.O. rows are missing, never the key", () => {
    const t = contractFaultWords(signFaults({ ...clear, so: { ok: false, matrix: "Demo limits, issue 1", why: "NO_RULE" } })[0]);
    expect(t.en).toMatch(/^S\.O\. not resolved: the approval matrix in force \(Demo limits, issue 1\) has no Superintending Officer rows/);
    for (const x of [t.en]) expect(x).not.toMatch(/superintending_officer|NO_RULE/);
  });
});
