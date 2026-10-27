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
  CertificateKindSetting: Prisma.CertificateKindSettingUncheckedCreateInput;
  FundingRoute: Prisma.FundingRouteUncheckedCreateInput;
  ContractType: Prisma.ContractTypeUncheckedCreateInput;
  ContractBasis: Prisma.ContractBasisUncheckedCreateInput;
  SourcingMethod: Prisma.SourcingMethodUncheckedCreateInput;
  MethodChecklistItem: Prisma.MethodChecklistItemUncheckedCreateInput;
  TenderDocumentPart: Prisma.TenderDocumentPartUncheckedCreateInput;
  PublicationChannel: Prisma.PublicationChannelUncheckedCreateInput;
  EvaluationAspect: Prisma.EvaluationAspectUncheckedCreateInput;
  WindowPolicy: Prisma.WindowPolicyUncheckedCreateInput;
  DocumentFeeFloor: Prisma.DocumentFeeFloorUncheckedCreateInput;
  ScopePolicy: Prisma.ScopePolicyUncheckedCreateInput;
  AwardPolicy: Prisma.AwardPolicyUncheckedCreateInput;
  DistributionRecipient: Prisma.DistributionRecipientUncheckedCreateInput;
  ContractPolicy: Prisma.ContractPolicyUncheckedCreateInput;
  ControlledCopyRecipient: Prisma.ControlledCopyRecipientUncheckedCreateInput;
  PostAwardPolicy: Prisma.PostAwardPolicyUncheckedCreateInput;
  CodeFormat: Prisma.CodeFormatUncheckedCreateInput;
  RegistrationBody: Prisma.RegistrationBodyUncheckedCreateInput;
  SupplierDocumentType: Prisma.SupplierDocumentTypeUncheckedCreateInput;
  SupplierPolicy: Prisma.SupplierPolicyUncheckedCreateInput;
  StandingReason: Prisma.StandingReasonUncheckedCreateInput;
  NumberingSeries: Prisma.NumberingSeriesUncheckedCreateInput;
  NotificationRule: Prisma.NotificationRuleUncheckedCreateInput;
  FundingSource: Prisma.FundingSourceUncheckedCreateInput;
  ImpactMeasure: Prisma.ImpactMeasureUncheckedCreateInput;
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

/// `scope` narrows "the list" to some of the table's rows (one numbering series by its key), so a pack fills it beside rows another pack owns.
export const list = <M extends Model>(model: M, label: string, rows: Array<{ code: string; label?: string; values: Cols<Models[M]> } & Cited>, scope?: Cols<Models[M]>): PackList => ({ model, label, rows, ...(scope ? { scope } : {}) });
