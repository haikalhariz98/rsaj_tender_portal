/**
 * In Delay for many contracts at once (the Projects list's In Delay view, FR-SUP-010), read in O(contracts) rows
 * (6.13 Part A residual D3): for each possessed contract only the approved programme in force today (the highest
 * approved revision decided on or before today, as `programmeInForce` reads it) with its points, and only the
 * latest progress record on or before today (one a day per contract, so the latest day is the row). Never every
 * revision or every progress record. The same rule as the contract's own reading (`inDelay`).
 *
 * Reads only, through the client passed in (never the module's own connection), so it is tested against an
 * in-memory client.
 */

import type { Tx } from "@/lib/audit/record";
import { dayPlus, dayToDate, storedDay } from "@/lib/dates";

import { inDelay, type DelayReading } from "./delay";
import { inOrder } from "@/lib/series";

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

export async function delayReadingsOf(organisationId: string, rows: readonly { id: string; dateForCompletion: Date | null }[], today: string, client: Tx): Promise<Map<string, DelayReading>> {
  const out = new Map<string, DelayReading>();
  const possessions = await client.possession.findMany({ where: { organisationId, contractId: { in: rows.map((r) => r.id) } }, select: { contractId: true, possessionOn: true } });
  const ids = possessions.map((p) => p.contractId);
  if (!ids.length) return out;
  // "On or before today" for a stored day (midnight UTC): before the next day's midnight.
  const next = dayToDate(dayPlus(today, 1));
  const [policy, inForce, latestDays] = await inOrder(
    () => client.postAwardPolicy.findUnique({ where: { organisationId }, select: { inDelayProgressPct: true } }),
    () => client.workProgramme.groupBy({ by: ["contractId"], where: { contractId: { in: ids }, decision: "APPROVED", decidedOn: { lt: next } }, _max: { revision: true } }),
    () => client.progressRecord.groupBy({ by: ["contractId"], where: { contractId: { in: ids }, day: { lt: next } }, _max: { day: true } }));
  const programmeKeys = inForce.flatMap((g) => (g._max.revision == null ? [] : [{ contractId: g.contractId, revision: g._max.revision }]));
  const progressKeys = latestDays.flatMap((g) => (g._max.day == null ? [] : [{ contractId: g.contractId, day: g._max.day }]));
  const [programmes, progress] = await inOrder(
    () => programmeKeys.length ? client.workProgramme.findMany({ where: { OR: programmeKeys }, select: { contractId: true, points: { orderBy: { day: "asc" }, select: { day: true, plannedPct: true } } } }) : [],
    () => progressKeys.length ? client.progressRecord.findMany({ where: { OR: progressKeys }, select: { contractId: true, day: true, actualPct: true } }) : []);
  const programmeOf = new Map(programmes.map((p) => [p.contractId, p.points.map((pt) => ({ day: storedDay(pt.day), plannedPct: pt.plannedPct.toString() }))]));
  const latestOf = new Map(progress.map((x) => [x.contractId, { day: storedDay(x.day), actualPct: x.actualPct.toString() }]));
  const completionOf = new Map(rows.map((r) => [r.id, r.dateForCompletion]));
  const policyPct = policy?.inDelayProgressPct?.toString() ?? null;
  for (const p of possessions) {
    out.set(
      p.contractId,
      inDelay({ today, possessed: storedDay(p.possessionOn) <= today, dateForCompletion: day(completionOf.get(p.contractId)), programme: programmeOf.get(p.contractId) ?? null, latest: latestOf.get(p.contractId) ?? null, policyPct }),
    );
  }
  return out;
}
