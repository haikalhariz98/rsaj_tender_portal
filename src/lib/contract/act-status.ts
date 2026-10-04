/**
 * One act × status table for every act on a contract (6.13 Part B run 1a; ADR 0031 §4, BD-613-99). Pure.
 *
 * Every act on a contract, and /approvals for a contract's routes, asks this table under the contract's lock before its
 * own rule: CANCELLED refuses every act first; then the table says whether the act is recorded in the contract's state.
 * An act's own rule still judges the rest (execution, formation, possession, its records) in its own words; the table
 * only says which states an act belongs to. A forgotten act or state is a type error (`satisfies`, exhaustive).
 *
 * For the nine states that existed before Part B, every act's answer is the one pinned before this table
 * (act-status-pin.fixture.ts): refused when cancelled, otherwise to its own rule. The five states after Active are
 * decided here, row by row, from the plan's B5 and ADR 0031:
 * - valuations in ACTIVE, practically complete and making good complete; none after the final certificate or termination;
 * - TERMINATED allows exactly the termination case (its notices included), renomination (NOMINATED_INCREASE), the
 *   TERMINATED_FINAL route, the converse decision, bond claims, rectification and debt (BD-613-99), and, as ruled in
 *   the Run 1a fix round, the releases of a security and the design guarantee bond and the close (BD-613-113, R1);
 * - CLOSED allows only what survives the close: the design guarantee bond's release and a claim on it, debts and the
 *   originals' custody (FR-FIN-014; R2, R5);
 * - Part B's acts are not recorded before execution.
 */

import type { CertificateKind, CertificateStatus } from "@/lib/certificate/types";

import { CONTRACT_STATUS_WORDS } from "./labels";
import type { StatusWriter } from "./status";
import type { ContractStatus, Finding } from "./types";

/// The acts, by family: those built before Part B (first), then Part B's, whose acts land in runs 1b to 5.
export const CONTRACT_ACTS = [
  // 6.12: forming the contract; copies and the briefing; the originals' custody (its own family, R2); the baseline.
  "FORMATION",
  "COPIES_AND_CUSTODY",
  "ORIGINALS",
  "BASELINE",
  // 6.13 Part A: supervision; payment (valuations, retention's release, the opening position, the advance, damages);
  // variations and the adjustment of the contract sum.
  "SUPERVISION",
  "VALUATION",
  "RETENTION_RELEASE",
  "OPENING_POSITION",
  "ADVANCE_PAYMENT",
  "DAMAGES",
  "VARIATION",
  "SUM_ADJUSTMENT",
  // 6.14: a certificate's acts after its issue (despatch, acknowledgement, copies, payment recording); before its issue a
  // certificate reads its kind's family (certificateAct, BD-613-114).
  "CERTIFICATE",
  // 6.13 Part B.
  "EOT",
  "PERIOD_EXTENSION",
  "LOSS_EXPENSE",
  "LAD_WAIVER",
  "COMPLETION",
  "COMPLETION_OPENING",
  "DEFECTS",
  "RECTIFICATION",
  "MAKING_GOOD",
  "SECURITY_RELEASE",
  "DESIGN_BOND_RELEASE",
  "NOMINATED",
  "NOMINATED_INCREASE",
  "TERMINATION_CASE",
  "TERMINATED_FINAL_ROUTE",
  "CONVERSE_DECISION",
  "BOND_CLAIM",
  // R5 (review S9a): the claim against the design guarantee bond and the rectification by other means it pays for.
  "DESIGN_GUARANTEE_CLAIM",
  "DEBT",
  "FINAL_ACCOUNT",
  "FINAL_PAYMENT",
  "CLOSE",
] as const;
export type ContractAct = (typeof CONTRACT_ACTS)[number];

export type ActAnswer = "ALLOWED" | "REFUSED";

const PRE: readonly ContractStatus[] = ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED"];
const EXEC: readonly ContractStatus[] = ["EXECUTED", "STAMPED", "ACTIVE"];
const PC = "PRACTICALLY_COMPLETE" as const;
const MGC = "MAKING_GOOD_COMPLETE" as const;
const FCI = "FINAL_CERTIFICATE_ISSUED" as const;
const T = "TERMINATED" as const;
const C = "CLOSED" as const;
const ALL: readonly ContractStatus[] = [...PRE, "CANCELLED", ...EXEC, PC, MGC, FCI, T, C];

/// A row: the states the act is recorded in. CANCELLED is never among them.
const row = (allowed: readonly ContractStatus[]): Readonly<Record<ContractStatus, ActAnswer>> =>
  Object.fromEntries(ALL.map((s) => [s, s !== "CANCELLED" && allowed.includes(s) ? "ALLOWED" : "REFUSED"])) as Record<ContractStatus, ActAnswer>;

