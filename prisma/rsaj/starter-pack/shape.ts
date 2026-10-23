/**
 * The typed helpers the RSAJ starter pack is written with: every group and every row names the requirement it meets and the clause that
 * requirement cites (ADR 0043 D1), and its columns are the generated client's, so a misspelt column does not compile. Data only.
 */

import type { Prisma } from "../../../src/generated/prisma/client";
import type { LOAD_DAY } from "../../../src/lib/starter/plan";
import type { PackGroup, PackList } from "../../../src/lib/starter/types";

interface Models {
  AuthorityRole: Prisma.AuthorityRoleUncheckedCreateInput;
  Committee: Prisma.CommitteeUncheckedCreateInput;
  NotApprovedOutcome: Prisma.NotApprovedOutcomeUncheckedCreateInput;
  RoutingSheetType: Prisma.RoutingSheetTypeUncheckedCreateInput;
  RoutingTarget: Prisma.RoutingTargetUncheckedCreateInput;
  FundingRoute: Prisma.FundingRouteUncheckedCreateInput;
  ContractType: Prisma.ContractTypeUncheckedCreateInput;
  ContractBasis: Prisma.ContractBasisUncheckedCreateInput;
  SourcingMethod: Prisma.SourcingMethodUncheckedCreateInput;
  MethodChecklistItem: Prisma.MethodChecklistItemUncheckedCreateInput;
  TenderDocumentPart: Prisma.TenderDocumentPartUncheckedCreateInput;
  PublicationChannel: Prisma.PublicationChannelUncheckedCreateInput;
  EvaluationAspect: Prisma.EvaluationAspectUncheckedCreateInput;
  WindowPolicy: Prisma.WindowPolicyUncheckedCreateInput;
  ScopePolicy: Prisma.ScopePolicyUncheckedCreateInput;
}
export type Model = keyof Models;
type Ref = { ref: string };
type Cols<T> = { [K in Exclude<keyof T, "id" | "organisationId">]?: T[K] | Ref | typeof LOAD_DAY };

/// Where an entry comes from: the requirement it meets, and the clause that requirement names.
export interface Cited {
  requirement: string;
  source: string;
}

export const ref = (model: Model, code: string): Ref => ({ ref: `${model}:${code}` });

export const group = <M extends Model>(model: M, label: string, values: Cols<Models[M]>, cited: Cited, columns: { provenance?: keyof Models[M] & string; source?: keyof Models[M] & string } = {}): PackGroup => ({
  model,
  label,
  values,
  provenanceColumn: columns.provenance,
  sourceColumn: columns.source,
  ...cited,
});

export const list = <M extends Model>(model: M, label: string, rows: Array<{ code: string; label?: string; values: Cols<Models[M]> } & Cited>): PackList => ({ model, label, rows });
