"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { ORGANISATION_CODE } from "@/lib/org";
import { CONFIG_FAULT_TEXT, holdingFault, scopePolicyFaults } from "@/lib/scope/config";
import { activePerson } from "@/lib/scope/repo";
import { FormReader } from "@/lib/validate";

/**
 * Configuration › Scope and estimate (6.2 plan §4, increment 1): the scope policy, the
 * qualifications and who holds them, the bill templates and their sections, the panel's
 * verification columns, and the two flags 6.2 adds to existing configuration (a method's
 * company-estimate rule, a basis's bill rule; OD-6). Each write locks the row it edits
 * (`FOR UPDATE`), re-reads it, checks it, and writes it with its before/after audit row in
 * one transaction. Every value set says where it came from; nothing is shipped set.
 */

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/scope";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };
const GONE: FormState = { ok: false, message: "That record no longer exists. Reload the page." };

async function organisationId(): Promise<string | null> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
  return org?.id ?? null;
}

function done(): FormState {
  revalidatePath(PATH);
  return { ok: true };
}

async function audit(tx: Tx, organisationId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", before: Record<string, unknown> | null, after: Record<string, unknown>, reason = "") {
  const changes = diffFields(before, after);
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId, entity, entityId, entityLabel, reason }, action, changes);
}

const triState = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

// ------------------------------------------------------------------ policy

export async function saveScopePolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    measurementStandardLabel: r.optionalText("measurementStandardLabel"),
    measurementStandardProvenance: r.choice("measurementStandardProvenance", "Provenance", PROVENANCE),
    bqPreparerQualificationCode: r.optionalText("bqPreparerQualificationCode"),
    estimateLeadDays: r.int("estimateLeadDays", "Lead"),
    estimateLeadProvenance: r.choice("estimateLeadProvenance", "Provenance", PROVENANCE),
    estimateCustodianRoleCode: r.optionalText("estimateCustodianRoleCode"),
    estimateAuditRoleCode: r.optionalText("estimateAuditRoleCode"),
    estimateOverrideRoleCode: r.optionalText("estimateOverrideRoleCode"),
    panelSignatoryLimit: r.int("panelSignatoryLimit", "Signatory limit"),
    panelSignatoryLimitProvenance: r.choice("panelSignatoryLimitProvenance", "Provenance", PROVENANCE),
    panelContractKindTaxonomyCode: r.optionalText("panelContractKindTaxonomyCode"),
    panelProjectStatusTaxonomyCode: r.optionalText("panelProjectStatusTaxonomyCode"),
    benchmarkLabelEn: r.optionalText("benchmarkLabelEn"),
    benchmarkLabelMs: r.optionalText("benchmarkLabelMs"),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ScopePolicy" WHERE "organisationId" = ${orgId} FOR UPDATE`;
    const qualifications = await tx.qualification.findMany({ where: { organisationId: orgId, retiredOn: null }, select: { code: true, nameEn: true } });
    const offices = await tx.authorityRole.findMany({ where: { organisationId: orgId, isCommittee: false }, select: { code: true, nameEn: true } });
    const lists = await tx.classificationTaxonomy.findMany({ where: { organisationId: orgId }, select: { code: true, nameEn: true } });
    const before = await tx.scopePolicy.findUnique({ where: { organisationId: orgId } });
    const faults = scopePolicyFaults(v, { qualifications: qualifications.map((q) => q.code), offices: offices.map((o) => o.code), lists: lists.map((t) => t.code) });
    if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [f.field, CONFIG_FAULT_TEXT[f.code]])) };
    const row = await tx.scopePolicy.upsert({ where: { organisationId: orgId }, create: { organisationId: orgId, ...v }, update: v });
    // The trail names what a code points at, never the code (AGENTS.md rule 5).
    const named = (p: typeof v) => {
      const name = (rows: { code: string; nameEn: string }[], c: string | null) => (c == null ? null : (rows.find((x) => x.code === c)?.nameEn ?? "A row no longer configured"));
      return {
        ...p,
        bqPreparerQualificationCode: name(qualifications, p.bqPreparerQualificationCode),
        estimateCustodianRoleCode: name(offices, p.estimateCustodianRoleCode),
        estimateAuditRoleCode: name(offices, p.estimateAuditRoleCode),
        estimateOverrideRoleCode: name(offices, p.estimateOverrideRoleCode),
        panelContractKindTaxonomyCode: name(lists, p.panelContractKindTaxonomyCode),
        panelProjectStatusTaxonomyCode: name(lists, p.panelProjectStatusTaxonomyCode),
      };
    };
    await audit(tx, orgId, "ScopePolicy", row.id, "Scope and estimate policy", before ? "UPDATE" : "CREATE", before ? named({ ...v, ...before, notes: before.notes }) : null, named(v));
    return done();
  });
}

// ------------------------------------------------------------------ qualifications