/// Before Part B every act was let through to its own rule in every state but CANCELLED (pinned); the new states decided.
const before = (...after: ContractStatus[]) => row([...PRE, ...EXEC, ...after]);
/// Part B's acts: never before execution.
const executed = (...after: ContractStatus[]) => row([...EXEC, ...after]);
const only = (...states: ContractStatus[]) => row(states);

export const ACT_STATUS = {
  FORMATION: before(PC, MGC, FCI),
  COPIES_AND_CUSTODY: before(PC, MGC, FCI),
  // R2 (BD-613-119): where an original is held stays true for the record's life, terminated and closed included.
  ORIGINALS: before(PC, MGC, FCI, T, C),
  BASELINE: before(PC, MGC),
  SUPERVISION: before(PC, MGC),
  VALUATION: before(PC, MGC),
  RETENTION_RELEASE: before(PC, MGC, FCI),
  // A contract past practical completion never opens an opening position or an advance (plan B2).
  OPENING_POSITION: before(),
  ADVANCE_PAYMENT: before(),
  DAMAGES: before(PC, MGC),
  VARIATION: before(PC, MGC),
  SUM_ADJUSTMENT: before(PC, MGC),
  CERTIFICATE: before(PC, MGC, FCI),
  EOT: executed(PC),
  // R4 (BD-613-119): a supplementary agreement extends a running term, never one already practically complete.
  PERIOD_EXTENSION: executed(),
  LOSS_EXPENSE: executed(PC, MGC),
  LAD_WAIVER: executed(PC, MGC),
  // R3 (BD-613-119): completion, defects, rectification and making good begin at Active (§7.3.3 places them after
  // possession).
  COMPLETION: only("ACTIVE", PC),
  COMPLETION_OPENING: executed(PC, MGC),
  DEFECTS: only("ACTIVE", PC),
  RECTIFICATION: only("ACTIVE", PC, T),
  MAKING_GOOD: only("ACTIVE", PC),
  // BD-613-113 (as ruled, from the review): a bond never claimed, or claimed in part, is released on a terminated
  // contract too, so it cannot block closure; run 4's own rules refuse what §8.9 holds back, naming it.
  SECURITY_RELEASE: only(PC, MGC, FCI, T),
  DESIGN_BOND_RELEASE: only(PC, MGC, FCI, T, C),
  NOMINATED: executed(PC, MGC),
  NOMINATED_INCREASE: executed(PC, MGC, T),
  // R3 (BD-613-119): only while active, or once terminated (§7.3.3; CONTRACT_TRANSITIONS has ACTIVE → TERMINATED alone).
  TERMINATION_CASE: only("ACTIVE", T),
  TERMINATED_FINAL_ROUTE: only(T),
  CONVERSE_DECISION: only(T),
  BOND_CLAIM: executed(PC, T),
  // R5 (review S9a; FR-CMP-014, 017; FR-FIN-014): a surviving obligation, in every executed state. Its own rule (with
  // its act) requires a design-and-build contract whose bond is held and not released.
  DESIGN_GUARANTEE_CLAIM: executed(PC, MGC, FCI, T, C),
  DEBT: executed(PC, MGC, FCI, T, C),
  FINAL_ACCOUNT: only(PC, MGC),
  FINAL_PAYMENT: only(FCI),
  // R1 (BD-613-113): a terminated contract is closed too (ACTIVE → TERMINATED → CLOSED); run 5 allows it once the
  // terminated account is settled and closureFaults pass.
  CLOSE: only(FCI, T),
} satisfies Record<ContractAct, Readonly<Record<ContractStatus, ActAnswer>>>;

/// The family whose act writes each stored state (STATUS_WRITTEN_BY): possession is a supervision act; the final
/// certificate's issue is the final account's (run 5 names its acts).
export const WRITER_FAMILY = {
  POSSESSION: "SUPERVISION",
  PRACTICAL_COMPLETION: "COMPLETION",
  MAKING_GOOD: "MAKING_GOOD",
  FINAL_CERTIFICATE: "FINAL_ACCOUNT",
  TERMINATION: "TERMINATION_CASE",
  CLOSE: "CLOSE",
} as const satisfies Record<StatusWriter, ContractAct>;

/// Transitions whose writer's family is not allowed in the state they leave, each with why (none: every edge is taken
/// by its family; the award's cancellation, which is not an act on the contract, is the one below).
const AWARD_CANCELS = "The award's cancellation cancels its contract before execution (6.11 BD-17): an act on the award, judged by contractCancellable, not an act on the contract, so no family of this table takes it.";
export const EDGE_EXCEPTIONS: Readonly<Record<string, string>> = {
  "NUMBER_ALLOCATED → CANCELLED": AWARD_CANCELS,
  "IN_PREPARATION → CANCELLED": AWARD_CANCELS,
  "PENDING_LEGAL_ENDORSEMENT → CANCELLED": AWARD_CANCELS,
  "RETURNED_FOR_AMENDMENT → CANCELLED": AWARD_CANCELS,
  "LEGALLY_ENDORSED → CANCELLED": AWARD_CANCELS,
};

