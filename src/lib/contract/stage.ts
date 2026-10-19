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

type Words = { en: string;  };
const w = (en: string): Words => ({ en });

export const STAGE_WORDS: Readonly<Record<Stage, Words>> = {
  IN_DELAY: w("In delay"),
  SUSPENDED: w("Suspended (not built: no act suspends the works)"),
  NOTICE_OF_INTENTION_ISSUED: w("Notice of intention to terminate issued"),
  TERMINATED: w("Terminated"),
  TERMINATED_ACCOUNT_SETTLED: w("Terminated — account settled"),
  PRACTICALLY_COMPLETE: w("Practically complete"),
  PARTIALLY_OCCUPIED: w("Partially occupied"),
  IN_DEFECTS_LIABILITY: w("In defects liability"),
  DEFECTS_RECTIFICATION: w("Defects rectification"),
  THIRD_PARTY_RECTIFICATION: w("Third-party rectification"),
  MAKING_GOOD_COMPLETE: w("Making good of defects complete"),
  PENDING_FINAL_ACCOUNT: w("Pending final account"),
  BLOCKED_STATUTORY_DECLARATION: w("Blocked — statutory declaration"),
  FINAL_CERTIFICATE_ISSUED: w("Final certificate issued"),
  CLOSED: w("Closed"),
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

/// A fact a stage turns on that is not set (Run 1a fix round, review S8): said so, never read as false or not applicable.
export type NotSetFact = "DLP";

export const NOT_SET_WORDS: Readonly<Record<NotSetFact, Words>> = {
  DLP: w(
    "The defects liability period is not set for this contract, so whether it is in defects liability or goes straight to its final account is not known.",
  ),
};

/**
 * The stored status and, beside it, the derived stages that hold, in §7.3.3's order, and the facts the stage turns on
 * that are not set (review S8: met, not met, and not set). An unset defects liability period at practical completion
 * claims no stage and is named, distinct from a period that does not apply (which bypasses the chain, FR-CMP-001).
 */
export function contractStage(c: { status: ContractStatus }, f: StageFacts): { status: ContractStatus; derived: Stage[]; notSet: NotSetFact[] } {
  const out: Stage[] = [];
  const notSet: NotSetFact[] = [];
  switch (c.status) {
    case "ACTIVE":
      if (f.inDelay) out.push("IN_DELAY");
      if (f.noticeOfIntention) out.push("NOTICE_OF_INTENTION_ISSUED");
      if (f.partiallyOccupied) out.push("PARTIALLY_OCCUPIED");
      break;
    case "PRACTICALLY_COMPLETE":
      if (f.dlp === "NOT_SET") notSet.push("DLP");
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
  return { status: c.status, derived: out, notSet };
}
