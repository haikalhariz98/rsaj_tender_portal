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
 *   TERMINATED_FINAL route, the converse decision, bond claims, rectification and debt (BD-613-99);
 * - CLOSED allows only what survives the close: the design guarantee bond's release and debts (FR-FIN-014);
 * - Part B's acts are not recorded before execution.
 */

import type { CertificateKind } from "@/lib/certificate/types";

import { CONTRACT_STATUS_WORDS } from "./labels";
import type { ContractStatus, Finding } from "./types";

/// The acts, by family: those built before Part B (first), then Part B's, whose acts land in runs 1b to 5.
export const CONTRACT_ACTS = [
  // 6.12: forming the contract; copies, the briefing and the originals' custody; the baseline.
  "FORMATION",
  "COPIES_AND_CUSTODY",
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
  // 6.14: a certificate's own acts (routing, signing, copies, void, payment), for every kind not named below.
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
  PERIOD_EXTENSION: executed(PC),
  LOSS_EXPENSE: executed(PC, MGC),
  LAD_WAIVER: executed(PC, MGC),
  COMPLETION: executed(PC),
  COMPLETION_OPENING: executed(PC, MGC),
  DEFECTS: executed(PC),
  RECTIFICATION: executed(PC, T),
  MAKING_GOOD: executed(PC),
  SECURITY_RELEASE: only(PC, MGC, FCI),
  DESIGN_BOND_RELEASE: only(PC, MGC, FCI, C),
  NOMINATED: executed(PC, MGC),
  NOMINATED_INCREASE: executed(PC, MGC, T),
  TERMINATION_CASE: executed(T),
  TERMINATED_FINAL_ROUTE: only(T),
  CONVERSE_DECISION: only(T),
  BOND_CLAIM: executed(PC, T),
  DEBT: executed(PC, MGC, FCI, T, C),
  FINAL_ACCOUNT: only(PC, MGC),
  FINAL_PAYMENT: only(FCI),
  CLOSE: only(FCI),
} satisfies Record<ContractAct, Readonly<Record<ContractStatus, ActAnswer>>>;

/// The acts on a certificate read its kind: the terminated contract's final payment certificate its own route; the
/// termination's two notices the case; every other kind the certificate's acts.
export function certificateAct(kind: CertificateKind): ContractAct {
  if (kind === "TERMINATED_FINAL") return "TERMINATED_FINAL_ROUTE";
  if (kind === "TERMINATION" || kind === "TERMINATION_INTENT") return "TERMINATION_CASE";
  return "CERTIFICATE";
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
        en: "The contract is terminated: only the termination's own consequences are recorded on it (its case and notices, renomination, the final payment on termination and its converse decision, bond claims, rectification and debts).",
        ms: "Kontrak telah ditamatkan: hanya akibat penamatan itu sendiri direkodkan padanya (kes dan notisnya, penamaan semula, pembayaran muktamad penamatan dan keputusan sebaliknya, tuntutan bon, pembaikan dan hutang).",
      };
    case "CONTRACT_CLOSED":
      return { en: "The contract is closed: it is kept as it was, except what survives the close (the design guarantee bond's release and debts).", ms: "Kontrak telah ditutup: ia dikekalkan seperti sedia ada, kecuali yang kekal selepas penutupan (pelepasan bon jaminan reka bentuk dan hutang)." };
    case "NOT_IN_STATUS": {
      const s = CONTRACT_STATUS_WORDS[f.data?.status as ContractStatus] ?? { en: "where it stands", ms: "keadaannya" };
      return { en: `Not recorded while the contract stands at “${s.en}”.`, ms: `Tidak direkodkan semasa kontrak berada pada “${s.ms}”.` };
    }
    default:
      return { en: "Not recorded where the contract stands.", ms: "Tidak direkodkan pada keadaan kontrak sekarang." };
  }
}

/// The act's refusal as the acts and screens say it (English, as every screen shows; Malay beside it in actStatusWords).
export const actStatusText = (f: Finding) => actStatusWords(f).en;
