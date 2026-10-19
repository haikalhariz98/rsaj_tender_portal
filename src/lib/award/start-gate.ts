/**
 * Whether the act of starting an award would refuse before it reads a single field of the form (AC-69). The Award tab asks this to decide whether to offer
 * "Start the award", and `createAward` asks the same function before it reads the awardee, the value or the period: neither restates the other (rule 3).
 *
 * Only what does not depend on the form is asked here. What names the awardee, the value or the period (the opening's naming faults, the evaluation's
 * recommended tenderer, a differing value or period, the value checks) stays with the act.
 */

import { evaluationGateFaults, type EvaluationGateFacts } from "@/lib/evaluation/award-gate";
import { openingGateFaults, type OpeningGateFacts } from "@/lib/opening/award-gate";
import type { PackKind } from "@/lib/method/types";
import type { WindowGate } from "@/lib/window/gate";

import { awardOpenRefusal, exerciseOpenForAward } from "./gate";
import type { Finding } from "./types";

export interface StartFacts {
  /// The organisation's time zone is set (today's date decides the act).
  timeZoneSet: boolean;
  status: string;
  packKindSnapshot: PackKind | null;
  window: WindowGate | null;
  /// The live award's reference, where there is one.
  live: string | null;
  opening: OpeningGateFacts;
  evaluation: EvaluationGateFacts;
  /// The instrument's fault for this exercise's band, as a finding; null where an instrument is set.
  instrumentFault: Finding | null;
  /// An approval matrix issue is in force.
  issueInForce: boolean;
}

export type StartRefusal =
  | { kind: "NO_ZONE" }
  | { kind: "NOT_OPEN"; message: string }
  | { kind: "LIVE_AWARD"; message: string }
  | { kind: "FINDINGS"; source: "OPENING" | "EVALUATION" | "INSTRUMENT" | "ISSUE"; findings: Finding[] };

const NAMING: ReadonlySet<string> = new Set(["AWARDEE_NOT_NAMED", "AWARDEE_NOT_CARRIED"]);

/// The first refusal in the order the act gives them, or null where nothing stops the act before the form is read.
export function awardStartRefusal(f: StartFacts): StartRefusal | null {
  if (!f.timeZoneSet) return { kind: "NO_ZONE" };
  if (!exerciseOpenForAward(f.status, f.packKindSnapshot, f.window)) return { kind: "NOT_OPEN", message: awardOpenRefusal(f.packKindSnapshot, f.status, f.window) };
  if (f.live) return { kind: "LIVE_AWARD", message: `This exercise already has a live award, ${f.live}. Cancel it first to open another.` };
  const opening = openingGateFaults(f.opening).filter((x) => !NAMING.has(x.code));
  if (opening.length) return { kind: "FINDINGS", source: "OPENING", findings: opening };
  const evaluation = evaluationGateFaults(f.evaluation);
  if (evaluation.length) return { kind: "FINDINGS", source: "EVALUATION", findings: evaluation };
  if (f.instrumentFault) return { kind: "FINDINGS", source: "INSTRUMENT", findings: [f.instrumentFault] };
  if (!f.issueInForce) return { kind: "FINDINGS", source: "ISSUE", findings: [{ code: "NO_ISSUE_IN_FORCE", level: "block" }] };
  return null;
}
