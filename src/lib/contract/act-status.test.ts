import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CERTIFICATE_KINDS } from "@/lib/certificate/types";
import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";

import { ACT_STATUS, actStatusFault, actStatusWords, certificateAct, CONTRACT_ACTS, statusCalloutTitle, type ContractAct } from "./act-status";
import { bodyOf, TODAY_ACTS, TODAY_STATUSES, todayAnswer } from "./act-status-pin.fixture";
import { CONTRACT_TRANSITIONS, contractTransition, isExecuted, STATUS_WRITTEN_BY } from "./status";
import { CONTRACT_STATUSES, type ContractStatus } from "./types";

/**
 * 6.13 Part B run 1a (ADR 0031 §4, BD-613-99): one act × status table governs every act on a contract and /approvals.
 * CANCELLED refuses every act first. For the nine statuses that existed before, every act's answer is the one pinned
 * in act-status-pin.fixture.ts. In TERMINATED exactly seven acts are allowed, enumerated here.
 */

/// Each act today, by the table's act it reads (the certificate page's acts read their certificate's kind).
const ACT_OF: Record<string, ContractAct | "BY_KIND"> = {
  ...Object.fromEntries(["startPreparation", "setAssemblyPart", "recordReconciliation", "addAmendment", "addCorrection", "addRate", "removeCheckLine", "completeCheck", "submitLegal", "decideLegal", "recordWcCheck", "recordContractorSignature", "recordRsajSignature", "correctContractDate", "recordStamping"].map((a) => [a, "FORMATION"])),
  ...Object.fromEntries(["recordBriefing", "answerConsultingEngineer", "issueCopy", "despatchCopy", "acknowledgeCopy", "recallCopy", "reissueCopy", "registerOriginal", "moveOriginal"].map((a) => [a, "COPIES_AND_CUSTODY"])),
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

const NEW: readonly ContractStatus[] = ["PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED"];
const allowedIn = (s: ContractStatus) => CONTRACT_ACTS.filter((a) => ACT_STATUS[a][s] === "ALLOWED");

describe("the table is exhaustive: every act, every status", () => {
  it("every act has an answer for every status of the schema", () => {
    for (const a of CONTRACT_ACTS) expect(Object.keys(ACT_STATUS[a]).sort(), a).toEqual([...CONTRACT_STATUSES].sort());
    expect(Object.keys(ACT_STATUS).sort()).toEqual([...CONTRACT_ACTS].sort());
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
        const kinds: ContractAct[] = mapped === "BY_KIND" ? [...new Set(CERTIFICATE_KINDS.filter((k) => !["TERMINATION_INTENT", "TERMINATION", "TERMINATED_FINAL"].includes(k)).map(certificateAct))] : [mapped];
        for (const act of kinds) for (const s of TODAY_STATUSES) expect(ACT_STATUS[act][s] === "ALLOWED" ? "ALLOWED" : "CANCELLED", `${a} ${act} ${s}`).toBe(todayAnswer(s));
      }
    });
  }
});

// Run 1a fix round (BD-613-113 as ruled, R1): CLOSE, SECURITY_RELEASE and DESIGN_BOND_RELEASE join BD-613-99's seven.
describe("BD-613-99: in TERMINATED exactly these acts are allowed", () => {
  it("the termination case, renomination, the TERMINATED_FINAL route, the converse decision, bond claims, rectification, debt, the releases of a security and the design guarantee bond, and the close; no other", () => {
    expect([...allowedIn("TERMINATED")].sort()).toEqual(["BOND_CLAIM", "CLOSE", "CONVERSE_DECISION", "DEBT", "DESIGN_BOND_RELEASE", "NOMINATED_INCREASE", "RECTIFICATION", "SECURITY_RELEASE", "TERMINATED_FINAL_ROUTE", "TERMINATION_CASE"]);
    for (const a of CONTRACT_ACTS.filter((x) => !allowedIn("TERMINATED").includes(x))) expect(actStatusFault(a, "TERMINATED")?.code, a).toBe("CONTRACT_TERMINATED");
  });
  it("the TERMINATED_FINAL certificate's acts read TERMINATED_FINAL_ROUTE; the termination's own notices read the case", () => {
    expect(certificateAct("TERMINATED_FINAL")).toBe("TERMINATED_FINAL_ROUTE");
    expect(certificateAct("TERMINATION")).toBe("TERMINATION_CASE");
    expect(certificateAct("TERMINATION_INTENT")).toBe("TERMINATION_CASE");
    for (const k of CERTIFICATE_KINDS.filter((x) => !["TERMINATED_FINAL", "TERMINATION", "TERMINATION_INTENT"].includes(x))) expect(certificateAct(k), k).toBe("CERTIFICATE");
  });
});

