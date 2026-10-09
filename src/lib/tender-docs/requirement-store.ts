import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import { RANK_HELD_STATUSES } from "./eligibility";
import { composeQualifiers, needLabel, type NeedChoice, type NeedValue } from "./requirement-needs";

/**
 * The structured needs of a registration requirement, written and read (Phase 4c, 615-C1). The rules are `requirement-needs.ts`; this is the database half. A need is written with the
 * requirement in one transaction (the caller's), snapshotting the code and name as they read, and is deleted with it. It is frozen exactly as the requirement is: the only writers are the
 * add and remove actions, and both refuse once the documents have gone for approval (`eligibilityEditFault`).
 */

/// Every configured value of the organisation's registration bodies, with its body's code: what a chosen need is judged against.
export async function loadNeedValues(organisationId: string, client: Tx = db): Promise<NeedValue[]> {
  const rows = await client.registrationValue.findMany({
    where: { organisationId },
    orderBy: [{ body: { sortOrder: "asc" } }, { sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, kind: true, code: true, nameEn: true, retiredOn: true, body: { select: { code: true } } },
  });
  return rows.map((r) => ({ id: r.id, bodyCode: r.body.code, kind: r.kind, code: r.code, nameEn: r.nameEn, retiredOn: r.retiredOn ? storedDay(r.retiredOn) : null }));
}

export interface NewRequirement {
  organisationId: string;
  exerciseId: string;
  body: { code: string; labelEn: string; qualifierLabelEn: string | null };
  /// The words as typed. Empty, with needs chosen, they are composed from the needs.
  qualifiers: string;
  alternativeGroup: number;
  sortOrder: number;
  choices: readonly NeedChoice[];
  values: readonly NeedValue[];
}

/// Write a requirement and its needs. The words are the officer's own when typed; otherwise they are composed from the needs and the requirement says so, so eligibility reads them as what they are.
export async function createRequirement(tx: Tx, i: NewRequirement): Promise<{ id: string; qualifiers: string; composed: boolean; needs: { kind: NeedChoice["kind"]; label: string }[] }> {
  const needs = i.choices.map((c) => {
    const v = i.values.find((x) => x.id === c.valueId)!;
    return { kind: c.kind, label: needLabel(v), valueId: v.id, code: v.code, nameEn: v.nameEn };
  });
  const typed = i.qualifiers.trim();
  const composed = typed === "" && needs.length > 0;
  const qualifiers = composed ? composeQualifiers(needs) : typed;
  const row = await tx.exerciseRegistrationRequirement.create({
    data: {
      organisationId: i.organisationId,
      exerciseId: i.exerciseId,
      bodyCode: i.body.code,
      bodyLabelSnapshot: i.body.labelEn,
      qualifierLabelSnapshot: i.body.qualifierLabelEn,
      qualifiers,
      qualifiersFromNeeds: composed,
      alternativeGroup: i.alternativeGroup,
      sortOrder: i.sortOrder,
      ...(needs.length ? { needs: { create: needs.map((n) => ({ organisationId: i.organisationId, registrationValueId: n.valueId, kind: n.kind, codeSnapshot: n.code, labelSnapshot: n.label })) } } : {}),
    },
  });
  return { id: row.id, qualifiers, composed, needs: needs.map((n) => ({ kind: n.kind, label: n.label })) };
}

/// Delete a requirement with its needs (the needs first: their reference to it is restricted).
export async function deleteRequirement(tx: Tx, organisationId: string, requirementId: string): Promise<void> {
  await tx.exerciseRequirementNeed.deleteMany({ where: { requirementId, organisationId } });
  await tx.exerciseRegistrationRequirement.delete({ where: { id: requirementId, organisationId } });
}

/// The references of the exercises whose requirements ask for a grade of this body and whose bidders are still to be compared by its ranks (frozen, not yet opened): while any stands, no rank of the body moves.
export async function exercisesHoldingRank(tx: Tx, organisationId: string, bodyId: string): Promise<string[]> {
  const rows = await tx.exerciseRequirementNeed.findMany({
    where: { organisationId, kind: "GRADE", registrationValue: { bodyId }, requirement: { exercise: { status: { in: [...RANK_HELD_STATUSES] } } } },
    select: { requirement: { select: { exercise: { select: { reference: true } } } } },
  });
  return [...new Set(rows.map((r) => r.requirement.exercise.reference))].sort();
}
