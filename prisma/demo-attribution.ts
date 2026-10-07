import { readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "../src/generated/prisma/client";
import { ACT_SLOTS } from "../src/lib/auth/act-slots";
import { slotColumns } from "../src/lib/auth/slot-columns";

import { DEMO_PREFIX } from "./demo-sign-in";

/**
 * The attribution of the demo's own rows (Phase 2b, ADR 0034 D12). Every act the demo runs through the product's own server actions is attributed as it is
 * written, as the demo loader's own. The rows the loaders write straight into the tables (to show a history older than the demo's clock) are not, so a
 * screen would read them as "Attribution missing". This attributes them to the demo loader, on behalf of the person each names, and says so: the reason is
 * the words below, and the label is the same "demo loader" the trail names.
 *
 * Only demo rows (a `demo_` id, or a row the trail says the demo loader wrote) and only those with no attribution yet, so it adds and nothing more, and a
 * second run writes nothing. A row of the organisation's own, made before sign-in, is not touched: it reads "(before sign-in)", which is true of it.
 */

export const DEMO_ATTRIBUTION_REASON = "Demonstration data the demo loader wrote for the person it names, not an act anyone signed.";

type Reader = { findMany(args: { where: Record<string, unknown>; select: Record<string, true> }): Promise<Record<string, string | null>[]> };
const delegate = (db: PrismaClient, model: string) => (db as unknown as Record<string, Reader>)[model.charAt(0).toLowerCase() + model.slice(1)];

export async function attributeSeededRows(db: PrismaClient, organisationId: string): Promise<number> {
  const columns = slotColumns(readFileSync(path.join(__dirname, "schema.prisma"), "utf8"));
  let written = 0;
  for (const s of ACT_SLOTS) {
    const column = columns.get(`${s.entity}.${s.field}`);
    if (!column) throw new Error(`demo attribution: no column for ${s.entity}.${s.field} in the schema`);
    const rows = (await delegate(db, s.entity).findMany({ where: {}, select: { id: true, [column]: true } })).filter((r) => r[column] != null);
    if (rows.length === 0) continue;
    const have = new Set((await db.actAttribution.findMany({ where: { entity: s.entity, slot: s.field }, select: { entityId: true } })).map((a) => a.entityId));
    const byLoader = new Set((await db.auditEntry.findMany({ where: { entity: s.entity, actorKind: "SYSTEM", actorSystemLabel: "demo loader" }, select: { entityId: true } })).map((a) => a.entityId));
    const data = rows
      .filter((r) => !have.has(r.id!) && (r.id!.startsWith(DEMO_PREFIX) || byLoader.has(r.id!)))
      .map((r) => ({
        // Derived from the row, so a second run meets it and writes nothing.
        id: `demo_laaseed_${s.entity}_${s.field}_${r.id}`,
        organisationId,
        entity: s.entity,
        entityId: r.id!,
        slot: s.field,
        subjectPersonId: r[column]!,
        recordedBySystemLabel: "demo loader",
        mode: "RECORDED_ON_BEHALF" as const,
        reason: DEMO_ATTRIBUTION_REASON,
      }));
    if (data.length > 0) written += (await db.actAttribution.createMany({ data, skipDuplicates: true })).count;
  }
  return written;
}
