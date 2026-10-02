/**
 * Starting an opening (plan §4.1, FR-OPN-001, 004, FR-EST-007). The main opening is started once the
 * window is CLOSED (6.5's phase, from the closing instant), the box was locked at or after the closing
 * (6.6), no change to the window is with approval, and no main opening exists. A supplementary opening
 * is started from a carried late-tender admission (FR-CTE-008, OD-5) once the main one is finalised.
 *
 * The company estimate's lead time (FR-EST-007, 6.2 OD-3): where the method requires an estimate, the
 * lodged estimate's last version must be on or before the closing day less the lead (`leadTime`).
 * LATE is refused unless 6.2's override passes (the office configured, held by the Person, a reason),
 * and then the LATE_OVERRIDE event is written and frozen on the opening. An unset lead, closing or
 * zone blocks naming it; an unset requirement blocks naming the method. A voluntary estimate (the
 * method needs none) never blocks (62-C5) and is disclosed at finalising like any other. Pure.
 */

import { overrideFaults, type LeadState, type OverrideFault } from "@/lib/scope/estimate";
import type { WindowPhase } from "@/lib/window/phase";

import type { Finding } from "./types";

export type StartFault =
  | "CANCELLED"
  | "NOT_PUBLISHED"
  | "NO_TENDER_DOCUMENTS"
  | "TIME_ZONE_NOT_SET"
  | "NOT_CLOSED"
  | "BOX_NOT_LOCKED"
  | "CHANGE_PENDING"
  | "MAIN_EXISTS"
  | "PERSON_REQUIRED";

