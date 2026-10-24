import { randomUUID } from "node:crypto";

import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facetLabels } from "@/lib/list-facets";
import type { ListFacets } from "@/lib/list-query";

/**
 * The one audit entry every server list export writes (ST-11, NFR-AUD-001): CREATE on entity "ListExport" (no table behind it), a fresh id,
 * the list and the view as labels (never keys), the search text (the one place it is written, ST-18's exception), the row count, the file
 * name and the active facets as labels (department, funding route, method, stage, date range in words; none when unset). It carries no SULIT value. Every export route calls this, after the file is built and before it is returned.
 */
export async function recordListExport(actor: StaffActor, e: { list: string; view: string; search: string | null; rowCount: number; fileName: string; facets?: ListFacets }): Promise<void> {
  const facets = e.facets ? await facetLabels(db, actor.organisationId, e.facets) : {};
  await db.$transaction(async (tx) => {
    await writeAudit(
      tx,
      { actor: auditActorOfStaff(actor), organisationId: actor.organisationId, entity: "ListExport", entityId: randomUUID(), entityLabel: `${e.list} export, ${e.rowCount} ${e.rowCount === 1 ? "row" : "rows"}` },
      "CREATE",
      diffFields(null, { list: e.list, view: e.view, search: e.search ?? "None", rowCount: e.rowCount, fileName: e.fileName, ...facets }),
    );
  });
}
