import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CERTIFICATE_KINDS, type CertificateKind } from "@/lib/certificate/types";
import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";

import { ACT_STATUS, actStatusFault, actStatusWords, CERTIFICATE_PHASES, certificateAct, CONTRACT_ACTS, statusCalloutTitle, type ContractAct } from "./act-status";
import { bodyOf, TODAY_ACTS, TODAY_STATUSES, todayAnswer } from "./act-status-pin.fixture";
import { CONTRACT_TRANSITIONS, contractTransition, isExecuted, STATUS_WRITTEN_BY } from "./status";
import { CONTRACT_STATUSES, type ContractStatus } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.13 Part B run 1a (ADR 0031 §4, BD-613-99): one act × status table governs every act on a contract and /approvals.
 * CANCELLED refuses every act first. For the nine statuses that existed before, every act's answer is the one pinned
 * in act-status-pin.fixture.ts. In TERMINATED exactly seven acts are allowed, enumerated here.
 */

/// Each act today, by the table's act it reads (the certificate page's acts read their certificate's kind).
const ACT_OF: Record<string, ContractAct | "BY_KIND"> = {
  ...Object.fromEntries(["startPreparation", "setAssemblyPart", "recordReconciliation", "addAmendment", "addCorrection", "addRate", "removeCheckLine", "completeCheck", "submitLegal", "decideLegal", "recordWcCheck", "recordContractorSignature", "recordRsajSignature", "correctContractDate", "recordStamping"].map((a) => [a, "FORMATION"])),
  ...Object.fromEntries(["recordBriefing", "answerConsultingEngineer", "issueCopy", "despatchCopy", "acknowledgeCopy", "recallCopy", "reissueCopy"].map((a) => [a, "COPIES_AND_CUSTODY"])),
  // Run 1a fix round (R2): where an original is held is its own family, open for the record's life.
  ...Object.fromEntries(["registerOriginal", "moveOriginal"].map((a) => [a, "ORIGINALS"])),
  ...Object.fromEntries(["saveBaselineEntry", "confirmBaseline", "correctBaseline", "correctAwardTerm"].map((a) => [a, "BASELINE"])),
  ...Object.fromEntries(TODAY_ACTS["src/app/projects/[id]/supervision-actions.ts"].map((a) => [a, "SUPERVISION"])),
  ...Object.fromEntries(["recordValuationCalendar", "openInterimValuation", "recordMainWorks", "recordJointValuation", "addMaterialLine", "removeMaterialLine", "recordPartyLine", "addValuationDeduction", "removeValuationDeduction", "raiseInterimCertificate", "holdValuation", "withdrawValuation"].map((a) => [a, "VALUATION"])),
  releaseRetention: "RETENTION_RELEASE",
  recordOpeningPosition: "OPENING_POSITION",
  applyAdvancePayment: "ADVANCE_PAYMENT",
  ...Object.fromEntries(["raiseLadWarning", "recordWarningPost", "recordNonCompletion", "closeLadWindow"].map((a) => [a, "DAMAGES"])),
  ...Object.fromEntries(TODAY_ACTS["src/app/projects/[id]/variation-actions.ts"].filter((a) => a !== "raiseSumAdjustment").map((a) => [a, "VARIATION"])),
  raiseSumAdjustment: "SUM_ADJUSTMENT",
  ...Object.fromEntries(TODAY_ACTS["src/app/projects/[id]/certificates/[certId]/actions.ts"].map((a) => [a, "BY_KIND"])),
};

/// The certificate kinds raised before Part B (6.13 Part A and 6.14), named.
const PRE_PART_B_KINDS: readonly CertificateKind[] = ["DELEGATION_LETTER", "DELEGATION_NOTICE", "INTERIM_PAYMENT", "ADVANCE_PAYMENT", "LAD_WARNING", "NON_COMPLETION", "VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"];

const NEW: readonly ContractStatus[] = ["PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED"];
const allowedIn = (s: ContractStatus) => CONTRACT_ACTS.filter((a) => ACT_STATUS[a][s] === "ALLOWED");

