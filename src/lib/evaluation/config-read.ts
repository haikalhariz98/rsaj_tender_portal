/**
 * Configuration › Evaluation models, read for the screens and the configuration actions (plan §4
 * item 10). The only reader of the model's rows beside `config.ts` (FR-EVL-007: nothing that evaluates
 * reads them; `sealed.test.ts`). Codes are returned for the forms' values only; every label a screen
 * shows is a name.
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import { aspectConfigOf, contentOf } from "./config";
import { modelFaults } from "./model";

export const MODEL_INCLUDE = {
  stages: { orderBy: { order: "asc" as const }, include: { criteria: { orderBy: { order: "asc" as const } }, factorOptions: { orderBy: { code: "asc" as const } } } },
  bandSets: { orderBy: { code: "asc" as const }, include: { bands: { orderBy: { sortOrder: "asc" as const } } } },
} as const;

export async function loadModel(organisationId: string, id: string, client: Tx = db) {
  return client.evaluationModel.findFirst({ where: { id, organisationId }, include: MODEL_INCLUDE });
}
export type ModelRow = NonNullable<Awaited<ReturnType<typeof loadModel>>>;

export async function loadAspects(organisationId: string, client: Tx = db) {
  return client.evaluationAspect.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
}

/// A draft's faults at issue, judged on its rows with the aspects in force now.
export async function draftFindings(organisationId: string, m: ModelRow, now: Date, client: Tx = db) {
  const aspects = aspectConfigOf(await loadAspects(organisationId, client), now);
  return { content: contentOf(m), aspects, findings: modelFaults(contentOf(m), aspects) };
}

/// Everything the Evaluation models screen lists.
export async function evaluationConfiguration(organisationId: string) {
  const models = await db.evaluationModel.findMany({ where: { organisationId }, orderBy: [{ code: "asc" }, { version: "desc" }], include: { _count: { select: { exercises: true, stages: true } } } });
  const aspects = await loadAspects(organisationId);
  const policy = await db.evaluationPolicy.findUnique({ where: { organisationId }, include: { reportTemplate: { select: { nameEn: true } }, proposalTemplate: { select: { nameEn: true } } } });
  const bases = await db.contractBasis.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, code: true, nameEn: true, evaluationRoute: true, evaluationRouteProvenance: true, retiredOn: true } });
  const methods = await db.sourcingMethod.findMany({ where: { organisationId, documentPackKind: { in: ["TENDER", "QUOTATION"] } }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, defaultEvaluationModelCode: true, retiredOn: true } });
  const series = await db.numberingSeries.findMany({ where: { organisationId }, orderBy: { key: "asc" }, select: { key: true, nameEn: true } });
  const templates = await db.documentTemplate.findMany({ where: { organisationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true } });
  const offices = await db.authorityRole.findMany({ where: { organisationId, isCommittee: false }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } });
  return { models, aspects, policy, bases, methods, series, templates, offices };
}

/// The choices a stage's form offers: committees and offices by name.
export async function stageChoices(organisationId: string) {
  const committees = await db.committee.findMany({ where: { organisationId }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } });
  const offices = await db.authorityRole.findMany({ where: { organisationId, isCommittee: false }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } });
  return { committees, offices };
}