/// States a writer's family allows with no edge to the state it writes, each with why.
export const WRITER_ROW_EXCEPTIONS: Readonly<Partial<Record<ContractAct, { states: readonly ContractStatus[]; reason: string }>>> = {
  SUPERVISION: {
    states: ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED", "EXECUTED", PC, MGC],
    reason: "Possession is one of the family's twenty acts; the others (the S.O., delegations, programme, diary, oversight, records) are recorded in these states, and possession's own rule (possessionFaults) refuses it unless the contract is stamped.",
  },
  MAKING_GOOD: {
    states: ["ACTIVE"],
    reason: "A section's making good of defects is recorded while the rest of the works run (sections are derived, ADR 0031 §5); only the last scope's certificate writes the status, from practically complete, judged by the certificate's own rule.",
  },
};

/// When a certificate's act happens: before its issue (prepare, route, sign, issue) or after it (despatch,
/// acknowledgement, copies, payment recording). BD-613-114 as confirmed with its condition.
export const CERTIFICATE_PHASES = ["PRE_ISSUE", "POST_ISSUE"] as const;
export type CertificatePhase = (typeof CERTIFICATE_PHASES)[number];

/// The phase a certificate is in: after the issue once issued; a void certificate was never issued.
export const certificatePhase = (s: CertificateStatus): CertificatePhase => (s === "ISSUED" ? "POST_ISSUE" : "PRE_ISSUE");

/// The state each kind's issue writes (ADR 0031): the CPC practically complete, the CMGD making good complete, the
/// termination terminated, the final certificate final certificate issued; no other kind writes one. The writers land
/// with runs 2, 4 and 5 (STATUS_WRITTEN_BY).
export const KIND_ISSUE_WRITES = {
  DELEGATION_LETTER: null,
  DELEGATION_NOTICE: null,
  INTERIM_PAYMENT: null,
  ADVANCE_PAYMENT: null,
  LAD_WARNING: null,
  NON_COMPLETION: null,
  VARIATION_APPLICATION: null,
  SO_INSTRUCTION: null,
  VARIATION: null,
  SUM_ADJUSTMENT: null,
  EOT: null,
  CONTRACT_PERIOD_AGREEMENT: null,
  PARTIAL_OCCUPATION: null,
  PRACTICAL_COMPLETION: PC,
  SCHEDULE_OF_DEFECTS: null,
  MAKING_GOOD_DEFECTS: MGC,
  TERMINATION_INTENT: null,
  TERMINATION: T,
  TERMINATED_FINAL: null,
  NOMINATION_LETTER: null,
  FINAL: FCI,
} as const satisfies Record<CertificateKind, ContractStatus | null>;

/**
 * The family a certificate's act reads (BD-613-114 as confirmed with its condition). Before its issue, the kind's own
 * family: the EOT certificate reads EOT, the CPC COMPLETION, the CMGD MAKING_GOOD, the final certificate FINAL_ACCOUNT
 * (until run 5 names its acts), Part A's kinds the family that raised them. After its issue, the CERTIFICATE row in
 * whatever state the issue left the contract; the termination's own certificates read their case (or the terminated
 * final payment's route), which TERMINATED allows (BD-613-120). Exhaustive: a new kind is a type error.
 */
export function certificateAct(kind: CertificateKind, phase: CertificatePhase): ContractAct {
  const pre = (family: ContractAct, after: ContractAct = "CERTIFICATE"): ContractAct => (phase === "PRE_ISSUE" ? family : after);
  switch (kind) {
    case "DELEGATION_LETTER":
    case "DELEGATION_NOTICE":
      return pre("SUPERVISION");
    case "INTERIM_PAYMENT":
      return pre("VALUATION");
    case "ADVANCE_PAYMENT":
      return pre("ADVANCE_PAYMENT");
    case "LAD_WARNING":
    case "NON_COMPLETION":
      return pre("DAMAGES");
    case "VARIATION_APPLICATION":
    case "SO_INSTRUCTION":
    case "VARIATION":
      return pre("VARIATION");
    case "SUM_ADJUSTMENT":
      return pre("SUM_ADJUSTMENT");
    case "EOT":
      return pre("EOT");
    case "CONTRACT_PERIOD_AGREEMENT":
      return pre("PERIOD_EXTENSION");
    case "PARTIAL_OCCUPATION":
    case "PRACTICAL_COMPLETION":
      return pre("COMPLETION");
    case "SCHEDULE_OF_DEFECTS":
      return pre("DEFECTS");
    case "MAKING_GOOD_DEFECTS":
      return pre("MAKING_GOOD");
    case "TERMINATION_INTENT":
    case "TERMINATION":
      return pre("TERMINATION_CASE", "TERMINATION_CASE");
    case "TERMINATED_FINAL":
      return pre("TERMINATED_FINAL_ROUTE", "TERMINATED_FINAL_ROUTE");
    case "NOMINATION_LETTER":
      return pre("NOMINATED");
    case "FINAL":
      return pre("FINAL_ACCOUNT");
  }
  const _never: never = kind;
  return _never;
}

