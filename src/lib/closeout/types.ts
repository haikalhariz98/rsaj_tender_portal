/**
 * Close-out's shared types (Phase 2 close-out stage B; plan closeout-plan.md §6.1; ADR 0047). Days are YYYY-MM-DD, an end is exclusive.
 * Stage C adds the final account's and the close's facts and actions (plan §6.1, §4.6, §4.7).
 */

import type { CertificateStatus } from "@/lib/certificate/types";
import type { Finding } from "@/lib/method/types";
import type { Sen } from "@/lib/money";

export type { Finding };
export type Day = string;

export const DEFECT_SOURCES = ["PRACTICAL_COMPLETION", "LIABILITY_PERIOD"] as const;
export type DefectSource = (typeof DEFECT_SOURCES)[number];
export const DEFECT_EVENT_KINDS = ["REPORTED_RECTIFIED", "MADE_GOOD", "RETURNED", "WITHDRAWN"] as const;
export type DefectEventKind = (typeof DEFECT_EVENT_KINDS)[number];
export type DefectState = "OPEN" | "REPORTED_RECTIFIED" | "MADE_GOOD" | "WITHDRAWN";

export interface DefectEventFact {
  kind: DefectEventKind;
  on: Day;
  note: string;
  /// When it was recorded (ISO): the events are read in this order.
  at: string;
}

export interface DefectFact {
  id: string;
  source: DefectSource;
  description: string;
  location: string;
  dueOn: Day;
  events: readonly DefectEventFact[];
}

/// The defects liability period as frozen on the CPC: it applies, with its days; it does not; or the baseline does not say (refused at raise).
export type Dlp = { applies: false } | { applies: true; start: Day; endExclusive: Day } | { applies: null };

export type ReleaseEvent = "MAKING_GOOD" | "FINAL_PAYMENT";
/// Where a release's event stands: not set (refused, naming the setting), not reached yet, or reached. A contract with no DLP reads
/// MAKING_GOOD as FINAL_PAYMENT (ADR 0047 D3), so `event` is the event that applies to this contract.
export type BalanceEvent = { state: "NOT_SET" } | { state: "NOT_REACHED"; event: ReleaseEvent; missing: "MAKING_GOOD" | "FINAL_INSPECTION" | "FINAL_PAYMENT" } | { state: "REACHED"; event: ReleaseEvent };

/// A certificate of the stage, as the next line reads it.
export interface StageCertificate {
  id: string;
  status: CertificateStatus;
}

/// What the close-out step reads (stage B's rows of §3.2).
export interface CloseoutFacts {
  status: string;
  /// The CPC that is not void, with its frozen DLP.
  cpc: (StageCertificate & { dlp: Dlp }) | null;
  /// The Schedule of Defects that is not void.
  schedule: (StageCertificate & { rectifyBy: Day }) | null;
  /// The CMGD that is not void.
  cmgd: StageCertificate | null;
  /// Lines neither made good nor withdrawn.
  defects: { open: number };
  /// The retention balance: whether one is held and not yet released, and its event.
  retention: { balanceDue: boolean; event: BalanceEvent };
  /// The securities held and not returned, each with whether it may be returned today.
  securities: readonly { id: string; label: string; returnable: boolean }[];
  /// Stage D (ruling 17): where the contractor performance report stands; it opens at the CMGD, or the CPC where no DLP applies.
  performance: "NONE" | "OPEN" | "ASSESSED" | "VERIFIED";
  /// Stage C: paid on delivery order and invoice (ruling 19: such a contract does not close in Phase 2).
  supply: boolean;
  /// Stage C: the FINAL certificate that is not void, whether Finance's payment of it is recorded, and (in draft) the first thing still
  /// missing before it may be sent, in words.
  final: (StageCertificate & { paid: boolean; firstMissing: string | null }) | null;
  /// Stage C: the close's checklist: the first refusal in words, or null when every check passes.
  closeBlocked: string | null;
  today: Day;
}

export type CloseoutAction =
  | "RAISE_CPC"
  | "OPEN_CERTIFICATE"
  | "ADD_DEFECT"
  | "RAISE_SCHEDULE"
  | "RAISE_CMGD"
  | "RELEASE_RETENTION"
  | "RETURN_SECURITY"
  | "SCORE_PERFORMANCE"
  | "RAISE_FINAL_ACCOUNT"
  | "OPEN_FINAL_ACCOUNT"
  | "RECORD_FINAL_PAYMENT"
  | "CLOSE_CONTRACT";

// ------------------------------------------------------------------ stage C: the final account (CO-8, §4.6, §6.2)

export type FinalBasis = "BEFORE_DEDUCTIONS" | "AS_PAID";
export type FinalBlock = "LESS" | "DEDUCT";
export const FINAL_LINE_KINDS = ["PREVIOUS_INTERIM", "RETENTION_RELEASED_MAIN", "RETENTION_RELEASED_NSC", "RETENTION_RELEASED_NS", "ADVANCE_REPAID_MAIN", "ADVANCE_REPAID_NSC", "LAD", "LAD_WAIVED", "LAD_CREDIT", "LAD_ROUNDING", "PREMIUMS_PERKESO", "WAGES", "NON_COMPLIANCE", "MAKING_GOOD_COST", "DIMINUTION", "OTHER"] as const;
export type FinalLineKind = (typeof FINAL_LINE_KINDS)[number];
/// The deductions an officer keys while the certificate is a draft (`addFinalDeduction`; the CHECK's keyed set).
export const KEYED_FINAL_KINDS = ["PREMIUMS_PERKESO", "WAGES", "NON_COMPLIANCE", "MAKING_GOOD_COST", "DIMINUTION", "OTHER", "LAD_ROUNDING"] as const;
export type KeyedFinalKind = (typeof KEYED_FINAL_KINDS)[number];

export interface CloseoutNext {
  state: "waiting" | "in-progress" | "done";
  next: string;
  action: CloseoutAction | null;
  /// The certificate OPEN_CERTIFICATE opens.
  certificateId?: string;
}

export type { Sen };