describe("the table is exhaustive: every act, every status", () => {
  it("every act has an answer for every status of the schema", () => {
    for (const a of CONTRACT_ACTS) expect(Object.keys(ACT_STATUS[a]).sort(), a).toEqual([...CONTRACT_STATUSES].sort());
    expect(Object.keys(ACT_STATUS).sort()).toEqual([...CONTRACT_ACTS].sort());
  });
  // Changed for ADR 0042 D11 (PW-22): the Project workspace's row joins after the certificate's, before Part B's; and for ADR 0046, the funding row after it.
  // Changed for Phase 2 close-out stage D (ADR 0047 D4, ruling 12): PERFORMANCE_REPORT joins Part B's rows, before the final account's.
  it("38 families: 13 built before Part B (R2's originals included), the Project workspace's, the funding row, then Part B's 23 (R5's design guarantee claim and the performance report included)", () => {
    expect(CONTRACT_ACTS.length).toBe(38);
    expect(CONTRACT_ACTS.indexOf("PROJECT_WORKSPACE")).toBe(CONTRACT_ACTS.indexOf("CERTIFICATE") + 1);
    expect(CONTRACT_ACTS.indexOf("FUNDING")).toBe(CONTRACT_ACTS.indexOf("PROJECT_WORKSPACE") + 1);
    expect(CONTRACT_ACTS.indexOf("EOT")).toBe(15);
    expect(CONTRACT_ACTS.slice(0, 13)).toContain("ORIGINALS");
    expect(CONTRACT_ACTS.slice(0, 13)).not.toContain("PROJECT_WORKSPACE");
    expect(CONTRACT_ACTS.slice(0, 13)).not.toContain("FUNDING");
    expect(CONTRACT_ACTS.slice(15)).toContain("DESIGN_GUARANTEE_CLAIM");
    expect(CONTRACT_ACTS.slice(15)).toContain("PERFORMANCE_REPORT");
    expect(CONTRACT_ACTS.slice(15)).toHaveLength(23);
  });
  it("CANCELLED refuses every act, first", () => {
    for (const a of CONTRACT_ACTS) expect(actStatusFault(a, "CANCELLED")?.code, a).toBe("CONTRACT_CANCELLED");
  });
});

describe("Part A's answers, unchanged for the nine statuses that existed", () => {
  for (const [file, acts] of Object.entries(TODAY_ACTS)) {
    it(`${file}: each act's answer is the pinned one`, () => {
      for (const a of acts) {
        const mapped = ACT_OF[a];
        // Run 1a fix round (BD-613-114): a certificate's act reads its kind and phase. The kinds raised before Part B (those
        // listed before EOT), in both phases, give the pinned answer; Part B's kinds are raised from run 1b on.
        // Residual round (consider, sturdier): the kinds raised before Part B, named, not read from the enum's order.
        const kinds: ContractAct[] = mapped === "BY_KIND" ? [...new Set(PRE_PART_B_KINDS.flatMap((k) => CERTIFICATE_PHASES.map((p) => certificateAct(k, p))))] : [mapped];
        for (const act of kinds) for (const s of TODAY_STATUSES) expect(ACT_STATUS[act][s] === "ALLOWED" ? "ALLOWED" : "CANCELLED", `${a} ${act} ${s}`).toBe(todayAnswer(s));
      }
    });
  }
});

