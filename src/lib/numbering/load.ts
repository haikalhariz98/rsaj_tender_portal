import { db } from "@/lib/db";

import type { NumberingReset, Series } from "./series";

export type StoredSeries = Series & { id: string; provenance: string; notes: string };

export async function loadSeries(organisationCode: string): Promise<StoredSeries[]> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return [];

  const rows = await db.numberingSeries.findMany({
    where: { organisationId: organisation.id },
    orderBy: { key: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    nameEn: r.nameEn,
    pattern: r.pattern,
    padding: r.padding,
    resetOn: r.resetOn as NumberingReset,
    financialYearStartMonth: r.financialYearStartMonth,
    nextSerial: r.nextSerial,
    serialPeriod: r.serialPeriod,
    provenance: r.provenance as string,
    notes: r.notes,
  }));
}
