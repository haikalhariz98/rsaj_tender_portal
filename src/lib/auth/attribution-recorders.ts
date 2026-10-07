import type { Tx } from "@/lib/audit/record";

import { latestAttribution } from "./attribution";
import type { SlotQuery, SlotRef } from "./attribution-read";

/**
 * Who recorded an earlier act for someone else (ADR 0034 D12, Phase 2b review). A slot holds the person an act is attributed to, so the separation-of-duties
 * checks that read slots alone (who raised it, who endorsed it, who decided another step, who authorised the opening) see the person named and never the
 * officer who keyed it from paper. The officer who raised a requisition "for" a colleague, or recorded a step "for" a colleague, is as much its author as the
 * colleague: the checks run against both, and this is the one reader of the second.
 *
 * Only an act recorded on someone's behalf has a recorder who is not its subject, and only a person's recording counts (a system label is the loader's, a
 * supplier's account is not an officer). The latest occurrence of a slot is the one in force.
 */

export interface RecorderRow {
  entity: string;
  entityId: string;
  slot: string;
  occurrence: number;
  mode: "SIGNED" | "RECORDED_ON_BEHALF";
  recordedByPersonId: string | null;
}

export const recorderKey = (r: SlotRef): string => `${r.entity}\u0000${r.slot}\u0000${r.id}`;

/// The recorder of each act in force, from the rows read: pure, held by tests.
export function recordersFrom(rows: readonly RecorderRow[]): ReadonlyMap<string, string> {
  const grouped = new Map<string, RecorderRow[]>();
  for (const r of rows) {
    const k = recorderKey({ entity: r.entity, id: r.entityId, slot: r.slot });
    grouped.set(k, [...(grouped.get(k) ?? []), r]);
  }
  const out = new Map<string, string>();
  for (const [k, list] of grouped) {
    const now = latestAttribution(list);
    if (now && now.mode === "RECORDED_ON_BEHALF" && now.recordedByPersonId) out.set(k, now.recordedByPersonId);
  }
  return out;
}

export async function loadRecorders(client: Pick<Tx, "actAttribution">, organisationId: string, queries: readonly SlotQuery[]): Promise<ReadonlyMap<string, string>> {
  const wanted = queries.filter((q) => q.ids.length > 0);
  if (wanted.length === 0) return new Map();
  const rows = (await client.actAttribution.findMany({
    where: { organisationId, OR: wanted.map((q) => ({ entity: q.entity, slot: q.slot, entityId: { in: [...new Set(q.ids)] } })) },
    select: { entity: true, entityId: true, slot: true, occurrence: true, mode: true, recordedByPersonId: true },
  })) as RecorderRow[];
  return recordersFrom(rows);
}

/// The people who recorded these acts for someone else, without repeating one.
export function recordersOf(recorders: ReadonlyMap<string, string>, entity: string, slot: string, ids: readonly string[]): string[] {
  return [...new Set(ids.flatMap((id) => recorders.get(recorderKey({ entity, id, slot })) ?? []))];
}