export function startFaults(i: {
  status: string;
  packKind: string | null;
  /// Published through 6.5 (the window has a publication instant).
  publishedThroughWindow: boolean;
  timeZone: string | null;
  phase: WindowPhase;
  /// A LOCKED box event at or after the closing (6.6 `lockedAtOrAfterClosing`).
  boxLocked: boolean;
  changePending: boolean;
  mainExists: boolean;
  personActive: boolean;
}): Finding<StartFault>[] {
  if (i.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  const out: Finding<StartFault>[] = [];
  const f = (code: StartFault) => out.push({ code, level: "block" });
  if (i.packKind !== "TENDER" && i.packKind !== "QUOTATION") f("NO_TENDER_DOCUMENTS");
  if (!i.publishedThroughWindow) f("NOT_PUBLISHED");
  if (!i.timeZone) f("TIME_ZONE_NOT_SET");
  if (i.phase !== "CLOSED") f("NOT_CLOSED");
  if (!i.boxLocked) f("BOX_NOT_LOCKED");
  if (i.changePending) f("CHANGE_PENDING");
  if (i.mainExists) f("MAIN_EXISTS");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type EstimateFault = "ESTIMATE_RULE_NOT_SET" | "ESTIMATE_NOT_LODGED" | "LEAD_NOT_SET" | "CLOSING_NOT_SET" | "TIME_ZONE_NOT_SET" | "ESTIMATE_LATE" | OverrideFault;

/// What the opening reads of the estimate's lead time, frozen on it (`estimateLead`).
export type EstimateLeadOutcome =
  /// The method needs none and none is lodged: no benchmark row.
  | "NOT_REQUIRED"
  /// The method needs none, but one was lodged (62-C5): never judged, disclosed at finalising.
  | "VOLUNTARY"
  | "READY"
  /// LATE, and 6.2's override passed: the LATE_OVERRIDE event is written.
  | "OVERRIDDEN";

/**
 * The estimate's half of starting. `lead` is 6.2's `leadTime` on the locked rows; `override` is the
 * officer's override where it is given. Returns the outcome to freeze, or the faults.
 */
export function estimateLeadFaults(i: {
  requires: boolean | null;
  /// The estimate not void on the exercise: its state. Null: none.
  estimateState: "DRAFT" | "LODGED" | "DISCLOSED" | "VOID" | null;
  lead: { state: LeadState; lastPermittedDay?: string; lastVersionDay?: string };
  override: { personId: string | null; holdsOverrideRole: boolean; reason: string } | null;
  overrideRoleCode: string | null;
}): { ok: true; outcome: EstimateLeadOutcome; warnings: Finding<EstimateFault>[] } | { ok: false; faults: Finding<EstimateFault>[] } {
  const lodged = i.estimateState === "LODGED";
  if (i.requires == null) return { ok: false, faults: [{ code: "ESTIMATE_RULE_NOT_SET", level: "block" }] };
  if (!i.requires) return { ok: true, outcome: lodged ? "VOLUNTARY" : "NOT_REQUIRED", warnings: [] };
  if (!lodged) return { ok: false, faults: [{ code: "ESTIMATE_NOT_LODGED", level: "block" }] };
  const data = { lastPermittedDay: i.lead.lastPermittedDay ?? null, lastVersionDay: i.lead.lastVersionDay ?? null };
  switch (i.lead.state) {
    case "READY":
      return { ok: true, outcome: "READY", warnings: [] };
    case "LEAD_NOT_SET":
      return { ok: false, faults: [{ code: "LEAD_NOT_SET", level: "block" }] };
    case "CLOSING_NOT_SET":
      return { ok: false, faults: [{ code: "CLOSING_NOT_SET", level: "block" }] };
    case "TIME_ZONE_NOT_SET":
      return { ok: false, faults: [{ code: "TIME_ZONE_NOT_SET", level: "block" }] };
    // A lodged estimate always has a version; defensive.
    case "NOT_PREPARED":
      return { ok: false, faults: [{ code: "ESTIMATE_NOT_LODGED", level: "block" }] };
    case "LATE": {
      if (!i.override) return { ok: false, faults: [{ code: "ESTIMATE_LATE", level: "block", data }] };
      const fs = overrideFaults(i.override, { estimateOverrideRoleCode: i.overrideRoleCode });
      if (fs.length) return { ok: false, faults: fs.map((x) => ({ ...x, data: { ...data, ...(x.data ?? {}) } })) };
      return { ok: true, outcome: "OVERRIDDEN", warnings: [{ code: "ESTIMATE_LATE", level: "warn", data }] };
    }
  }
}

export type FrozenRuleFault = "CONSEQUENCE_NOT_SET" | "CHECKLIST_NOT_JUDGED" | "READING_NOT_SET";

/**
 * Review M-4: the rules the main opening freezes at its start that would make finalising it
 * impossible. What follows from an incomplete bid is frozen with the window at publication (6.6
 * CR-2), and which parts a bidder returns with the approved documents (6.6 ruling): unset on either,
 * no verdict can be recorded and the opening could never be finalised, so it is not started. No later
 * setting reaches this exercise; its exit is cancellation (C-9). Review R-4: how the schedule counts
 * the tenderers invited is frozen at the start too, so unset it also refuses (READING_NOT_SET; it is
 * still configuration here, so setting it lets the opening start). `invitedReading` undefined: not asked.
 */
export function frozenRuleFaults(i: { completenessEliminates: boolean | null; checklist: { notJudged: readonly string[] }; invitedReading?: string | null }): Finding<FrozenRuleFault>[] {
  const out: Finding<FrozenRuleFault>[] = [];
  if (i.completenessEliminates == null) out.push({ code: "CONSEQUENCE_NOT_SET", level: "block" });
  if (i.checklist.notJudged.length) out.push({ code: "CHECKLIST_NOT_JUDGED", level: "block", data: { parts: i.checklist.notJudged.join(", ") } });
  if (i.invitedReading === null) out.push({ code: "READING_NOT_SET", level: "block" });
  return out;
}

export type SupplementaryFault = "MAIN_NOT_FINALISED" | "DECISION_NOT_LATE_TENDER" | "NOT_ADMITTED" | "ALREADY_OPENED_FOR" | "LATE_ENVELOPE_NOT_SEALED" | "CANCELLED" | "PERSON_REQUIRED";

/// FR-CTE-008 (OD-5): a supplementary opening of one envelope its committee admitted, after the main one.
export function supplementaryFaults(i: {
  status: string;
  mainFinalised: boolean;
  decision: { matterKind: string; outcome: string | null; bidEnvelopeId: string | null } | null;
  /// A supplementary opening already names this decision.
  alreadyOpened: boolean;
  envelope: { status: string; late: boolean } | null;
  personActive: boolean;
}): Finding<SupplementaryFault>[] {
  if (i.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  const out: Finding<SupplementaryFault>[] = [];
  const f = (code: SupplementaryFault) => out.push({ code, level: "block" });
  if (!i.mainFinalised) f("MAIN_NOT_FINALISED");
  if (!i.decision || i.decision.matterKind !== "LATE_TENDER" || !i.decision.bidEnvelopeId) f("DECISION_NOT_LATE_TENDER");
  else if (i.decision.outcome !== "CARRIED") f("NOT_ADMITTED");
  if (i.alreadyOpened) f("ALREADY_OPENED_FOR");
  if (i.envelope && (i.envelope.status !== "RECEIVED" || !i.envelope.late)) f("LATE_ENVELOPE_NOT_SEALED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}