export async function saveQualification(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const nameEn = r.text("nameEn", "Name", { required: true, max: 200 });
  const v = {
    nameEn,
    nameMs: r.optionalText("nameMs"),
    governingSource: r.text("governingSource", "Governing source", { max: 300 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    retiredOn: r.date("retiredOn", "Retired on"),
  };
  const codeRaw = id ? null : r.code("code", "Code");
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "Qualification" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.qualification.findFirst({ where: { id, organisationId: orgId } });
      if (!before) return GONE;
      const row = await tx.qualification.update({ where: { id }, data: { ...v, provenance: v.provenance! } });
      await audit(tx, orgId, "Qualification", row.id, row.nameEn, "UPDATE", before, v);
      return done();
    }
    const taken = await tx.qualification.findFirst({ where: { organisationId: orgId, code: codeRaw! }, select: { id: true } });
    if (taken) return { ok: false, errors: { code: "Code is already in use." } };
    const row = await tx.qualification.create({ data: { organisationId: orgId, code: codeRaw!, ...v, provenance: v.provenance! } });
    await audit(tx, orgId, "Qualification", row.id, row.nameEn, "CREATE", null, { code: codeRaw, ...v });
    return done();
  });
}

/// A person's holding of a qualification over days (FR-EST-003), with its evidence.
export async function savePersonQualification(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const personId = r.text("personId", "Person", { required: true });
  const qualificationCode = r.text("qualificationCode", "Qualification", { required: true });
  const validFrom = r.date("validFrom", "From", { required: true });
  const validTo = r.date("validTo", "To");
  const evidenceNote = r.text("evidenceNote", "Evidence", { max: 2000 });
  if (validFrom && holdingFault(storedDay(validFrom), validTo ? storedDay(validTo) : null)) r.reject("validTo", CONFIG_FAULT_TEXT.PERIOD_REVERSED);
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const person = await activePerson(orgId, personId, tx);
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const q = await tx.qualification.findFirst({ where: { organisationId: orgId, code: qualificationCode }, select: { nameEn: true } });
    if (!q) return { ok: false, errors: { qualificationCode: CONFIG_FAULT_TEXT.UNKNOWN_QUALIFICATION } };
    const v = { personId: person.id, qualificationCode, validFrom: validFrom!, validTo, evidenceNote };
    const view = { person: person.name, qualification: q.nameEn, validFrom: v.validFrom, validTo: v.validTo, evidence: evidenceNote };
    const entityLabel = `${person.name} · ${q.nameEn}`;
    if (id) {
      await tx.$queryRaw`SELECT id FROM "PersonQualification" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.personQualification.findFirst({ where: { id, organisationId: orgId }, include: { person: { select: { name: true } } } });
      if (!before) return GONE;
      await tx.personQualification.update({ where: { id }, data: v });
      await audit(tx, orgId, "PersonQualification", id, entityLabel, "UPDATE", { person: before.person.name, qualification: before.qualificationCode === qualificationCode ? q.nameEn : before.qualificationCode, validFrom: before.validFrom, validTo: before.validTo, evidence: before.evidenceNote }, view);
      return done();
    }
    const row = await tx.personQualification.create({ data: { organisationId: orgId, ...v } });
    await audit(tx, orgId, "PersonQualification", row.id, entityLabel, "CREATE", null, view);
    return done();
  });
}

// ------------------------------------------------------------------ bill templates and panel columns

export async function saveBqTemplate(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    nameMs: r.optionalText("nameMs"),
    deliverableKind: r.choice("deliverableKind", "Deliverable", ["GOODS_DELIVERED", "MEASURED_CONSTRUCTION", "TERM_PERFORMANCE"] as const),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    retiredOn: r.date("retiredOn", "Retired on"),
  };
  const code = id ? null : r.code("code", "Code");
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "BqTemplate" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.bqTemplate.findFirst({ where: { id, organisationId: orgId } });
      if (!before) return GONE;
      await tx.bqTemplate.update({ where: { id }, data: { ...v, provenance: v.provenance! } });
      await audit(tx, orgId, "BqTemplate", id, v.nameEn, "UPDATE", before, v);
      return done();
    }
    if (await tx.bqTemplate.findFirst({ where: { organisationId: orgId, code: code! }, select: { id: true } })) return { ok: false, errors: { code: "Code is already in use." } };
    const row = await tx.bqTemplate.create({ data: { organisationId: orgId, code: code!, ...v, provenance: v.provenance! } });
    await audit(tx, orgId, "BqTemplate", row.id, v.nameEn, "CREATE", null, { code, ...v });
    return done();
  });
}

export async function saveBqTemplateSection(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const templateId = r.text("templateId", "Template", { required: true });
  const v = { number: r.text("number", "Number", { required: true, max: 20 }), titleEn: r.text("titleEn", "Title", { required: true, max: 300 }), titleMs: r.optionalText("titleMs"), sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0 };
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BqTemplate" WHERE id = ${templateId} FOR UPDATE`;
    const t = await tx.bqTemplate.findFirst({ where: { id: templateId, organisationId: orgId }, select: { nameEn: true } });
    if (!t) return GONE;
    if (id) {
      const before = await tx.bqTemplateSection.findFirst({ where: { id, templateId } });
      if (!before) return GONE;
      await tx.bqTemplateSection.update({ where: { id }, data: v });
      await audit(tx, orgId, "BqTemplateSection", id, `${t.nameEn} · ${v.number}`, "UPDATE", before, v);
      return done();
    }
    const row = await tx.bqTemplateSection.create({ data: { organisationId: orgId, templateId, ...v } });
    await audit(tx, orgId, "BqTemplateSection", row.id, `${t.nameEn} · ${v.number}`, "CREATE", null, v);
    return done();
  });
}