export type ActStatusFault = "CONTRACT_CANCELLED" | "NOT_EXECUTED" | "CONTRACT_TERMINATED" | "CONTRACT_CLOSED" | "NOT_IN_STATUS";

/// The table's answer as a finding: null where the act is recorded in the state; otherwise why not.
export function actStatusFault(act: ContractAct, status: ContractStatus): Finding<ActStatusFault> | null {
  if (status === "CANCELLED") return { code: "CONTRACT_CANCELLED", level: "block" };
  if (ACT_STATUS[act][status] === "ALLOWED") return null;
  if (PRE.includes(status)) return { code: "NOT_EXECUTED", level: "block" };
  if (status === "TERMINATED") return { code: "CONTRACT_TERMINATED", level: "block" };
  if (status === "CLOSED") return { code: "CONTRACT_CLOSED", level: "block" };
  return { code: "NOT_IN_STATUS", level: "block", data: { status } };
}

type Words = { en: string; ms: string };

/// The refusal in words, English and Malay; a state named by its words, never its code.
export function actStatusWords(f: Finding): Words {
  switch (f.code as ActStatusFault) {
    case "CONTRACT_CANCELLED":
      return { en: "The contract is cancelled: it is kept as it was.", ms: "Kontrak dibatalkan: ia dikekalkan seperti sedia ada." };
    case "NOT_EXECUTED":
      return { en: "The contract is not executed yet: this is recorded once it is.", ms: "Kontrak belum dilaksanakan: ini direkodkan setelah ia dilaksanakan." };
    case "CONTRACT_TERMINATED":
      return {
        en: "The contract is terminated: only the termination's own consequences are recorded on it (its case and notices, renomination, the final payment on termination and its converse decision, bond claims, rectification, debts, the release of a security or the design guarantee bond, a claim on the design guarantee bond, where the originals are held, and its close).",
        ms: "Kontrak telah ditamatkan: hanya akibat penamatan itu sendiri direkodkan padanya (kes dan notisnya, penamaan semula, pembayaran muktamad penamatan dan keputusan sebaliknya, tuntutan bon, pembaikan, hutang, pelepasan sekuriti atau bon jaminan reka bentuk, tuntutan ke atas bon jaminan reka bentuk, tempat dokumen asal disimpan, dan penutupannya).",
      };
    case "CONTRACT_CLOSED":
      return { en: "The contract is closed: it is kept as it was, except what survives the close (the design guarantee bond's release and a claim on the design guarantee bond, debts, and where the originals are held).", ms: "Kontrak telah ditutup: ia dikekalkan seperti sedia ada, kecuali yang kekal selepas penutupan (pelepasan bon jaminan reka bentuk dan tuntutan ke atas bon jaminan reka bentuk, hutang, dan tempat dokumen asal disimpan)." };
    case "NOT_IN_STATUS": {
      const s = CONTRACT_STATUS_WORDS[f.data?.status as ContractStatus] ?? { en: "where it stands", ms: "keadaannya" };
      return { en: `Not recorded while the contract stands at “${s.en}”.`, ms: `Tidak direkodkan semasa kontrak berada pada “${s.ms}”.` };
    }
    default:
      return { en: "Not recorded where the contract stands.", ms: "Tidak direkodkan pada keadaan kontrak sekarang." };
  }
}

/// A page's callout title for a contract whose state refuses its acts: the state by its words, English and Malay.
export function statusCalloutTitle(status: ContractStatus): Words {
  const s = CONTRACT_STATUS_WORDS[status];
  return { en: `The contract is ${s.en.toLowerCase()}`, ms: `Kontrak ${s.ms.toLowerCase()}` };
}

/// The act's refusal as the acts and screens say it (English, as every screen shows; Malay beside it in actStatusWords).
export const actStatusText = (f: Finding) => actStatusWords(f).en;

/// Review S1: a panel's blocker for its family's acts, first in every blocker the panel computes: the table's refusal in
/// the acts' own words (cancelled included), or null where the family is recorded in the state.
export function actStatusBlocker(act: ContractAct, status: ContractStatus): string | null {
  const f = actStatusFault(act, status);
  return f ? actStatusText(f) : null;
}
