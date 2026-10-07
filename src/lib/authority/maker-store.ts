import type { Tx } from "@/lib/audit/record";
import type { StaffActor } from "@/lib/auth/types";

/**
 * Who has made a draft of the approval matrix (ADR 0034 D15, Phase 2c). One row per person who has edited it, and the person who issues it is never one of them
 * (`makerCheckerFault`, and the database holds it too: trigger `AuthorityMatrix_issue_guard`).
 *
 * `noteMaker` is called by every edit of a draft, inside the edit's own transaction and after what it changed has been written, so a refused edit makes nobody a maker.
 * The maker is the signed-in person, never one a form names. A loader run is the system and not a person: it writes no maker, so a draft it made honestly has nobody
 * on record and must be adopted before anyone issues it.
 */

/// Records the actor as a maker of the draft, keeping the time of their first edit. Returns whether this is their first. Nothing happens for a loader run.
export async function noteMaker(tx: Tx, input: { matrixId: string; actor: Pick<StaffActor, "personId" | "system">; now?: Date }): Promise<boolean> {
  if (input.actor.system) return false;
  const existing = await tx.authorityMatrixMaker.findUnique({ where: { matrixId_personId: { matrixId: input.matrixId, personId: input.actor.personId } }, select: { id: true } });
  if (existing) return false;
  await tx.authorityMatrixMaker.create({ data: { matrixId: input.matrixId, personId: input.actor.personId, firstAt: input.now ?? new Date() } });
  return true;
}

export interface DraftMakers {
  personIds: string[];
  names: string[];
}

/// The people on record as having made the draft, in the order they first edited it.
export async function loadMakers(tx: Tx, matrixId: string): Promise<DraftMakers> {
  const rows = await tx.authorityMatrixMaker.findMany({ where: { matrixId }, orderBy: { firstAt: "asc" }, select: { personId: true, person: { select: { name: true } } } });
  return { personIds: rows.map((r) => r.personId), names: rows.map((r) => r.person.name) };
}
