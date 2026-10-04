/**
 * Where a contract stands after Active, in §7.3.3's words (6.13 Part B run 1a; ADR 0031 §2–3, BD-613-98). Pure.
 *
 * §7.3.3 names fifteen states after Active. Five are stored statuses, each written by its own act: Practically Complete,
 * Making Good Complete, Final Certificate Issued, Terminated and Closed. Nine are derived in words from the records: In
 * Delay (the existing computed flag), Notice of Intention Issued, Partially Occupied, In Defects Liability, Defects
 * Rectification, Third-Party Rectification, Pending Final Account, Blocked — Statutory Declaration and Terminated —
 * account settled. Terminated — account settled is derived from the terminated account's final certificate issued and
 * demanded or paid, never stored. Suspended is not built: no FR in these families defines a suspension act, and a state
 * no act enters is a dead state. That is a departure from §7.3.3, on the founder's end-of-build list.
 *
 * The facts come from the records each run builds (runs 2 to 5); until a run builds its records, its fact is false or
 * not set, and no stage is claimed from it.
 */

import type { ContractStatus } from "./types";

export type Stage =
  | "IN_DELAY"
  | "SUSPENDED"
  | "NOTICE_OF_INTENTION_ISSUED"
  | "TERMINATED"
  | "TERMINATED_ACCOUNT_SETTLED"
  | "PRACTICALLY_COMPLETE"
  | "PARTIALLY_OCCUPIED"
  | "IN_DEFECTS_LIABILITY"
  | "DEFECTS_RECTIFICATION"
  | "THIRD_PARTY_RECTIFICATION"
  | "MAKING_GOOD_COMPLETE"
  | "PENDING_FINAL_ACCOUNT"
  | "BLOCKED_STATUTORY_DECLARATION"
  | "FINAL_CERTIFICATE_ISSUED"
  | "CLOSED";

export type StageKind = { kind: "STORED"; spec: string } | { kind: "DERIVED"; spec: string } | { kind: "NOT_BUILT"; spec: string };

/// Every §7.3.3 state after Active, by the specification's own name, and how the product holds it.
export const POST_ACTIVE_STAGES: Readonly<Record<Stage, StageKind>> = {
  IN_DELAY: { kind: "DERIVED", spec: "In Delay" },
  SUSPENDED: { kind: "NOT_BUILT", spec: "Suspended" },
  NOTICE_OF_INTENTION_ISSUED: { kind: "DERIVED", spec: "Notice of Intention Issued" },
  TERMINATED: { kind: "STORED", spec: "Terminated" },
  TERMINATED_ACCOUNT_SETTLED: { kind: "DERIVED", spec: "Terminated Account Settled" },
  PRACTICALLY_COMPLETE: { kind: "STORED", spec: "Practically Complete" },
  PARTIALLY_OCCUPIED: { kind: "DERIVED", spec: "Partially Occupied" },
  IN_DEFECTS_LIABILITY: { kind: "DERIVED", spec: "In Defects Liability" },
  DEFECTS_RECTIFICATION: { kind: "DERIVED", spec: "Defects Rectification" },
  THIRD_PARTY_RECTIFICATION: { kind: "DERIVED", spec: "Third-Party Rectification" },
  MAKING_GOOD_COMPLETE: { kind: "STORED", spec: "Making Good Complete" },
  PENDING_FINAL_ACCOUNT: { kind: "DERIVED", spec: "Pending Final Account" },
  BLOCKED_STATUTORY_DECLARATION: { kind: "DERIVED", spec: "Blocked — Statutory Declaration" },
  FINAL_CERTIFICATE_ISSUED: { kind: "STORED", spec: "Final Certificate Issued" },
  CLOSED: { kind: "STORED", spec: "Closed" },
};

type Words = { en: string; ms: string };
const w = (en: string, ms: string): Words => ({ en, ms });

