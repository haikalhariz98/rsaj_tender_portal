/**
 * What the organisation holds now, for the planner (`plan.ts`): its own row, its security settings, the one row of each table a pack's
 * groups write, how many rows each pack list's list holds, and how many matrices and models it has (a draft loads beside none). Reads only.
 * Called inside the loader's transaction, after the organisation's lock, so the plan is made from what the writes will meet.
 */

import type { Tx } from "@/lib/audit/record";

import { columnsOf, listKey, type PackSnapshot } from "./plan";
import type { StarterPack } from "./types";

type Reader = { findUnique(a: unknown): Promise<Record<string, unknown> | null>; count(a: unknown): Promise<number> };
/// The client's delegate for a model by its name ("SupplierListValue" -> `supplierListValue`). The planner has already refused a model the schema does not have.
export const delegateOf = <T = Reader>(tx: Tx, model: string): T => (tx as unknown as Record<string, T>)[model.charAt(0).toLowerCase() + model.slice(1)];

export async function readSnapshot(tx: Tx, organisationId: string, packs: readonly StarterPack[], facts: { now: Date; demoIsLoaded: boolean }): Promise<PackSnapshot> {
  const rows: PackSnapshot["rows"] = {
    Organisation: await tx.organisation.findUnique({ where: { id: organisationId } }),
    SecurityPolicy: await tx.securityPolicy.findUnique({ where: { organisationId } }),
  };
  const listSizes: PackSnapshot["listSizes"] = {};
  for (const p of packs) {
    for (const g of p.groups) {
      // A group's table holds one row per organisation (`organisationId` is unique on it); the planner refuses a table the schema lacks.
      if (!(g.model in rows)) rows[g.model] = delegateOf(tx, g.model) ? await delegateOf(tx, g.model).findUnique({ where: { organisationId } }) : null;
    }
    for (const l of p.lists) {
      const key = listKey(l);
      // A list with no organisation column is a list of another list's rows: empty by construction when its parents are new (the planner).
      if (!(key in listSizes)) listSizes[key] = delegateOf(tx, l.model) && (columnsOf(l.model) ?? []).includes("organisationId") ? await delegateOf(tx, l.model).count({ where: { organisationId, ...l.scope } }) : 0;
    }
  }
  // Drafts (ADR 0043 D2): the organisation's own matrices (a funder's rule set is not its limits) and its models, in force or not.
  const drafts = packs.some((p) => p.drafts)
    ? { matrices: await tx.authorityMatrix.count({ where: { organisationId, fundingRouteCode: null } }), evaluationModels: await tx.evaluationModel.count({ where: { organisationId } }) }
    : undefined;
  return { now: facts.now, rows, listSizes, demoIsLoaded: facts.demoIsLoaded, drafts };
}