// Run 1a fix round (BD-613-113 as ruled, R1, R2, R5): CLOSE, SECURITY_RELEASE, DESIGN_BOND_RELEASE, ORIGINALS and
// DESIGN_GUARANTEE_CLAIM join BD-613-99's seven.
describe("BD-613-99: in TERMINATED exactly these acts are allowed", () => {
  // Changed for ADR 0042 D11 (PW-22): the Project workspace stays open on a terminated contract; and for ADR 0046, the funding row.
  it("the termination case, renomination, the TERMINATED_FINAL route, the converse decision, bond claims, rectification, debt, the releases of a security and the design guarantee bond, the originals' custody, the design guarantee claim, the Project workspace, funding and the close; no other", () => {
    expect([...allowedIn("TERMINATED")].sort()).toEqual(["BOND_CLAIM", "CLOSE", "CONVERSE_DECISION", "DEBT", "DESIGN_BOND_RELEASE", "DESIGN_GUARANTEE_CLAIM", "FUNDING", "NOMINATED_INCREASE", "ORIGINALS", "PROJECT_WORKSPACE", "RECTIFICATION", "SECURITY_RELEASE", "TERMINATED_FINAL_ROUTE", "TERMINATION_CASE"]);
    for (const a of CONTRACT_ACTS.filter((x) => !allowedIn("TERMINATED").includes(x))) expect(actStatusFault(a, "TERMINATED")?.code, a).toBe("CONTRACT_TERMINATED");
  });
  it("the TERMINATED_FINAL certificate's acts read TERMINATED_FINAL_ROUTE; the termination's own notices read the case", () => {
    // Run 1a fix round (BD-613-114): in both phases; every other kind's phases are in certificate-act.test.ts.
    for (const p of CERTIFICATE_PHASES) {
      expect(certificateAct("TERMINATED_FINAL", p)).toBe("TERMINATED_FINAL_ROUTE");
      expect(certificateAct("TERMINATION", p)).toBe("TERMINATION_CASE");
      expect(certificateAct("TERMINATION_INTENT", p)).toBe("TERMINATION_CASE");
    }
    for (const k of CERTIFICATE_KINDS.filter((x) => !["TERMINATED_FINAL", "TERMINATION", "TERMINATION_INTENT"].includes(x))) expect(certificateAct(k, "POST_ISSUE"), k).toBe("CERTIFICATE");
  });
});

describe("R2: the originals' custody, for the record's life", () => {
  it("registering and moving an original are allowed in every state but CANCELLED, TERMINATED and CLOSED included", () => {
    for (const s of CONTRACT_STATUSES) expect(actStatusFault("ORIGINALS", s)?.code ?? null, s).toBe(s === "CANCELLED" ? "CONTRACT_CANCELLED" : null);
  });
  it("the copies and the briefing keep their row: refused once terminated or closed", () => {
    expect(actStatusFault("COPIES_AND_CUSTODY", "TERMINATED")?.code).toBe("CONTRACT_TERMINATED");
    expect(actStatusFault("COPIES_AND_CUSTODY", "CLOSED")?.code).toBe("CONTRACT_CLOSED");
  });
  it("the closed and terminated contract's words name the originals", () => {
    expect(actStatusWords({ code: "CONTRACT_CLOSED", level: "block" }).en).toMatch(/where the originals are held/);
    expect(actStatusWords({ code: "CONTRACT_TERMINATED", level: "block" }).en).toMatch(/where the originals are held/);
  });
});

describe("ADR 0046 (Sukuk core review): the funding split and impact figures, from the number on", () => {
  it("allowed in every state from NUMBER_ALLOCATED through termination; refused when cancelled or closed", () => {
    for (const s of CONTRACT_STATUSES) expect(ACT_STATUS.FUNDING[s] === "ALLOWED", s).toBe(s !== "CANCELLED" && s !== "CLOSED");
    expect(actStatusFault("FUNDING", "NUMBER_ALLOCATED")).toBeNull();
    expect(actStatusFault("FUNDING", "CANCELLED")?.code).toBe("CONTRACT_CANCELLED");
    expect(actStatusFault("FUNDING", "CLOSED")?.code).toBe("CONTRACT_CLOSED");
  });
  it("wider than the Project workspace before execution, where the requisition's source no longer moves (FS-6)", () => {
    for (const s of ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED"] as const) {
      expect(ACT_STATUS.FUNDING[s], s).toBe("ALLOWED");
      expect(ACT_STATUS.PROJECT_WORKSPACE[s], s).toBe("REFUSED");
    }
  });
});

