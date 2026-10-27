/**
 * What contractor performance reads (Phase 2 close-out stage D). Server-only, reads only: the configuration page, the acts, the Close tab and
 * Supplier › Performance read the same rows; every state is the pure rules' (`performanceState`, `openFaults`).
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { fixedToDecimalString, parseFixed } from "@/lib/evaluation/fixed";

import type { FormSnapshot } from "./form";

const formInclude = { criteria: { orderBy: { sortOrder: "asc" } }, bands: { orderBy: { lowerPct: "asc" } } } as const;

export type FormRow = NonNullable<Awaited<ReturnType<typeof formRow>>>;
const formRow = (client: Tx, where: { id: string; organisationId: string }) => client.performanceForm.findFirst({ where, include: formInclude });

/// The form as a report pins it (decimals as four-place strings).
export const snapshotOfForm = (f: FormRow): FormSnapshot => ({
  formId: f.id,
  name: f.nameEn,
  version: f.version,
  contractTypeCode: f.contractTypeCode,
  scaleMax: f.scaleMax,
  criteria: f.criteria.map((c) => ({ order: c.sortOrder, label: c.labelEn, guide: c.guideEn, weight: fixedToDecimalString(parseFixed(c.weight.toString())) })),
  bands: f.bands.map((b) => ({ label: b.label, lowerPct: fixedToDecimalString(parseFixed(b.lowerPct.toString())), sortOrder: b.sortOrder })),
});

/// Every form of the organisation, newest first within each contract type.
export const loadForms = (organisationId: string, client: Tx = db) => client.performanceForm.findMany({ where: { organisationId }, include: formInclude, orderBy: [{ contractTypeCode: "asc" }, { version: "desc" }] });

/// The contract type's issued form (one per type, ruling 10), or null: FORM_NOT_SET.
export const issuedFormFor = (organisationId: string, contractTypeCode: string | null, client: Tx = db) =>
  contractTypeCode ? client.performanceForm.findFirst({ where: { organisationId, contractTypeCode, status: "ISSUED" }, include: formInclude }) : Promise.resolve(null);

/// The contract's report, with its scores and its people.
export const loadReport = (contractId: string, client: Tx = db) =>
  client.performanceReport.findUnique({
    where: { contractId },
    include: { scores: { orderBy: { criterionOrder: "asc" } }, person: { select: { name: true } }, assessedBy: { select: { name: true } }, verifiedBy: { select: { name: true } } },
  });
export type ReportRowFull = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

export const formSnapshotOf = (r: { formSnapshot: unknown }): FormSnapshot => r.formSnapshot as FormSnapshot;
