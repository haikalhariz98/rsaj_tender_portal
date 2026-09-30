import type { Tx } from "@/lib/audit/record";

import { afterIssuing, formatReference, patternFaults, serialFor, type NumberingReset, type Series } from "./series";

/**
 * Issue the next reference from a series, atomically, inside the caller's transaction.
 *
 * The series row is locked (`SELECT … FOR UPDATE`) before it is read, so two
 * transactions issuing at once queue on the lock and never read the same serial. The
 * reset and formatting rules stay in the pure `series.ts` rather than being restated
 * as SQL; the caller inserts the numbered record and its audit row in the same
 * transaction, and the record's unique reference is the backstop. A missing or broken
 * series refuses: a reference is never improvised.
 *
 * `on` is the organisation's day (midnight UTC of it), never the server's clock.
 */
export class NumberingError extends Error {
  constructor(
    readonly fault: "SERIES_MISSING" | "SERIES_INVALID",
    readonly key: string,
  ) {
    super(fault === "SERIES_MISSING" ? `No numbering series "${key}" is configured.` : `The numbering series "${key}" is not valid.`);
    this.name = "NumberingError";
  }
}

export async function issueReference(tx: Tx, organisationId: string, key: string, on: Date): Promise<string> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "NumberingSeries" WHERE "organisationId" = ${organisationId} AND key = ${key} FOR UPDATE`;
  if (locked.length === 0) throw new NumberingError("SERIES_MISSING", key);
  const row = await tx.numberingSeries.findUniqueOrThrow({ where: { id: locked[0].id } });
  const series: Series = { ...row, resetOn: row.resetOn as NumberingReset };
  if (patternFaults(series).length > 0) throw new NumberingError("SERIES_INVALID", key);

  const reference = formatReference(series, on, serialFor(series, on));
  const next = afterIssuing(series, on);
  await tx.numberingSeries.update({
    where: { id: row.id },
    data: { nextSerial: next.nextSerial, serialPeriod: next.serialPeriod },
  });
  return reference;
}
