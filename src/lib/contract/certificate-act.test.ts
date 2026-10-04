import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CERTIFICATE_KINDS, CERTIFICATE_STATUSES, type CertificateKind } from "@/lib/certificate/types";
import { voidFaults } from "@/lib/certificate/void";
import { certificateFaultWords } from "@/lib/certificate/fault-text";

import { ACT_STATUS, actStatusFault, actStatusText, certificateAct, CERTIFICATE_CANCELLED_WORDS, certificateGates, certificatePhase, certificateVoidAct, CERTIFICATE_PHASES, KIND_ISSUE_WRITES, WRITER_FAMILY } from "./act-status";
import { STATUS_WRITTEN_BY } from "./status";
import { CONTRACT_STATUSES, type ContractStatus } from "./types";

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
    // Residual round (faithful): the void's family is certificateVoidAct's, the one function the page asks too.
    expect(acts).toMatch(/actStatusFault\(phase === "VOID" \? certificateVoidAct\(kind, l\.cert\.status as CertificateStatus\) : certificateAct\(kind, phase\), l\.contract\.status as ContractStatus\)/);
    for (const a of ["despatchCertificateCopy", "acknowledgeCertificateCopy", "recordCertificatePayment"]) expect(acts.slice(acts.indexOf(`export async function ${a}(`)).split("\nexport ")[0], a).toMatch(/inCertificate\(certOf\(data\), now, "POST_ISSUE",/);
    expect(acts.slice(acts.indexOf("export async function voidCertificateAct(")).split("\nexport ")[0]).toMatch(/inCertificate\(certOf\(data\), now, "VOID",/);
    const page = readFileSync("src/app/projects/[id]/certificates/[certId]/page.tsx", "utf8");
    expect(page).toMatch(/certificateAct\(cert\.kind as CertificateKind, certificatePhase\(cert\.status as CertificateStatus\)\)/);
  });
});

/**
 * Code re-review S-1 (residual round; the lead's decision, BD-613-127). Since the fix round, voiding an unissued
 * certificate read its kind's own family, so a draft, routed or signing certificate whose family closes (an interim at
 * the final certificate, an advance at practical completion, an EOT at making good complete) could never be signed,
 * decided or voided, and stayed non-VOID for good. Voiding an unissued certificate reads the CERTIFICATE row again, as
 * it did before the round. An issued certificate's void still reads its post-issue family, and voidFaults refuses it
 * (ISSUED_IS_FINAL, VOID_WOULD_UNDO_STATUS).
 */
describe("S-1: voiding an unissued certificate reads the CERTIFICATE row", () => {
  const UNISSUED = ["DRAFT", "IN_ROUTING", "SIGNING"] as const;
  const voidRefused = (k: CertificateKind, cs: (typeof CERTIFICATE_STATUSES)[number], s: ContractStatus) => actStatusFault(certificateVoidAct(k, cs), s);

  it("the review's examples stay voidable: an interim at the final certificate, an advance at practical completion, an EOT at making good complete", () => {
    for (const cs of UNISSUED) {
      expect(voidRefused("INTERIM_PAYMENT", cs, "FINAL_CERTIFICATE_ISSUED"), cs).toBeNull();
      expect(voidRefused("ADVANCE_PAYMENT", cs, "PRACTICALLY_COMPLETE"), cs).toBeNull();
      expect(voidRefused("EOT", cs, "MAKING_GOOD_COMPLETE"), cs).toBeNull();
    }
  });

  it("for every kind, in every state its pre-issue family refuses, void stays open (save where every certificate act is refused)", () => {
    let cases = 0;
    for (const k of CERTIFICATE_KINDS)
      for (const s of CONTRACT_STATUSES) {
        if (!actStatusFault(certificateAct(k, "PRE_ISSUE"), s) || ACT_STATUS.CERTIFICATE[s] === "REFUSED") continue;
        for (const cs of UNISSUED) {
          expect(voidRefused(k, cs, s), `${k} ${cs} at ${s}`).toBeNull();
          cases++;
        }
      }
    expect(cases).toBeGreaterThan(100);
  });

  it("the states where the CERTIFICATE row refuses every certificate act are exactly cancelled, terminated and closed: there the void is refused in the table's words (BD-613-127 asks the product owner about these)", () => {
    expect(CONTRACT_STATUSES.filter((s) => ACT_STATUS.CERTIFICATE[s] === "REFUSED")).toEqual(["CANCELLED", "TERMINATED", "CLOSED"]);
    for (const k of CERTIFICATE_KINDS)
      for (const cs of UNISSUED) {
        expect(voidRefused(k, cs, "CANCELLED")?.code, `${k} ${cs}`).toBe("CONTRACT_CANCELLED");
        expect(voidRefused(k, cs, "TERMINATED")?.code, `${k} ${cs}`).toBe("CONTRACT_TERMINATED");
        expect(voidRefused(k, cs, "CLOSED")?.code, `${k} ${cs}`).toBe("CONTRACT_CLOSED");
      }
    expect(actStatusText(voidRefused("TERMINATION_INTENT", "DRAFT", "TERMINATED")!)).toMatch(/^The contract is terminated: /);
  });

  it("an unissued certificate's void reads CERTIFICATE; an issued one's its post-issue family, as before", () => {
    for (const k of CERTIFICATE_KINDS) {
      for (const cs of [...UNISSUED, "VOID"] as const) expect(certificateVoidAct(k, cs), `${k} ${cs}`).toBe("CERTIFICATE");
      expect(certificateVoidAct(k, "ISSUED"), k).toBe(certificateAct(k, "POST_ISSUE"));
    }
  });
});

