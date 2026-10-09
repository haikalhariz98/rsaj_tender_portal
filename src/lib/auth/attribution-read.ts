import type { Tx } from "@/lib/audit/record";
import { dayIn, storedDay } from "@/lib/dates";

import { slotOf } from "./act-slots";
import { attributionLabel, latestAttribution, type AttributionRead } from "./attribution";

/**
 * How a screen reads who did an act (ADR 0034 D12, Phase 2b): one batch read of the attributions of the rows it shows, then a label per act that says what is
 * known and no more. A screen never writes "recorded on behalf of, not signed" itself: that is true of some acts and false of others, and the attribution
 * knows which.
 *
 *   const index = await loadAttributions(db, organisationId, [{ entity: "ApprovalStep", ids: steps.map((s) => s.id), slot: "decidedBy" }]);
 *   index.read({ entity: "ApprovalStep", id: step.id, slot: "decidedBy" }, step.decidedBy?.name)   // { state, en, ms }
 *
 * The label is one of four states: SIGNED ("Signed by X", or the slot's own words for an act that is not a signature), ON_BEHALF ("Recorded by Y on behalf of
 * X, not signed"), LEGACY ("Recorded on behalf of X, not signed (before sign-in)": an act with no attribution on a record whose whole trail names nobody) and MISSING
 * ("Attribution missing": an act with no attribution on a record that the trail names an actor for anywhere, which is a defect and is shown as one).
 *
 * The record's trail as a whole is read, not its first row (review of Phase 2b): a step or award created before sign-in and decided after it has an old first row, and
 * the first row would have read the missing attribution of its later decision as "before sign-in". The cost of the plain rule is that an act made before sign-in on a
 * record that was edited after it reads as missing too, which is loud and not silent; an open item for the product owner (decisions log) is a backfill of those.
 */

export interface SlotQuery {
  entity: string;
  ids: readonly string[];
  /// The slot's field name in `ACT_SLOTS` ("decidedBy").
  slot: string;
}

export interface SlotRef {
  entity: string;
  id: string;
  slot: string;
}

export interface AttributionIndex {
  /// What is known of one act's attribution, in words. `subjectName` is the name of the person the slot holds (the screen already has it).
  read(ref: SlotRef, subjectName: string | null | undefined): AttributionRead;
}

const keyOf = (r: SlotRef) => `${r.entity}\u0000${r.slot}\u0000${r.id}`;

interface Row {
  entity: string;
  entityId: string;
  slot: string;
  occurrence: number;
  mode: "SIGNED" | "RECORDED_ON_BEHALF";
  recordedBySystemLabel: string | null;
  effectiveOn: Date | null;
  recordedByPerson: { name: string } | null;
  backdateAuthorisedByPerson: { name: string } | null;
  confirmation?: { confirmedAt: Date } | null;
}

/// The index from the rows read and the entities whose trail has any attributed row (an actor named: a person, or the system by its label), with no database: the
/// pure half, held by tests.
export function buildIndex(rows: readonly Row[], attributedTrail: ReadonlySet<string>, timeZone: string | null = null): AttributionIndex {
  const latest = new Map<string, Row>();
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf({ entity: r.entity, id: r.entityId, slot: r.slot });
    grouped.set(k, [...(grouped.get(k) ?? []), r]);
  }
  for (const [k, list] of grouped) latest.set(k, latestAttribution(list)!);
  return {
    read(ref, subjectName) {
      const row = latest.get(keyOf(ref)) ?? null;
      const slot = slotOf(ref.entity, ref.slot);
      return attributionLabel({
        row: row
          ? {
              mode: row.mode,
              recordedBySystemLabel: row.recordedBySystemLabel,
              effectiveOn: row.effectiveOn ? storedDay(row.effectiveOn) : null,
              backdateAuthorisedByName: row.backdateAuthorisedByPerson?.name ?? null,
              backdateConfirmedOn: row.confirmation ? dayIn(row.confirmation.confirmedAt, timeZone) : null, // the organisation's day, as the audit page shows it
            }
          : null,
        subjectName: subjectName ?? "a person no longer on record",
        recorderName: row?.recordedByPerson?.name ?? null,
        auditAttributed: attributedTrail.has(`${ref.entity}\u0000${ref.id}`),
        slot: slot ? { label: slot.label, ms: slot.ms, signatureClass: slot.signatureClass } : undefined,
      });
    },
  };
}

