/**
 * The daily site diary (FR-SUP-007, 008). One entry a day from commencement (possession) for as long as the
 * works run (completion is Part B's; until then every day to yesterday is listed): today's is not missing until
 * the day is over. An entry is complete only once both the responsible officer and the contractor's agent have
 * attested it (they meet at the end of the day); a disagreement is recorded on the entry and escalated to the
 * S.O. (ASSUMED: SK005 gives no dispute path). An entry for an earlier day than it is written needs a recorded
 * exception. Pure.
 */

import { dayPlus } from "@/lib/dates";

import type { Day, Finding } from "./types";

/// The days from possession to yesterday with no entry, oldest first (capped, with the count).
export function missingDays(possessionOn: Day | null, today: Day, entered: ReadonlySet<Day>, cap = 366): { days: Day[]; count: number } {
  if (!possessionOn) return { days: [], count: 0 };
  const days: Day[] = [];
  let count = 0;
  for (let d = possessionOn; d < today; d = dayPlus(d, 1)) {
    if (entered.has(d)) continue;
    count++;
    if (days.length < cap) days.push(d);
  }
  return { days, count };
}

export type EntryFault = "NOT_POSSESSED" | "BEFORE_POSSESSION" | "FUTURE_DATE" | "ALREADY_ENTERED" | "BACKDATED_NO_EXCEPTION" | "ENTRY_REQUIRED";

export function entryFaults(i: { possessionOn: Day | null; day: Day; today: Day; exists: boolean; entry: string; backdatedReason: string }): Finding<EntryFault>[] {
  const out: Finding<EntryFault>[] = [];
  const f = (code: EntryFault, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.possessionOn) f("NOT_POSSESSED");
  else if (i.day < i.possessionOn) f("BEFORE_POSSESSION", { day: i.possessionOn });
  if (i.day > i.today) f("FUTURE_DATE", { day: i.day });
  if (i.exists) f("ALREADY_ENTERED", { day: i.day });
  if (!i.entry.trim()) f("ENTRY_REQUIRED");
  // FR-SUP-007: back-dating needs a recorded exception.
  if (i.day < i.today && !i.backdatedReason.trim()) f("BACKDATED_NO_EXCEPTION", { day: i.day });
  return out;
}

export type EntryState = "COMPLETE" | "AWAITING_OFFICER" | "AWAITING_AGENT" | "AWAITING_BOTH" | "DISPUTED";

export function entryState(e: { officerAttestedOn: Day | null; agentAttestedOn: Day | null; disagreement: string }): EntryState {
  if (e.disagreement.trim()) return "DISPUTED";
  if (e.officerAttestedOn && e.agentAttestedOn) return "COMPLETE";
  if (!e.officerAttestedOn && !e.agentAttestedOn) return "AWAITING_BOTH";
  return e.officerAttestedOn ? "AWAITING_AGENT" : "AWAITING_OFFICER";
}

export type AttestFault = "ALREADY_ATTESTED" | "AGENT_NAME_REQUIRED" | "FUTURE_DATE" | "BEFORE_DAY" | "DISAGREEMENT_REQUIRED" | "ALREADY_DISPUTED";

/// An attestation is on or after the entry's day, never in the future, once each.
export function attestFaults(i: { who: "OFFICER" | "AGENT"; already: boolean; day: Day; on: Day; today: Day; agentName: string }): Finding<AttestFault>[] {
  const out: Finding<AttestFault>[] = [];
  if (i.already) out.push({ code: "ALREADY_ATTESTED", level: "block" });
  if (i.who === "AGENT" && !i.agentName.trim()) out.push({ code: "AGENT_NAME_REQUIRED", level: "block" });
  if (i.on > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.on } });
  if (i.on < i.day) out.push({ code: "BEFORE_DAY", level: "block", data: { day: i.day } });
  return out;
}

export function disputeFaults(i: { disagreement: string; existing: string }): Finding<AttestFault>[] {
  if (i.existing.trim()) return [{ code: "ALREADY_DISPUTED", level: "block" }];
  return i.disagreement.trim() ? [] : [{ code: "DISAGREEMENT_REQUIRED", level: "block" }];
}

export type EndorseFault = "COVERS_ORDER" | "FUTURE_DATE" | "BEFORE_COVER" | "NO_ENTRIES" | "BEFORE_POSSESSION";

/// FR-SUP-008: an endorsement at a visit covers a run of days with at least one entry, ending on or before the visit.
export function endorseFaults(i: { possessionOn: Day | null; visitedOn: Day; coversFrom: Day; coversTo: Day; today: Day; entriesInCover: number }): Finding<EndorseFault>[] {
  const out: Finding<EndorseFault>[] = [];
  if (i.coversFrom > i.coversTo) out.push({ code: "COVERS_ORDER", level: "block" });
  if (i.visitedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.visitedOn } });
  if (i.visitedOn < i.coversTo) out.push({ code: "BEFORE_COVER", level: "block", data: { day: i.coversTo } });
  if (i.possessionOn && i.coversFrom < i.possessionOn) out.push({ code: "BEFORE_POSSESSION", level: "block", data: { day: i.possessionOn } });
  if (i.entriesInCover === 0) out.push({ code: "NO_ENTRIES", level: "block" });
  return out;
}
