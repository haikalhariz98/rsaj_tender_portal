import type { Tx } from "@/lib/audit/record";
import type { StaffActor } from "@/lib/auth/types";

/**
 * Who has made a draft that is issued in turn (ADR 0034 D15, Phase 5a): an evaluation model's, a rate schedule's and (close-out stage D) a performance form's, as `noteMaker` does for the approval matrix.
 * One row per person per draft. The person who issues it is never one of them (`draftIssueFault`, and the database holds it too: trigger `guard_draft_issue`).
 *
 * `noteDraftMaker` is called by every edit of a draft, inside the edit's own transaction and after it has been accepted, so a refused edit makes nobody a maker.
 * The maker is the signed-in person, never one a form names. A loader run is the system and not a person: it writes no maker.
 */

export type DraftEntity = "EvaluationModel" | "RateSchedule" | "PerformanceForm";

/// Records the actor as a maker of the draft, keeping the time of their first edit. Returns whether this is their first. Nothing happens for a loader run.
export async function noteDraftMaker(tx: Tx, input: { organisationId: string; entity: DraftEntity; entityId: string; actor: Pick<StaffActor, "personId" | "system">; now?: Date }): Promise<boolean> {
  if (input.actor.system) return false;
  const existing = await tx.configurationDraftMaker.findUnique({ where: { entity_entityId_personId: { entity: input.entity, entityId: input.entityId, personId: input.actor.personId } }, select: { id: true } });
  if (existing) return false;
  await tx.configurationDraftMaker.create({ data: { organisationId: input.organisationId, entity: input.entity, entityId: input.entityId, personId: input.actor.personId, firstAt: input.now ?? new Date() } });
  return true;
}

export interface DraftMakers {
  personIds: string[];
  names: string[];
}

/// The people on record as having made the draft, in the order they first edited it.
export async function loadDraftMakers(tx: Tx, entity: DraftEntity, entityId: string): Promise<DraftMakers> {
  const rows = await tx.configurationDraftMaker.findMany({ where: { entity, entityId }, orderBy: { firstAt: "asc" }, select: { personId: true, person: { select: { name: true } } } });
  return { personIds: rows.map((r) => r.personId), names: rows.map((r) => r.person.name) };
}