export async function loadAttributions(client: Pick<Tx, "actAttribution" | "auditEntry">, organisationId: string, queries: readonly SlotQuery[]): Promise<AttributionIndex> {
  const wanted = queries.filter((q) => q.ids.length > 0);
  if (wanted.length === 0) return buildIndex([], new Set());
  const rows = (await client.actAttribution.findMany({
    where: { organisationId, OR: wanted.map((q) => ({ entity: q.entity, slot: q.slot, entityId: { in: [...new Set(q.ids)] } })) },
    select: {
      entity: true,
      entityId: true,
      slot: true,
      occurrence: true,
      mode: true,
      recordedBySystemLabel: true,
      effectiveOn: true,
      recordedByPerson: { select: { name: true } },
      backdateAuthorisedByPerson: { select: { name: true } },
      confirmation: { select: { confirmedAt: true } },
    },
  })) as Row[];
  // "Confirmed on" is the organisation's day, not the UTC date (an act confirmed at 07:30 in Kuala Lumpur is the 9th there and the 8th in UTC). Read only when a confirmation is shown.
  const zoneReader = (client as Partial<Pick<Tx, "organisation">>).organisation;
  const timeZone = rows.some((r) => r.confirmation) && zoneReader ? ((await zoneReader.findUnique({ where: { id: organisationId }, select: { timeZone: true } }))?.timeZone ?? null) : null;
  // An act with no attribution reads as before sign-in when no audit row of its record names anybody, and as missing when any does.
  const have = new Set(rows.map((r) => `${r.entity}\u0000${r.slot}\u0000${r.entityId}`));
  const lacking = wanted.map((q) => ({ entity: q.entity, ids: [...new Set(q.ids)].filter((id) => !have.has(`${q.entity}\u0000${q.slot}\u0000${id}`)) })).filter((q) => q.ids.length > 0);
  const attributedTrail = new Set<string>();
  if (lacking.length > 0) {
    const trail = await client.auditEntry.findMany({
      where: { organisationId, unattributed: false, OR: lacking.map((q) => ({ entity: q.entity, entityId: { in: q.ids } })) },
      distinct: ["entity", "entityId"],
      select: { entity: true, entityId: true },
    });
    for (const t of trail) attributedTrail.add(`${t.entity}\u0000${t.entityId}`);
  }
  return buildIndex(rows, attributedTrail, timeZone);
}

/// Who decided each of these approval steps, in words, for a screen that draws a route (the route card, the step lists): the one reading of `ApprovalStep.decidedBy`.
export async function stepActed(client: Pick<Tx, "actAttribution" | "auditEntry">, organisationId: string, steps: readonly { id: string }[]) {
  const index = await loadAttributions(client, organisationId, [{ entity: "ApprovalStep", slot: "decidedBy", ids: steps.map((s) => s.id) }]);
  return (stepId: string, name: string | null | undefined): string => index.read({ entity: "ApprovalStep", id: stepId, slot: "decidedBy" }, name).en;
}

/// The three acts a drawn route says who did: each step's decision, a conflict declared on a step, and where a refused route was sent by the officer's choice.
export async function routeActed(client: Pick<Tx, "actAttribution" | "auditEntry">, organisationId: string, instances: readonly { id: string; steps: readonly { id: string }[] }[]) {
  const stepIds = instances.flatMap((i) => i.steps.map((s) => s.id));
  const index = await loadAttributions(client, organisationId, [
    { entity: "ApprovalStep", slot: "decidedBy", ids: stepIds },
    { entity: "ApprovalStep", slot: "declaredBy", ids: stepIds },
    { entity: "ApprovalInstance", slot: "rejectionChosenBy", ids: instances.map((i) => i.id) },
  ]);
  return {
    decided: (stepId: string, name: string | null | undefined): string => index.read({ entity: "ApprovalStep", id: stepId, slot: "decidedBy" }, name).en,
    declared: (stepId: string, name: string | null | undefined): string => index.read({ entity: "ApprovalStep", id: stepId, slot: "declaredBy" }, name).en,
    chosen: (instanceId: string, name: string | null | undefined): string => index.read({ entity: "ApprovalInstance", id: instanceId, slot: "rejectionChosenBy" }, name).en,
  };
}
