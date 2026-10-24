import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import { billItemChoices } from "./bill-item-choices";

/// The items of the bill the exercise's approved, frozen pack pinned, for a form to pick from (see `billItemChoices`). Scoped to the organisation.
export async function billItemOptions(organisationId: string, exerciseId: string, client: Tx = db) {
  const pack = await client.tenderPack.findFirst({
    where: { organisationId, exerciseId, status: "APPROVED", frozenAt: { not: null } },
    orderBy: { versionNo: "desc" },
    select: { bqVersion: { select: { sections: { orderBy: { sortOrder: "asc" }, select: { number: true, items: { orderBy: { sortOrder: "asc" }, select: { itemRef: true, description: true } } } } } } },
  });
  return billItemChoices(pack?.bqVersion?.sections ?? []);
}
