import { randomUUID } from "node:crypto";

import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";

/**
 * The one audit entry every server list export writes (ST-11, NFR-AUD-001): CREATE on entity "ListExport" (no table behind it), a fresh id,
 * the list and the view as labels (never keys), the search text (the one place it is written, ST-18's exception), the row count and the file
 * name. It carries no SULIT value. Every export route calls this, after the file is built and before it is returned.
 */
export async function recordListExport(actor: StaffActor, e: { list: string; view: string; search: string | null; rowCount: number; fileName: string }): Promise<void> {
  await db.$transaction(async (tx) => {
    await writeAudit(
      tx,
      { actor: auditActorOfStaff(actor), organisationId: actor.organisationId, entity: "ListExport", entityId: randomUUID(), entityLabel: `${e.list} export, ${e.rowCount} ${e.rowCount === 1 ? "row" : "rows"}` },
      "CREATE",
      diffFields(null, { list: e.list, view: e.view, search: e.search ?? "None", rowCount: e.rowCount, fileName: e.fileName }),
    );
  });
}