export async function saveSpecPanelColumn(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    labelEn: r.text("labelEn", "Label", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    orgUnitCode: r.optionalText("orgUnitCode"),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    retiredOn: r.date("retiredOn", "Retired on"),
  };
  const code = id ? null : r.code("code", "Code");
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (v.orgUnitCode && !(await tx.orgUnit.findFirst({ where: { organisationId: orgId, code: v.orgUnitCode }, select: { id: true } }))) return { ok: false, errors: { orgUnitCode: "That unit is not configured. Choose one from Organisation." } };
    if (id) {
      await tx.$queryRaw`SELECT id FROM "SpecPanelColumn" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.specPanelColumn.findFirst({ where: { id, organisationId: orgId } });
      if (!before) return GONE;
      await tx.specPanelColumn.update({ where: { id }, data: { ...v, provenance: v.provenance! } });
      await audit(tx, orgId, "SpecPanelColumn", id, v.labelEn, "UPDATE", before, v);
      return done();
    }
    if (await tx.specPanelColumn.findFirst({ where: { organisationId: orgId, code: code! }, select: { id: true } })) return { ok: false, errors: { code: "Code is already in use." } };
    const row = await tx.specPanelColumn.create({ data: { organisationId: orgId, code: code!, ...v, provenance: v.provenance! } });
    await audit(tx, orgId, "SpecPanelColumn", row.id, v.labelEn, "CREATE", null, { code, ...v });
    return done();
  });
}

// ------------------------------------------------------------------ the two flags on existing configuration (OD-6)

/// Whether a sourcing method needs a lodged company estimate: yes, no or not set, with its provenance.
export async function saveMethodEstimateRule(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const requiresCompanyEstimate = triState(r.choice("requiresCompanyEstimate", "Needs a company estimate", ["yes", "no", "unset"] as const, { required: true }));
  const requiresCompanyEstimateProvenance = r.choice("requiresCompanyEstimateProvenance", "Provenance", PROVENANCE);
  if (requiresCompanyEstimate != null && !requiresCompanyEstimateProvenance) r.reject("requiresCompanyEstimateProvenance", CONFIG_FAULT_TEXT.PROVENANCE_REQUIRED);
  if (r.failed) return { ok: false, errors: r.errors };
  const v = { requiresCompanyEstimate, requiresCompanyEstimateProvenance: requiresCompanyEstimate == null ? null : requiresCompanyEstimateProvenance };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SourcingMethod" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.sourcingMethod.findFirst({ where: { id, organisationId: orgId }, select: { nameEn: true, requiresCompanyEstimate: true, requiresCompanyEstimateProvenance: true } });
    if (!before) return GONE;
    await tx.sourcingMethod.update({ where: { id }, data: v });
    await audit(tx, orgId, "SourcingMethod", id, before.nameEn, "UPDATE", before, v);
    revalidatePath("/configuration/reference-data");
    return done();
  });
}

/// Whether a contract basis is let on a bill of quantities: yes, no or not set, with its provenance.
export async function saveBasisBqRule(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const requiresBq = triState(r.choice("requiresBq", "Let on a bill of quantities", ["yes", "no", "unset"] as const, { required: true }));
  const requiresBqProvenance = r.choice("requiresBqProvenance", "Provenance", PROVENANCE);
  if (requiresBq != null && !requiresBqProvenance) r.reject("requiresBqProvenance", CONFIG_FAULT_TEXT.PROVENANCE_REQUIRED);
  if (r.failed) return { ok: false, errors: r.errors };
  const v = { requiresBq, requiresBqProvenance: requiresBq == null ? null : requiresBqProvenance };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContractBasis" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.contractBasis.findFirst({ where: { id, organisationId: orgId }, select: { nameEn: true, requiresBq: true, requiresBqProvenance: true } });
    if (!before) return GONE;
    await tx.contractBasis.update({ where: { id }, data: v });
    await audit(tx, orgId, "ContractBasis", id, before.nameEn, "UPDATE", before, v);
    revalidatePath("/configuration/reference-data");
    return done();
  });
}