describe("PW-22 (ADR 0042 D11): the Project workspace, from execution to the final certificate or termination", () => {
  it("allowed in EXECUTED, STAMPED, ACTIVE, practically complete, making good complete, final certificate issued and terminated; refused before execution, cancelled and closed", () => {
    const open: readonly ContractStatus[] = ["EXECUTED", "STAMPED", "ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "TERMINATED"];
    for (const s of CONTRACT_STATUSES) expect(ACT_STATUS.PROJECT_WORKSPACE[s] === "ALLOWED", s).toBe(open.includes(s));
    for (const s of ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED"] as const) expect(actStatusFault("PROJECT_WORKSPACE", s)?.code, s).toBe("NOT_EXECUTED");
    expect(actStatusFault("PROJECT_WORKSPACE", "CANCELLED")?.code).toBe("CONTRACT_CANCELLED");
    expect(actStatusFault("PROJECT_WORKSPACE", "CLOSED")?.code).toBe("CONTRACT_CLOSED");
  });
  it("wider than SUPERVISION and FINAL_ACCOUNT on purpose: open at the final certificate and on termination, where those are not", () => {
    for (const s of ["FINAL_CERTIFICATE_ISSUED", "TERMINATED"] as const) {
      expect(ACT_STATUS.PROJECT_WORKSPACE[s], s).toBe("ALLOWED");
      expect(ACT_STATUS.SUPERVISION[s], s).toBe("REFUSED");
      expect(ACT_STATUS.FINAL_ACCOUNT[s], s).toBe("REFUSED");
    }
  });
  it("the terminated contract's words name project documents, since they are still recorded; the closed contract's do not", () => {
    expect(actStatusWords({ code: "CONTRACT_TERMINATED", level: "block" }).en).toMatch(/project documents/);
    expect(actStatusWords({ code: "CONTRACT_CLOSED", level: "block" }).en).not.toMatch(/project documents/);
  });
});

describe("R5 (review S9a): the claim against the design guarantee bond survives the close", () => {
  it("allowed in every executed state, practically complete, making good complete, the final certificate, terminated and closed included", () => {
    for (const s of CONTRACT_STATUSES) expect(ACT_STATUS.DESIGN_GUARANTEE_CLAIM[s] === "ALLOWED", s).toBe(isExecuted(s));
    for (const s of ["MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED"] as const) expect(actStatusFault("DESIGN_GUARANTEE_CLAIM", s), s).toBeNull();
    expect(actStatusFault("DESIGN_GUARANTEE_CLAIM", "LEGALLY_ENDORSED")?.code).toBe("NOT_EXECUTED");
  });
  it("the performance bond's claim and ordinary rectification keep their rows", () => {
    expect(actStatusFault("BOND_CLAIM", "MAKING_GOOD_COMPLETE")?.code).toBe("NOT_IN_STATUS");
    expect(actStatusFault("RECTIFICATION", "MAKING_GOOD_COMPLETE")?.code).toBe("NOT_IN_STATUS");
    expect(actStatusFault("BOND_CLAIM", "CLOSED")?.code).toBe("CONTRACT_CLOSED");
  });
  it("the closed and terminated contract's words name it, in English and Malay", () => {
    for (const code of ["CONTRACT_CLOSED", "CONTRACT_TERMINATED"]) {
      expect(actStatusWords({ code, level: "block" }).en, code).toMatch(/a claim on the design guarantee bond/);
    }
  });
});

describe("the rest of the table, as ADR 0031 and the plan's B5 set it", () => {
  it("valuations in ACTIVE, practically complete and making good complete; none after the final certificate or termination", () => {
    for (const s of ["ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE"] as const) expect(ACT_STATUS.VALUATION[s], s).toBe("ALLOWED");
    for (const s of ["FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED"] as const) expect(ACT_STATUS.VALUATION[s], s).not.toBe("ALLOWED");
  });
  it("CLOSED: only what survives the close (the design guarantee bond's release, debts and, R2 and R5, the originals' custody and the design guarantee claim)", () => {
    expect([...allowedIn("CLOSED")].sort()).toEqual(["DEBT", "DESIGN_BOND_RELEASE", "DESIGN_GUARANTEE_CLAIM", "ORIGINALS"]);
  });
  it("a termination is refused once practically complete (CPC / termination, both orders: the CPC is refused once terminated)", () => {
    expect(actStatusFault("TERMINATION_CASE", "PRACTICALLY_COMPLETE")).toEqual({ code: "NOT_IN_STATUS", level: "block", data: { status: "PRACTICALLY_COMPLETE" } });
    expect(actStatusFault("COMPLETION", "TERMINATED")?.code).toBe("CONTRACT_TERMINATED");
  });
  it("Part B's acts are not recorded before execution; a contract past practical completion never opens an opening position or an advance", () => {
    const partB: ContractAct[] = ["EOT", "PERIOD_EXTENSION", "LOSS_EXPENSE", "LAD_WAIVER", "COMPLETION", "COMPLETION_OPENING", "DEFECTS", "RECTIFICATION", "MAKING_GOOD", "SECURITY_RELEASE", "DESIGN_BOND_RELEASE", "NOMINATED", "NOMINATED_INCREASE", "TERMINATION_CASE", "TERMINATED_FINAL_ROUTE", "CONVERSE_DECISION", "BOND_CLAIM", "DESIGN_GUARANTEE_CLAIM", "DEBT", "FINAL_ACCOUNT", "FINAL_PAYMENT", "CLOSE"];
    for (const a of partB) for (const s of ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED"] as const) expect(actStatusFault(a, s)?.code, `${a} ${s}`).toBe("NOT_EXECUTED");
    for (const s of ["PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED"] as const) {
      expect(ACT_STATUS.OPENING_POSITION[s]).not.toBe("ALLOWED");
      expect(ACT_STATUS.ADVANCE_PAYMENT[s]).not.toBe("ALLOWED");
    }
  });
  it("every refusal has words, in English and Malay, naming the status by its words, never its code", () => {
    for (const a of CONTRACT_ACTS) {
      for (const s of CONTRACT_STATUSES) {
        const f = actStatusFault(a, s);
        if (!f) continue;
        const w = actStatusWords(f);
        expect(w.en, `${a} ${s}`).toMatch(/^[A-Z]/);
        expect(w.en).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
      }
    }
  });
});

describe("executed, and the transitions after Active", () => {
  it("isExecuted covers every state after the signature; the payment rule reads the same list", () => {
    for (const s of CONTRACT_STATUSES) expect(isExecuted(s), s).toBe(["EXECUTED", "STAMPED", "ACTIVE", ...NEW].includes(s));
    expect([...EXECUTED_STATUSES].sort()).toEqual(CONTRACT_STATUSES.filter(isExecuted).sort());
  });
  it("ACTIVE → PRACTICALLY_COMPLETE → MAKING_GOOD_COMPLETE → FINAL_CERTIFICATE_ISSUED → CLOSED; PRACTICALLY_COMPLETE → FINAL_CERTIFICATE_ISSUED; ACTIVE → TERMINATED → CLOSED; nothing else", () => {
    expect(CONTRACT_TRANSITIONS.ACTIVE).toEqual(["PRACTICALLY_COMPLETE", "TERMINATED"]);
    expect(CONTRACT_TRANSITIONS.PRACTICALLY_COMPLETE).toEqual(["MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED"]);
    expect(CONTRACT_TRANSITIONS.MAKING_GOOD_COMPLETE).toEqual(["FINAL_CERTIFICATE_ISSUED"]);
    expect(CONTRACT_TRANSITIONS.FINAL_CERTIFICATE_ISSUED).toEqual(["CLOSED"]);
    expect(CONTRACT_TRANSITIONS.TERMINATED).toEqual(["CLOSED"]);
    expect(CONTRACT_TRANSITIONS.CLOSED).toEqual([]);
  });
  it("each new state is written only by its own act; none is cancelled", () => {
    expect(STATUS_WRITTEN_BY).toEqual({ ACTIVE: "POSSESSION", PRACTICALLY_COMPLETE: "PRACTICAL_COMPLETION", MAKING_GOOD_COMPLETE: "MAKING_GOOD", FINAL_CERTIFICATE_ISSUED: "FINAL_CERTIFICATE", TERMINATED: "TERMINATION", CLOSED: "CLOSE" });
    expect(contractTransition("ACTIVE", "PRACTICALLY_COMPLETE")).toBe("WRITTEN_ONLY_BY_ITS_ACT");
    expect(contractTransition("ACTIVE", "PRACTICALLY_COMPLETE", { act: "PRACTICAL_COMPLETION" })).toBeNull();
    expect(contractTransition("ACTIVE", "TERMINATED", { act: "PRACTICAL_COMPLETION" })).toBe("WRITTEN_ONLY_BY_ITS_ACT");
    expect(contractTransition("TERMINATED", "CLOSED", { act: "CLOSE" })).toBeNull();
    expect(contractTransition("CLOSED", "ACTIVE", { act: "POSSESSION" })).toBe("NOT_ALLOWED");
    for (const s of NEW) expect(contractTransition(s, "CANCELLED"), s).toBe("EXECUTED_NOT_CANCELLED");
  });
});

describe("every act, and /approvals, read the table (source)", () => {
  for (const [file, acts] of Object.entries(TODAY_ACTS)) {
    it(`${file}: the wrapper asks the table; each act names its act`, () => {
      const src = readFileSync(file, "utf8");
      // Residual round (S-1, faithful): the certificate wrapper's void reads certificateVoidAct, its other acts certificateAct.
      expect(src).toMatch(/const refused = actStatusFault\((act|phase === "VOID" \? certificateVoidAct\(kind, l\.cert\.status as CertificateStatus\) : certificateAct\(kind, phase\)), l\.contract\.status as ContractStatus\);/);
      for (const a of acts) {
        const mapped = ACT_OF[a];
        if (mapped === "BY_KIND") expect(bodyOf(src, a), a).toMatch(/\binCertificate\(/);
        else expect(bodyOf(src, a), a).toMatch(new RegExp(`\\binContract\\([^\\n]*?, "${mapped}",`));
      }
    });
  }
  it("/approvals reads the same table for a certificate's and a variation's route", () => {
    const src = readFileSync("src/app/approvals/actions.ts", "utf8");
    expect(src).toMatch(/actStatusFault\(certificateAct\(inst\.certificate\?\.kind as CertificateKind, "PRE_ISSUE"\), inst\.certificate\?\.contract\.status as ContractStatus\)/);
    expect(src).toMatch(/actStatusFault\("VARIATION", inst\.variation\?\.contract\.status as ContractStatus\)/);
  });
});

describe("the screens say what the acts would (source, screen–act agreement)", () => {
  it("the variations section, the adjustment section and the variation page ask the table for their act", () => {
    const panels = readFileSync("src/app/projects/[id]/variation-panels.tsx", "utf8");
    expect(panels).toMatch(/actStatusFault\("VARIATION", l\.contract\.status as ContractStatus\)/);
    expect(panels).toMatch(/actStatusFault\("SUM_ADJUSTMENT", l\.contract\.status as ContractStatus\)/);
    const page = readFileSync("src/app/projects/[id]/variations/[variationId]/page.tsx", "utf8");
    expect(page).toMatch(/actStatusFault\("VARIATION", l\.contract\.status as ContractStatus\)/);
  });
  it("the certificate page asks the table for its certificate's kind, as its acts do", () => {
    const page = readFileSync("src/app/projects/[id]/certificates/[certId]/page.tsx", "utf8");
    expect(page).toMatch(/actStatusFault\(certificateAct\(cert\.kind as CertificateKind, certificatePhase\(cert\.status as CertificateStatus\)\), l\.contract\.status as ContractStatus\)/);
  });
  it("the contract page's banner for a terminated or closed contract is the table's own words", () => {
    const page = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
    expect(page).toMatch(/actStatusText\(\{ code: status === "TERMINATED" \? "CONTRACT_TERMINATED" : "CONTRACT_CLOSED", level: "block" \}\)/);
  });
});

describe("the callout's title names the state in English and Malay", () => {
  it("terminated, closed, and a state that refuses by its words", () => {
    expect(statusCalloutTitle("TERMINATED")).toEqual({ en: "The contract is terminated" });
    expect(statusCalloutTitle("CLOSED")).toEqual({ en: "The contract is closed" });
    expect(statusCalloutTitle("PRACTICALLY_COMPLETE")).toEqual({ en: "The contract is practically complete" });
    for (const f of ["src/app/projects/[id]/variations/[variationId]/page.tsx", "src/app/projects/[id]/certificates/[certId]/page.tsx"]) expect(readFileSync(f, "utf8"), f).toMatch(/title=\{statusCalloutTitle\(l\.contract\.status as ContractStatus\)\.en\}/);
  });
});

// Phase 2 close-out stage D (ruling 12, ADR 0047 D4): the report is recorded once practically complete or making good complete, never before or after.
describe("PERFORMANCE_REPORT", () => {
  it("is allowed in PRACTICALLY_COMPLETE and MAKING_GOOD_COMPLETE only (the act judges the CPC and the DLP)", () => {
    expect(CONTRACT_STATUSES.filter((s) => ACT_STATUS.PERFORMANCE_REPORT[s] === "ALLOWED").sort()).toEqual(["MAKING_GOOD_COMPLETE", "PRACTICALLY_COMPLETE"]);
  });
});
