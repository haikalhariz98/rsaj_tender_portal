/**
 * Starting the evaluation (plan §4.2; FR-EVL-001, 006, 007, 019; E-1, E-5). The exercise is Opened: its
 * main opening finalised with the signed schedule's scan attached, every finalised supplementary
 * opening likewise, no copy finding of the estimate left unexplained (6.7 C-1), and no supplementary
 * opening under way. It was published with a pinned model (E-1: an exercise published before
 * evaluation models existed is never pinned later; its exit is to cancel it and publish a replacement,
 * FR-ADV-016). The places a score is shown and judged at are set (they are frozen now, E-5); a
 * quotation's ceiling is on the exercise (FR-EVL-019). The bidders are 6.7's carried offers
 * (`evaluationSet`), none else; the team is appointed with it (`teamFaults`). Pure.
 */

import { copyFindingFault } from "@/lib/opening/estimate-copy";
import { scheduleScanFault } from "@/lib/opening/finalise";
import type { OpeningForGate } from "@/lib/opening/award-gate";

import type { Finding } from "./types";

export type StartFault =
  | "CANCELLED"
  | "NOT_OPENED"
  | "NOT_THROUGH_WINDOW"
  | "MODEL_NOT_PINNED"
  | "OPENING_NOT_FINALISED"
  | "SIGNED_SCHEDULE_NOT_ATTACHED"
  | "ESTIMATE_COPY_UNEXPLAINED"
  | "SUPPLEMENTARY_IN_PROGRESS"
  | "DECIMALS_NOT_SET"
  | "BOUNDARY_NOT_RECORDED"
  | "NOTHING_CARRIED"
  | "ALREADY_STARTED"
  | "TIME_ZONE_NOT_SET"
  | "PERSON_REQUIRED";

export function startFaults(i: {
  status: string;
  /// Published through 6.5 with a tender or quotation pack.
  throughWindow: boolean;
  /// The exercise's pinned snapshot reads as a model.
  pinned: boolean;
  openings: readonly OpeningForGate[];
  decimals: number | null;
  /// A quotation whose ceiling was not recorded (FR-EVL-019).
  boundaryMissing: boolean;
  carried: number;
  started: boolean;
  timeZone: string | null;
  personActive: boolean;
}): Finding<StartFault>[] {
  if (i.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (i.started) return [{ code: "ALREADY_STARTED", level: "block" }];
  const out: Finding<StartFault>[] = [];
  const f = (code: StartFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.throughWindow) f("NOT_THROUGH_WINDOW");
  if (i.status !== "OPENED") f("NOT_OPENED");
  if (i.throughWindow && !i.pinned) f("MODEL_NOT_PINNED");
  const main = i.openings.find((o) => o.kind === "MAIN");
  if (!main || !main.finalised) f("OPENING_NOT_FINALISED");
  for (const o of [...i.openings].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    const which = o.kind === "MAIN" ? null : o.sequenceNo - 1;
    if (!o.finalised) {
      if (o.kind === "SUPPLEMENTARY") f("SUPPLEMENTARY_IN_PROGRESS", { supplementary: which });
      continue;
    }
    if (scheduleScanFault(o)) f("SIGNED_SCHEDULE_NOT_ATTACHED", which == null ? undefined : { supplementary: which });
    if (copyFindingFault(o.copyCheck, o.explained)) f("ESTIMATE_COPY_UNEXPLAINED");
  }
  if (i.decimals == null) f("DECIMALS_NOT_SET");
  if (i.boundaryMissing) f("BOUNDARY_NOT_RECORDED");
  if (i.carried === 0 && main?.finalised) f("NOTHING_CARRIED");
  if (!i.timeZone) f("TIME_ZONE_NOT_SET");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

/// What a version freezes when it starts (E-5, the 6.6/6.7 freeze pattern): read from it, never live configuration.
export interface EvaluationPolicySnapshot {
  scoreDecimals: number | null;
  scoreDecimalsProvenance: string | null;
  /// FR-EVL-020 (Phase 3b): whether the version anonymises its technical scoring stage, as the organisation had decided when it started. Null: not decided (names are shown).
  anonymisedScoring: boolean | null;
}

export function policyFromSnapshot(json: unknown): EvaluationPolicySnapshot {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  return { scoreDecimals: typeof o.scoreDecimals === "number" ? o.scoreDecimals : null, scoreDecimalsProvenance: typeof o.scoreDecimalsProvenance === "string" ? o.scoreDecimalsProvenance : null, anonymisedScoring: typeof o.anonymisedScoring === "boolean" ? o.anonymisedScoring : null };
}
