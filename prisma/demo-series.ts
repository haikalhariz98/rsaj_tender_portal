import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { DEMO_ACTOR } from "./demo-actor";

const ORG_CODE = process.env.ORGANISATION_CODE ?? "ORG";

/// The key of each demo series, so a demo id still finds its series where `putSeries` put the demo's values on a row the starter pack made.
const KEY_OF: Record<string, string> = {
  demo_n1: "requisition", demo_n2: "contract", demo_n3: "certificate", demo_n4: "meeting", demo_n5: "exercise", demo_n6: "direct_appointment",
  demo_n7: "award", demo_n8: "variation", demo_n20: "evaluation_report", demo_n21: "supplier", demo_n22: "portal_application", demo_tsn1: "contract_matter",
};

type SeriesDb = Pick<PrismaClient, "numberingSeries">;

async function seriesOf(db: SeriesDb, id: string) {
  const own = await db.numberingSeries.findUnique({ where: { id } });
  if (own || !KEY_OF[id]) return own;
  return db.numberingSeries.findFirst({ where: { key: KEY_OF[id], organisation: { code: ORG_CODE } } });
}

/// Moves a numbering series on to `next`, never back. The demo is loaded in parts, and a later
/// part setting a series back below serials an earlier part already took made the next number
/// issued in the portal collide with an existing reference (founder, 2026-10-05: a new
/// requisition could not be saved, DEMO/REQ/0043/2026 being taken).
export async function raiseSeries(db: SeriesDb, id: string, next: number): Promise<void> {
  const s = await seriesOf(db, id);
  if (!s) throw new Error(`demo: no numbering series ${id}`);
  if (s.nextSerial < next) await db.numberingSeries.update({ where: { id: s.id }, data: { nextSerial: next } });
}

/// Creates a demo series. Where the organisation already numbers under the key (the generic starter pack, loaded by `npm run setup`), the
/// unique (organisationId, key) stands: the demo's values go on that row instead, never moving its serial back, audited as the demo loader. True when it created the row.
export async function putSeries(db: Pick<PrismaClient, "numberingSeries" | "auditEntry">, row: Prisma.NumberingSeriesUncheckedCreateInput & { id: string }): Promise<boolean> {
  const held = await db.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: row.organisationId, key: row.key } } });
  if (!held) {
    await db.numberingSeries.create({ data: row });
    return true;
  }
  const values = { nameEn: row.nameEn, pattern: row.pattern, padding: row.padding ?? 3, resetOn: row.resetOn ?? "CALENDAR_YEAR", nextSerial: Math.max(held.nextSerial, row.nextSerial ?? 1), serialPeriod: row.serialPeriod ?? "", provenance: row.provenance ?? "ASSUMED", notes: row.notes ?? "" };
  const changes = Object.entries(values).filter(([f, v]) => held[f as keyof typeof values] !== v).map(([field, after]) => ({ field, before: held[field as keyof typeof values], after }));
  if (changes.length === 0) return false;
  await db.numberingSeries.update({ where: { id: held.id }, data: values });
  await db.auditEntry.create({
    data: { id: `${row.id}au`, organisationId: row.organisationId, entity: "NumberingSeries", entityId: held.id, entityLabel: `Numbering · ${row.nameEn}`, action: "UPDATE", at: new Date(), changes, reason: "Demonstration numbering (invented), over the starter pack's.", ...DEMO_ACTOR } as never,
  });
  return false;
}