export const STAGE_WORDS: Readonly<Record<Stage, Words>> = {
  IN_DELAY: w("In delay", "Dalam kelewatan"),
  SUSPENDED: w("Suspended (not built: no act suspends the works)", "Digantung (tidak dibina: tiada tindakan menggantung kerja)"),
  NOTICE_OF_INTENTION_ISSUED: w("Notice of intention to terminate issued", "Notis hasrat penamatan dikeluarkan"),
  TERMINATED: w("Terminated", "Ditamatkan"),
  TERMINATED_ACCOUNT_SETTLED: w("Terminated — account settled", "Ditamatkan — akaun diselesaikan"),
  PRACTICALLY_COMPLETE: w("Practically complete", "Siap kerja"),
  PARTIALLY_OCCUPIED: w("Partially occupied", "Diduduki sebahagian"),
  IN_DEFECTS_LIABILITY: w("In defects liability", "Dalam tempoh tanggungan kecacatan"),
  DEFECTS_RECTIFICATION: w("Defects rectification", "Pembaikan kecacatan"),
  THIRD_PARTY_RECTIFICATION: w("Third-party rectification", "Pembaikan oleh pihak ketiga"),
  MAKING_GOOD_COMPLETE: w("Making good of defects complete", "Siap membaiki kecacatan"),
  PENDING_FINAL_ACCOUNT: w("Pending final account", "Menunggu akaun muktamad"),
  BLOCKED_STATUTORY_DECLARATION: w("Blocked — statutory declaration", "Disekat — akuan berkanun"),
  FINAL_CERTIFICATE_ISSUED: w("Final certificate issued", "Perakuan muktamad dikeluarkan"),
  CLOSED: w("Closed", "Ditutup"),
};

/// The records the derived stages are read from. Each run fills its own; until then false (or NOT_SET), never assumed.
export interface StageFacts {
  /// The existing delay rule's flag (6.13 Part A: progress below the threshold, or the completion date lapsed).
  inDelay: boolean;
  /// A default notice issued, its remedy period running and not remedied (run 4).
  noticeOfIntention: boolean;
  /// A certificate of partial occupation issued for a part, the works not yet practically complete (run 2).
  partiallyOccupied: boolean;
  /// The defects liability period: running, ended, not applicable for the contract, or not set (run 2).
  dlp: "RUNNING" | "ENDED" | "NOT_APPLICABLE" | "NOT_SET";
  /// A schedule of defects issued and not yet made good (run 2).
  scheduleOfDefectsOpen: boolean;
  /// A third-party rectification recorded and not yet recovered (run 2).
  thirdPartyRectification: boolean;
  /// Every obligation discharged and every loss-and-expense claim valued (FR-FIN-001; runs 1b and 5).
  obligationsDischarged: boolean;
  /// Final payment asked for without the statutory declaration or the DG Labour certificate (run 5).
  declarationBlocking: boolean;
  /// The terminated account's final certificate issued and demanded, or paid (run 4).
  terminatedAccountSettled: boolean;
}

export const NO_STAGE_FACTS: StageFacts = { inDelay: false, noticeOfIntention: false, partiallyOccupied: false, dlp: "NOT_SET", scheduleOfDefectsOpen: false, thirdPartyRectification: false, obligationsDischarged: false, declarationBlocking: false, terminatedAccountSettled: false };

/// The stored status and, beside it, the derived stages that hold, in §7.3.3's order.
export function contractStage(c: { status: ContractStatus }, f: StageFacts): { status: ContractStatus; derived: Stage[] } {
  const out: Stage[] = [];
  switch (c.status) {
    case "ACTIVE":
      if (f.inDelay) out.push("IN_DELAY");
      if (f.noticeOfIntention) out.push("NOTICE_OF_INTENTION_ISSUED");
      if (f.partiallyOccupied) out.push("PARTIALLY_OCCUPIED");
      break;
    case "PRACTICALLY_COMPLETE":
      if (f.dlp === "RUNNING") out.push("IN_DEFECTS_LIABILITY");
      if (f.dlp === "ENDED" && f.scheduleOfDefectsOpen) out.push("DEFECTS_RECTIFICATION");
      if (f.dlp === "ENDED" && f.scheduleOfDefectsOpen && f.thirdPartyRectification) out.push("THIRD_PARTY_RECTIFICATION");
      // FR-CMP-001: with no defects liability period the chain is bypassed, straight to the final account.
      if (f.dlp === "NOT_APPLICABLE" && f.obligationsDischarged) out.push("PENDING_FINAL_ACCOUNT");
      if (f.dlp === "NOT_APPLICABLE" && f.obligationsDischarged && f.declarationBlocking) out.push("BLOCKED_STATUTORY_DECLARATION");
      break;
    case "MAKING_GOOD_COMPLETE":
      if (f.obligationsDischarged) out.push("PENDING_FINAL_ACCOUNT");
      if (f.obligationsDischarged && f.declarationBlocking) out.push("BLOCKED_STATUTORY_DECLARATION");
      break;
    case "TERMINATED":
      if (f.terminatedAccountSettled) out.push("TERMINATED_ACCOUNT_SETTLED");
      break;
    default:
      break;
  }
  return { status: c.status, derived: out };
}