describe("the rest of the table, as ADR 0031 and the plan's B5 set it", () => {
  it("valuations in ACTIVE, practically complete and making good complete; none after the final certificate or termination", () => {
    for (const s of ["ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE"] as const) expect(ACT_STATUS.VALUATION[s], s).toBe("ALLOWED");
    for (const s of ["FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED"] as const) expect(ACT_STATUS.VALUATION[s], s).not.toBe("ALLOWED");
  });
  it("CLOSED: only what survives the close (the design guarantee bond's release and debts)", () => {
    expect([...allowedIn("CLOSED")].sort()).toEqual(["DEBT", "DESIGN_BOND_RELEASE"]);
  });
  it("a termination is refused once practically complete (CPC / termination, both orders: the CPC is refused once terminated)", () => {
    expect(actStatusFault("TERMINATION_CASE", "PRACTICALLY_COMPLETE")).toEqual({ code: "NOT_IN_STATUS", level: "block", data: { status: "PRACTICALLY_COMPLETE" } });
    expect(actStatusFault("COMPLETION", "TERMINATED")?.code).toBe("CONTRACT_TERMINATED");
  });
  it("Part B's acts are not recorded before execution; a contract past practical completion never opens an opening position or an advance", () => {
    const partB: ContractAct[] = ["EOT", "PERIOD_EXTENSION", "LOSS_EXPENSE", "LAD_WAIVER", "COMPLETION", "COMPLETION_OPENING", "DEFECTS", "RECTIFICATION", "MAKING_GOOD", "SECURITY_RELEASE", "DESIGN_BOND_RELEASE", "NOMINATED", "NOMINATED_INCREASE", "TERMINATION_CASE", "TERMINATED_FINAL_ROUTE", "CONVERSE_DECISION", "BOND_CLAIM", "DEBT", "FINAL_ACCOUNT", "FINAL_PAYMENT", "CLOSE"];
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
        expect(w.ms, `${a} ${s}`).toMatch(/^[A-Z]/);
        expect(`${w.en} ${w.ms}`).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
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
      expect(src).toMatch(/const refused = actStatusFault\((act|certificateAct\(l\.cert\.kind as CertificateKind\)), l\.contract\.status as ContractStatus\);/);
      for (const a of acts) {
        const mapped = ACT_OF[a];
        if (mapped === "BY_KIND") expect(bodyOf(src, a), a).toMatch(/\binCertificate\(/);
        else expect(bodyOf(src, a), a).toMatch(new RegExp(`\\binContract\\([^\\n]*?, "${mapped}",`));
      }
    });
  }
  it("/approvals reads the same table for a certificate's and a variation's route", () => {
    const src = readFileSync("src/app/approvals/actions.ts", "utf8");
    expect(src).toMatch(/actStatusFault\(certificateAct\(inst\.certificate\?\.kind as CertificateKind\), inst\.certificate\?\.contract\.status as ContractStatus\)/);
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
    expect(page).toMatch(/actStatusFault\(certificateAct\(cert\.kind as CertificateKind\), l\.contract\.status as ContractStatus\)/);
  });
  it("the contract page's banner for a terminated or closed contract is the table's own words", () => {
    const page = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
    expect(page).toMatch(/actStatusText\(\{ code: status === "TERMINATED" \? "CONTRACT_TERMINATED" : "CONTRACT_CLOSED", level: "block" \}\)/);
  });
});

describe("the callout's title names the state in English and Malay", () => {
  it("terminated, closed, and a state that refuses by its words", () => {
    expect(statusCalloutTitle("TERMINATED")).toEqual({ en: "The contract is terminated", ms: "Kontrak ditamatkan" });
    expect(statusCalloutTitle("CLOSED")).toEqual({ en: "The contract is closed", ms: "Kontrak ditutup" });
    expect(statusCalloutTitle("PRACTICALLY_COMPLETE")).toEqual({ en: "The contract is practically complete", ms: "Kontrak siap kerja" });
    for (const f of ["src/app/projects/[id]/variations/[variationId]/page.tsx", "src/app/projects/[id]/certificates/[certId]/page.tsx"]) expect(readFileSync(f, "utf8"), f).toMatch(/title=\{statusCalloutTitle\(l\.contract\.status as ContractStatus\)\.en\}/);
  });
});
