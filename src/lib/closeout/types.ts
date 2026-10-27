/**
 * Close-out's shared types (Phase 2 close-out stage B; plan closeout-plan.md §6.1; ADR 0047). Days are YYYY-MM-DD, an end is exclusive.
 * Stage C adds the final account's and the close's facts and actions here.
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
  today: Day;
}

export type CloseoutAction = "RAISE_CPC" | "OPEN_CERTIFICATE" | "ADD_DEFECT" | "RAISE_SCHEDULE" | "RAISE_CMGD" | "RELEASE_RETENTION" | "RETURN_SECURITY";

export interface CloseoutNext {
  state: "waiting" | "in-progress" | "done";
  next: string;
  action: CloseoutAction | null;
  /// The certificate OPEN_CERTIFICATE opens.
  certificateId?: string;
}

export type { Sen };
