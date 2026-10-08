/**
 * Document assurance (FR-DOC-014; SK001 7.2.1(c), 7.3.4(k)(iii)): before the documents go
 * for approval, a named officer confirms they are free from ambiguity and contradiction, and
 * one confirms the drawings are coordinated across disciplines — each with the day. SK001
 * assigns no actor, so the policy says whether the confirmations are required: unset blocks
 * (never a guess), no is recorded as the organisation's decision. A confirmation belongs to
 * one pack version and is not carried to the next: an amended pack is confirmed afresh.
 * Each confirmation is the signed-in officer's own (FR-DOC-014, Phase 3d): the named officer is the actor, and no one confirms for another. Which office may confirm is not
 * checked, because no policy names one. Pure.
 */

import { isDay } from "@/lib/dates";

import type { ExerciseStatus, Finding, PackPartFacts, TenderPackStatus } from "./types";

export const ASSURANCE_KINDS = ["NO_AMBIGUITY", "DRAWINGS_COORDINATED"] as const;
export type AssuranceKind = (typeof ASSURANCE_KINDS)[number];

export interface ConfirmationFacts {
  kind: AssuranceKind;
  personName: string;
  /// The organisation's day it was confirmed on.
  confirmedOn: string;
}

/// The confirmations a pack needs: always that it is free from ambiguity; the drawings' only where it binds drawings.
export function assuranceKindsFor(parts: readonly Pick<PackPartFacts, "role" | "state">[]): AssuranceKind[] {
  return parts.some((p) => p.role === "DRAWINGS" && p.state !== "OMITTED") ? ["NO_AMBIGUITY", "DRAWINGS_COORDINATED"] : ["NO_AMBIGUITY"];
}

export type AssuranceFault = "ASSURANCE_POLICY_NOT_SET" | "ASSURANCE_MISSING" | "ASSURANCE_NOT_REQUIRED";

/// What submission needs of assurance, under the policy's answer.
export function assuranceFaults(required: boolean | null, parts: readonly Pick<PackPartFacts, "role" | "state">[], confirmations: readonly ConfirmationFacts[]): Finding<AssuranceFault>[] {
  if (required == null) return [{ code: "ASSURANCE_POLICY_NOT_SET", level: "block" }];
  if (required === false) return [{ code: "ASSURANCE_NOT_REQUIRED", level: "info" }];
  // A pack binding no drawings needs no coordination of them (the Assurance card says so).
  return assuranceKindsFor(parts)
    .filter((k) => !confirmations.some((c) => c.kind === k))
    .map((k) => ({ code: "ASSURANCE_MISSING" as const, level: "block" as const, data: { kind: k } }));
}

export type ConfirmFault = "PACK_NOT_EDITABLE" | "ALREADY_CONFIRMED" | "NOT_NEEDED" | "PERSON_REQUIRED" | "PERSON_NOT_ACTIVE" | "DAY_REQUIRED" | "DAY_IN_FUTURE" | "DAY_BEFORE_PACK" | "TIME_ZONE_NOT_SET";

/**
 * Recording a confirmation: on a draft, once per kind, a kind this pack needs, by an active
 * Person, on a real day no later than the organisation's today and not before the version
 * was started.
 */
export function confirmFaults(i: {
  packStatus: TenderPackStatus;
  exerciseStatus: ExerciseStatus;
  kind: AssuranceKind;
  parts: readonly Pick<PackPartFacts, "role" | "state">[];
  existing: readonly { kind: AssuranceKind }[];
  person: { isActive: boolean } | null;
  confirmedOn: string | null;
  today: string | null;
  /// The organisation's day the pack started (`dayOf(createdAt, timeZone)`); null while no zone is set.
  packStartedOn: string | null;
}): Finding<ConfirmFault>[] {
  if (i.packStatus !== "DRAFT" || i.exerciseStatus !== "DOCUMENTS_IN_PREPARATION") return [{ code: "PACK_NOT_EDITABLE", level: "block" }];
  if (!i.today || !i.packStartedOn) return [{ code: "TIME_ZONE_NOT_SET", level: "block" }];
  const out: Finding<ConfirmFault>[] = [];
  if (!assuranceKindsFor(i.parts).includes(i.kind)) out.push({ code: "NOT_NEEDED", level: "block" });
  else if (i.existing.some((e) => e.kind === i.kind)) out.push({ code: "ALREADY_CONFIRMED", level: "block" });
  if (!i.person) out.push({ code: "PERSON_REQUIRED", level: "block" });
  else if (!i.person.isActive) out.push({ code: "PERSON_NOT_ACTIVE", level: "block" });
  if (!i.confirmedOn || !isDay(i.confirmedOn)) out.push({ code: "DAY_REQUIRED", level: "block" });
  else if (i.confirmedOn > i.today) out.push({ code: "DAY_IN_FUTURE", level: "block" });
  else if (i.confirmedOn < i.packStartedOn) out.push({ code: "DAY_BEFORE_PACK", level: "block" });
  return out;
}
