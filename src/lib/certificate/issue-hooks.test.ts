import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { ACT_STATUS, KIND_ISSUE_WRITES } from "@/lib/contract/act-status";

import { KIND_ISSUE_HOOK, openCertificate, openClaim, openMatter, strandedFaults } from "./issue-hooks";
import { CERTIFICATE_KINDS, type CertificateKind } from "./types";

/**
 * ADR 0047 D2, plan closeout-plan.md CO-2: one issue-hook map. Stage A has the two extensions' kinds; the kinds whose
 * issue writes the contract's status join in stages B and C (each leaves PENDING as its hook lands, never the other way).
 * Termination is wholly out of Phase 2 (ruling 24).
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const PENDING: readonly CertificateKind[] = ["PRACTICAL_COMPLETION", "MAKING_GOOD_DEFECTS", "FINAL"];
const OUT_OF_PHASE_2: readonly CertificateKind[] = ["TERMINATION"];

describe("the map", () => {
  it("stage A: exactly the EOT certificate and the contract period agreement", () => {
    expect(Object.keys(KIND_ISSUE_HOOK).sort()).toEqual(["CONTRACT_PERIOD_AGREEMENT", "EOT"]);
  });
  it("a kind whose issue writes a status has a hook, or is pending a later stage (the list only shrinks), or is out of Phase 2", () => {
    const writes = CERTIFICATE_KINDS.filter((k) => KIND_ISSUE_WRITES[k] != null);
    for (const k of writes) expect(k in KIND_ISSUE_HOOK || PENDING.includes(k) || OUT_OF_PHASE_2.includes(k), k).toBe(true);
    for (const k of PENDING) expect(k in KIND_ISSUE_HOOK, `${k} has its hook: take it off PENDING`).toBe(false);
  });
  it("the certificate's issue asks the hook's refusal beside the others, and runs its writes after the variation's, in the same transaction (source)", () => {
    const write = readFileSync("src/lib/certificate/write.ts", "utf8");
    const issue = write.slice(write.indexOf("async function issue("), write.indexOf("export async function correctCertificateDate("));
    expect(issue).toMatch(/\?\? \(hook \? await hook\.refusal\(c\.tx, c\.l, cert\) : null\);\n\s+if \(refusal\) throw new CertificateRefusal\(refusal\);/);
    expect(issue).toMatch(/const hooked = hook \? await hook\.after\(c\.tx, c\.actor, c\.l, cert, number, c\.now, c\.today\) : null;\n\s+if \(hooked\) throw new CertificateRefusal\(hooked\);/);
    expect(issue.indexOf("hook.refusal(")).toBeLessThan(issue.indexOf('await moveTo(c, "ISSUED"'));
    expect(issue.indexOf("hook.after(")).toBeGreaterThan(issue.indexOf("afterCertificateIssue("));
  });
});

describe("strandedFaults: nothing is left that no act can finish (CO-2)", () => {
  it("an EOT route pending refuses the CMGD's issue, naming it; so does an undetermined claim", () => {
    const f = strandedFaults([openMatter("EOT", "Extension of time CM/1")], "MAKING_GOOD_COMPLETE");
    expect(codes(f)).toEqual(["WORK_WOULD_BE_STRANDED"]);
    expect(f[0].data?.items).toBe("Extension of time CM/1");
    expect(codes(strandedFaults([openClaim("Claim of 2 Oct")], "MAKING_GOOD_COMPLETE"))).toEqual(["WORK_WOULD_BE_STRANDED"]);
  });
  it("an EOT route pending does not refuse the CPC's issue (EOT is recorded once practically complete)", () => {
    expect(strandedFaults([openMatter("EOT", "CM/1")], "PRACTICALLY_COMPLETE")).toEqual([]);
  });
  it("a period-extension matter pending refuses the CPC's issue", () => {
    expect(codes(strandedFaults([openMatter("PERIOD_EXTENSION", "CM/2")], "PRACTICALLY_COMPLETE"))).toEqual(["WORK_WOULD_BE_STRANDED"]);
  });
  it("a certificate in progress is judged by its kind's pre-issue family", () => {
    expect(codes(strandedFaults([openCertificate("INTERIM_PAYMENT", "IP/4")], "FINAL_CERTIFICATE_ISSUED"))).toEqual(["WORK_WOULD_BE_STRANDED"]);
    expect(strandedFaults([openCertificate("INTERIM_PAYMENT", "IP/4")], "MAKING_GOOD_COMPLETE")).toEqual([]);
  });
  it("nothing open passes; every stranded item is named once, in order", () => {
    expect(strandedFaults([], "MAKING_GOOD_COMPLETE")).toEqual([]);
    expect(strandedFaults([openMatter("EOT", "A"), openMatter("LOSS_EXPENSE", "B"), openMatter("PERIOD_EXTENSION", "C")], "MAKING_GOOD_COMPLETE")[0].data?.items).toBe("A; C");
  });
  it("the families are read from ACT_STATUS itself: changing a row changes the answer", () => {
    const row = ACT_STATUS.EOT as Record<string, "ALLOWED" | "REFUSED">;
    const was = row.MAKING_GOOD_COMPLETE;
    try {
      row.MAKING_GOOD_COMPLETE = "ALLOWED";
      expect(strandedFaults([openMatter("EOT", "CM/1")], "MAKING_GOOD_COMPLETE")).toEqual([]);
    } finally {
      row.MAKING_GOOD_COMPLETE = was;
    }
    expect(codes(strandedFaults([openMatter("EOT", "CM/1")], "MAKING_GOOD_COMPLETE"))).toEqual(["WORK_WOULD_BE_STRANDED"]);
  });
});
