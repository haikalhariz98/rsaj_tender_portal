/**
 * The award gate as 6.7 leaves it (X-9, C-7, C-8; plan §4.9): it replaces the interim gate of 6.5
 * and 6.6. For an exercise published through 6.5 with a tender or quotation pack, an award needs:
 * the main opening finalised with its signed schedule's scan attached; each supplementary opening
 * the same; every admitted late envelope opened at a finalised supplementary opening; an unexplained
 * copy finding (C-1) holds it back; and the awardee is a party carried to evaluation
 * (`evaluationSet`), compared as parties, never by free-text registration; an award naming no party
 * never matches. 6.6's late-admission and validity checks stay where they are (`bidGate`). 6.8
 * tightens it. An exercise with no window (Phase 1) asks none of this. Pure.
 */

import { copyFindingFault } from "./estimate-copy";
import { scheduleScanFault } from "./finalise";
import type { CopyCheck, Finding } from "./types";

export interface OpeningForGate {
  kind: "MAIN" | "SUPPLEMENTARY";
  sequenceNo: number;
  finalised: boolean;
  liveScans: number;
  copyCheck: CopyCheck | null;
  explained: boolean;
  /// SUPPLEMENTARY: the envelope it opened.
  admittedEnvelopeId: string | null;
}

export type OpeningGateFault = "OPENING_NOT_STARTED" | "OPENING_NOT_FINALISED" | "SIGNED_SCHEDULE_NOT_ATTACHED" | "ESTIMATE_COPY_UNEXPLAINED" | "SUPPLEMENTARY_NOT_FINALISED" | "ADMITTED_UNOPENED" | "AWARDEE_NOT_NAMED" | "AWARDEE_NOT_CARRIED";

export interface OpeningGateFacts {
  /// Published through 6.5 with a tender or quotation pack. False: nothing is asked (Phase 1, X-9).
  applies: boolean;
  openings: readonly OpeningForGate[];
  /// Late envelopes admitted by their committee (CARRIED).
  admittedEnvelopeIds: readonly string[];
  /// Parties carried to evaluation (`evaluationParties`).
  carriedPartyIds: ReadonlySet<string>;
}

/**
 * What the openings hold an award back for. `awardeePartyId` undefined: the award is not yet named
 * (the open act asks the rest; the awardee is chosen from the carried parties on the form).
 */
export function openingGateFaults(g: OpeningGateFacts, awardeePartyId?: string | null): Finding<OpeningGateFault>[] {
  if (!g.applies) return [];
  const out: Finding<OpeningGateFault>[] = [];
  const f = (code: OpeningGateFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  const main = g.openings.find((o) => o.kind === "MAIN");
  if (!main) return [{ code: "OPENING_NOT_STARTED", level: "block" }];
  for (const o of [...g.openings].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    const which = o.kind === "MAIN" ? null : o.sequenceNo - 1;
    if (!o.finalised) {
      f(o.kind === "MAIN" ? "OPENING_NOT_FINALISED" : "SUPPLEMENTARY_NOT_FINALISED", which == null ? undefined : { supplementary: which });
      continue;
    }
    if (scheduleScanFault(o)) f("SIGNED_SCHEDULE_NOT_ATTACHED", which == null ? undefined : { supplementary: which });
    const copy = copyFindingFault(o.copyCheck, o.explained);
    if (copy) out.push({ ...copy, code: "ESTIMATE_COPY_UNEXPLAINED" });
  }
  const opened = new Set(g.openings.filter((o) => o.kind === "SUPPLEMENTARY" && o.finalised).map((o) => o.admittedEnvelopeId));
  const unopened = g.admittedEnvelopeIds.filter((id) => !opened.has(id)).length;
  if (unopened) f("ADMITTED_UNOPENED", { count: unopened });
  if (awardeePartyId !== undefined) {
    if (!awardeePartyId) f("AWARDEE_NOT_NAMED");
    else if (!g.carriedPartyIds.has(awardeePartyId)) f("AWARDEE_NOT_CARRIED");
  }
  return out;
}
