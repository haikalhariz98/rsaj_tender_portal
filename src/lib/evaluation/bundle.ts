/**
 * The committee's bundle for the appointment (FR-CTE-007, completed here; E-8): 6.4's pack manifest
 * and 6.6's late envelopes and decisions (already asked by 6.10 and 6.11), plus the issued evaluation
 * report and its Kertas Cadangan, checked and recommended. An exercise's appointment matter is not
 * tabled (6.10 `tableMatter`) nor its decision cited (6.11) without them — only for an exercise
 * published through its window with a pinned model; others are as before (CO-3). The report must still
 * stand: its bidders are 6.7's carried offers now (REPORT_STALE is the backstop for a late tender
 * admitted since). Pure.
 */

import type { Finding } from "./types";

export type BundleFault = "EVALUATION_NOT_STARTED" | "REPORT_NOT_ISSUED" | "REPORT_STALE" | "PROPOSAL_NOT_RENDERED" | "PROPOSAL_NOT_CHECKED" | "PROPOSAL_NOT_RECOMMENDED";

export interface BundleFacts {
  /// Published through 6.5 with a pinned model: the bundle is asked. False: nothing is (CO-3).
  applies: boolean;
  /// The version in force (open or issued), or null where none is.
  evaluation: { state: "OPEN" | "ISSUED"; stale: boolean } | null;
  proposal: { checked: boolean; recommended: boolean } | null;
}

export function bundleFaults(b: BundleFacts): Finding<BundleFault>[] {
  if (!b.applies) return [];
  if (!b.evaluation) return [{ code: "EVALUATION_NOT_STARTED", level: "block" }];
  if (b.evaluation.state !== "ISSUED") return [{ code: "REPORT_NOT_ISSUED", level: "block" }];
  const out: Finding<BundleFault>[] = [];
  if (b.evaluation.stale) out.push({ code: "REPORT_STALE", level: "block" });
  if (!b.proposal) out.push({ code: "PROPOSAL_NOT_RENDERED", level: "block" });
  else {
    if (!b.proposal.checked) out.push({ code: "PROPOSAL_NOT_CHECKED", level: "block" });
    if (!b.proposal.recommended) out.push({ code: "PROPOSAL_NOT_RECOMMENDED", level: "block" });
  }
  return out;
}