/**
 * Code re-review S-2: the certificate page's gates are its acts' answers, in its acts' words. The wrapper refuses with the
 * table's family by phase (or the void's), and a cancelled contract with its own words. The page wraps its header's acts
 * and its tabs in these gates (act-status-screens.test.ts).
 */
describe("S-2: the certificate page's gates say what its acts would", () => {
  const wrapper = (k: CertificateKind, cs: (typeof CERTIFICATE_STATUSES)[number], s: ContractStatus, phase: "ACTS" | "VOID") => {
    const f = actStatusFault(phase === "VOID" ? certificateVoidAct(k, cs) : certificateAct(k, certificatePhase(cs)), s);
    return f ? (f.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its certificates are kept as they were." : actStatusText(f)) : null;
  };

  it("for every kind, certificate state and contract state, each gate is the wrapper's answer", () => {
    for (const k of CERTIFICATE_KINDS)
      for (const cs of CERTIFICATE_STATUSES)
        for (const s of CONTRACT_STATUSES) expect(certificateGates(k, cs, s), `${k} ${cs} ${s}`).toEqual({ acts: wrapper(k, cs, s, "ACTS"), void: wrapper(k, cs, s, "VOID") });
  });

  it("the cancelled words are the wrapper's own (source), in English and Malay", () => {
    const acts = readFileSync("src/app/projects/[id]/certificates/[certId]/actions.ts", "utf8");
    expect(acts).toContain(`const CANCELLED: FormState = { ok: false, message: "${CERTIFICATE_CANCELLED_WORDS.en}" };`);
    expect(CERTIFICATE_CANCELLED_WORDS.ms).toBe("Kontrak dibatalkan: perakuannya dikekalkan seperti sedia ada.");
  });

  it("an EOT draft once the final certificate is issued: its acts refused in the table's words, its void open", () => {
    expect(certificateGates("EOT", "DRAFT", "FINAL_CERTIFICATE_ISSUED")).toEqual({ acts: "Not recorded while the contract stands at “Final certificate issued”.", void: null });
    expect(certificateGates("INTERIM_PAYMENT", "SIGNING", "FINAL_CERTIFICATE_ISSUED")).toEqual({ acts: "Not recorded while the contract stands at “Final certificate issued”.", void: null });
    expect(certificateGates("INTERIM_PAYMENT", "ISSUED", "FINAL_CERTIFICATE_ISSUED")).toEqual({ acts: null, void: null });
    expect(certificateGates("INTERIM_PAYMENT", "DRAFT", "ACTIVE")).toEqual({ acts: null, void: null });
  });
});
