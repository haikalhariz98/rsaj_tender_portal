import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CERTIFICATE_KINDS, type CertificateKind } from "@/lib/certificate/types";
import { voidFaults } from "@/lib/certificate/void";
import { certificateFaultWords } from "@/lib/certificate/fault-text";

import { ACT_STATUS, actStatusFault, certificateAct, CERTIFICATE_PHASES, KIND_ISSUE_WRITES, WRITER_FAMILY } from "./act-status";
import { STATUS_WRITTEN_BY } from "./status";
import type { ContractStatus } from "./types";

/**
 * 6.13 Part B Run 1a fix round (BD-613-114 as confirmed with its condition): a certificate's acts read the table by
 * its kind and the phase of the act. Before the issue (prepare, route, sign, issue) the kind's own family; after it
 * (despatch, acknowledgement, copies, payment) the CERTIFICATE row, in whatever state the issue left the contract.
 * certificateAct is an exhaustive switch: a new kind is a type error. Voiding an issued certificate whose issue wrote the
 * contract's status is refused, named, until a run decides how the status is undone (deferred).
 */

const PRE: Record<CertificateKind, string> = {
  DELEGATION_LETTER: "SUPERVISION",
  DELEGATION_NOTICE: "SUPERVISION",
  INTERIM_PAYMENT: "VALUATION",
  ADVANCE_PAYMENT: "ADVANCE_PAYMENT",
  LAD_WARNING: "DAMAGES",
  NON_COMPLETION: "DAMAGES",
  VARIATION_APPLICATION: "VARIATION",
  SO_INSTRUCTION: "VARIATION",
  VARIATION: "VARIATION",
  SUM_ADJUSTMENT: "SUM_ADJUSTMENT",
  EOT: "EOT",
  CONTRACT_PERIOD_AGREEMENT: "PERIOD_EXTENSION",
  PARTIAL_OCCUPATION: "COMPLETION",
  PRACTICAL_COMPLETION: "COMPLETION",
  SCHEDULE_OF_DEFECTS: "DEFECTS",
  MAKING_GOOD_DEFECTS: "MAKING_GOOD",
  TERMINATION_INTENT: "TERMINATION_CASE",
  TERMINATION: "TERMINATION_CASE",
  TERMINATED_FINAL: "TERMINATED_FINAL_ROUTE",
  NOMINATION_LETTER: "NOMINATED",
  FINAL: "FINAL_ACCOUNT",
};

describe("pre-issue acts read the kind's own family", () => {
  it("each kind, as the condition names them (EOT reads EOT, the CPC COMPLETION, the CMGD MAKING_GOOD, and so on)", () => {
    for (const k of CERTIFICATE_KINDS) expect(certificateAct(k, "PRE_ISSUE"), k).toBe(PRE[k]);
  });
  it("an EOT certificate is refused once the final certificate is issued", () => {
    expect(actStatusFault(certificateAct("EOT", "PRE_ISSUE"), "FINAL_CERTIFICATE_ISSUED")).toEqual({ code: "NOT_IN_STATUS", level: "block", data: { status: "FINAL_CERTIFICATE_ISSUED" } });
  });
  it("a kind whose issue writes a state is prepared by that state's writer's family, allowed in a state with an edge to it", () => {
    for (const k of CERTIFICATE_KINDS) {
      const to = KIND_ISSUE_WRITES[k];
      if (!to) continue;
      const fam = certificateAct(k, "PRE_ISSUE");
      expect(fam, k).toBe(WRITER_FAMILY[STATUS_WRITTEN_BY[to]!]);
    }
  });
});

