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
 * Only demo rows (a `demo_` id, or a row the trail says the demo loader wrote), only in the organisation named, only those with no attribution yet, and only where
 * the loader is the only one that ever acted on the record: a record that a signed-in person (or a supplier) has acted on since is a real act that must read as
 * what it is, and stamping the loader on it would hide a missing attribution for good in an append-only table (review of Phase 2b). It adds and nothing more, and a
 * second run writes nothing. A row of the organisation's own, made before sign-in, is not touched: it reads "(before sign-in)", which is true of it.
 *
 * It refuses a database that holds more than one organisation: the demo is the one organisation of its database (one organisation per database), and a second would
 * be written to as if it were the first.
 */

export const DEMO_ATTRIBUTION_REASON = "Demonstration data the demo loader wrote for the person it names, not an act anyone signed.";

type Reader = { findMany(args: { where: Record<string, unknown>; select: Record<string, true> }): Promise<Record<string, string | null>[]> };
const delegate = (db: PrismaClient, model: string) => (db as unknown as Record<string, Reader>)[model.charAt(0).toLowerCase() + model.slice(1)];

export async function attributeSeededRows(db: PrismaClient, organisationId: string): Promise<number> {
  const organisations = await db.organisation.count();
  if (organisations !== 1) throw new Error(`demo attribution: this database holds ${organisations} organisations, and the demo is the one organisation of its database. Nothing was written.`);
  const columns = slotColumns(readFileSync(path.join(__dirname, "schema.prisma"), "utf8"));
  // Every slot holds a Person, and a Person belongs to one organisation: a row is this organisation's where the person it names is.
  const people = new Set((await db.person.findMany({ where: { organisationId }, select: { id: true } })).map((p) => p.id));
  let written = 0;
  for (const s of ACT_SLOTS) {
    const column = columns.get(`${s.entity}.${s.field}`);
    if (!column) throw new Error(`demo attribution: no column for ${s.entity}.${s.field} in the schema`);
    const rows = (await delegate(db, s.entity).findMany({ where: {}, select: { id: true, [column]: true } })).filter((r) => r[column] != null && people.has(r[column]!));
    if (rows.length === 0) continue;
    const have = new Set((await db.actAttribution.findMany({ where: { organisationId, entity: s.entity, slot: s.field }, select: { entityId: true } })).map((a) => a.entityId));
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: s.entity, entityId: { in: rows.map((r) => r.id!) } }, select: { entityId: true, actorKind: true, actorSystemLabel: true } });
    const byLoader = new Set(trail.filter((a) => a.actorKind === "SYSTEM" && a.actorSystemLabel === "demo loader").map((a) => a.entityId));
    // A person or a supplier's account acted on the record at some point: it is not the loader's alone.
    const actedOn = new Set(trail.filter((a) => a.actorKind === "STAFF" || a.actorKind === "SUPPLIER").map((a) => a.entityId));
    const data = rows
      .filter((r) => !have.has(r.id!) && !actedOn.has(r.id!) && (r.id!.startsWith(DEMO_PREFIX) || byLoader.has(r.id!)))
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