describe("post-issue acts read the CERTIFICATE row (the termination's own certificates, their case's)", () => {
  it("every kind but the termination's three reads CERTIFICATE after its issue", () => {
    for (const k of CERTIFICATE_KINDS) {
      const expected = k === "TERMINATION" || k === "TERMINATION_INTENT" ? "TERMINATION_CASE" : k === "TERMINATED_FINAL" ? "TERMINATED_FINAL_ROUTE" : "CERTIFICATE";
      expect(certificateAct(k, "POST_ISSUE"), k).toBe(expected);
    }
  });
  it("for every kind whose issue writes a state, the post-issue family is allowed in that state", () => {
    const writes = CERTIFICATE_KINDS.filter((k) => KIND_ISSUE_WRITES[k]);
    expect(writes.map((k) => [k, KIND_ISSUE_WRITES[k]])).toEqual([["PRACTICAL_COMPLETION", "PRACTICALLY_COMPLETE"], ["MAKING_GOOD_DEFECTS", "MAKING_GOOD_COMPLETE"], ["TERMINATION", "TERMINATED"], ["FINAL", "FINAL_CERTIFICATE_ISSUED"]]);
    for (const k of writes) expect(ACT_STATUS[certificateAct(k, "POST_ISSUE")][KIND_ISSUE_WRITES[k] as ContractStatus], k).toBe("ALLOWED");
  });
  it("the phases are two", () => {
    expect([...CERTIFICATE_PHASES]).toEqual(["PRE_ISSUE", "POST_ISSUE"]);
  });
});

describe("certificateAct is exhaustive (source)", () => {
  it("a switch on the kind with a case per kind, no default and no fall-through return", () => {
    const src = readFileSync("src/lib/contract/act-status.ts", "utf8");
    const body = src.slice(src.indexOf("export function certificateAct("), src.indexOf("\n}\n", src.indexOf("export function certificateAct(")));
    expect(body).toMatch(/switch \(kind\)/);
    expect(body).not.toMatch(/default:/);
    for (const k of CERTIFICATE_KINDS) expect(body, k).toMatch(new RegExp(`case "${k}":`));
    expect(body).toMatch(/const _never: never = kind/);
  });
});

describe("voiding an issued certificate whose issue wrote the contract's status is refused (deferred)", () => {
  it("named, before the general rule, for each such kind; every other kind keeps ISSUED_IS_FINAL", () => {
    for (const k of CERTIFICATE_KINDS) {
      const codes = voidFaults(k, "ISSUED").map((f) => f.code);
      expect(codes, k).toEqual(KIND_ISSUE_WRITES[k] ? ["VOID_WOULD_UNDO_STATUS"] : ["ISSUED_IS_FINAL"]);
    }
    for (const s of ["DRAFT", "IN_ROUTING", "SIGNING"] as const) expect(voidFaults("PRACTICAL_COMPLETION", s), s).toEqual([]);
  });
  it("its words name the state, in English and Malay", () => {
    const w = certificateFaultWords(voidFaults("PRACTICAL_COMPLETION", "ISSUED")[0]);
    expect(w.en).toBe("Its issue made the contract practically complete, and no act undoes that yet: an issued certificate that wrote where the contract stands is not voided.");
    expect(w.ms).toBe("Pengeluarannya menjadikan kontrak siap kerja, dan belum ada tindakan yang membatalkannya: perakuan dikeluarkan yang menetapkan keadaan kontrak tidak dibatalkan.");
  });
  it("the void act asks it, and the certificate page and its acts read the phase the same way (source)", () => {
    const write = readFileSync("src/lib/certificate/write.ts", "utf8");
    const v = write.slice(write.indexOf("export async function voidCertificate("));
    expect(v.slice(0, 400)).toMatch(/voidFaults\(cert\.kind as CertificateKind, s\)/);
    const acts = readFileSync("src/app/projects/[id]/certificates/[certId]/actions.ts", "utf8");
    expect(acts).toMatch(/actStatusFault\(certificateAct\(l\.cert\.kind as CertificateKind, phase === "BY_STATUS" \? certificatePhase\(l\.cert\.status as CertificateStatus\) : phase\), l\.contract\.status as ContractStatus\)/);
    for (const a of ["despatchCertificateCopy", "acknowledgeCertificateCopy", "recordCertificatePayment"]) expect(acts.slice(acts.indexOf(`export async function ${a}(`)).split("\nexport ")[0], a).toMatch(/inCertificate\(certOf\(data\), now, "POST_ISSUE",/);
    expect(acts.slice(acts.indexOf("export async function voidCertificateAct(")).split("\nexport ")[0]).toMatch(/inCertificate\(certOf\(data\), now, "BY_STATUS",/);
    const page = readFileSync("src/app/projects/[id]/certificates/[certId]/page.tsx", "utf8");
    expect(page).toMatch(/certificateAct\(cert\.kind as CertificateKind, certificatePhase\(cert\.status as CertificateStatus\)\)/);
  });
});
