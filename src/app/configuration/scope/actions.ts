"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { ORGANISATION_CODE } from "@/lib/org";
import { CONFIG_FAULT_TEXT, holdingFault, qualificationName, scopePolicyFaults, scopePolicyToSave, scopeRuleFaults, scopeRuleToSave, SCOPE_RULE_FAULT_TEXT } from "@/lib/scope/config";
import { AUTHORITY_ACTS, type AuthorityAct } from "@/lib/authority/types";
import { RATE_ENTITY } from "@/lib/scope/audit-view";
import { RATE_SCHEDULE_STATUS_LABEL, scopeFaultText } from "@/lib/scope/labels";
import { issueFaults, itemFaults, nextIssueNo, scheduleEditFault, startIssueFaults } from "@/lib/scope/rates";
import { activePerson, loadRateIssues } from "@/lib/scope/repo";
import { dayToDate, todayIn } from "@/lib/dates";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";
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

/// A create has no row of its own to lock, so it locks the organisation first: two creates
/// of one code (or the policy's first save) then run one after the other, and the duplicate
/// check reads what the first wrote.
async function lockOrganisation(tx: Tx, organisationId: string) {
  await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR UPDATE`;
}

// ------------------------------------------------------------------ policy

export async function saveScopePolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const typed = {
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
  // A cleared value takes its provenance with it.
  const v = scopePolicyToSave(typed);
  return db.$transaction(async (tx) => {
    // The first save creates the row, so the organisation is locked before it.
    await lockOrganisation(tx, orgId);
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
    await lockOrganisation(tx, orgId);
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
      // The holding may move to another qualification: the trail names the old one too, never its code.
      const priorRows = before.qualificationCode === qualificationCode ? [{ code: qualificationCode, nameEn: q.nameEn }] : await tx.qualification.findMany({ where: { organisationId: orgId, code: before.qualificationCode }, select: { code: true, nameEn: true } });
      await audit(tx, orgId, "PersonQualification", id, entityLabel, "UPDATE", { person: before.person.name, qualification: qualificationName(priorRows, before.qualificationCode), validFrom: before.validFrom, validTo: before.validTo, evidence: before.evidenceNote }, view);
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
    await lockOrganisation(tx, orgId);
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
    await lockOrganisation(tx, orgId);
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

// ------------------------------------------------------------------ increment 2: a method's scope-approval rule (OD-9)

/// Whether a method needs its scope approved by a committee: yes (naming the committee), no, or not set; with its provenance.
export async function saveMethodScopeRule(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const required = triState(r.choice("scopeApprovalRequired", "Scope approved by a committee", ["yes", "no", "unset"] as const, { required: true }));
  const provenance = r.choice("scopeApprovalProvenance", "Provenance", PROVENANCE);
  const committeeCode = r.optionalText("scopeCommitteeCode");
  // Overrides BD-62-16: the act the committee discharges is configured here, never chosen at tabling.
  const act = r.choice("scopeAct", "The committee's act", AUTHORITY_ACTS);
  const actProvenance = r.choice("scopeActProvenance", "Provenance", PROVENANCE);
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SourcingMethod" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.sourcingMethod.findFirst({ where: { id, organisationId: orgId }, select: { nameEn: true, scopeApprovalRequired: true, scopeApprovalProvenance: true, scopeCommitteeCode: true, scopeAct: true, scopeActProvenance: true } });
    if (!before) return GONE;
    const committees = (await tx.committee.findMany({ where: { organisationId: orgId, retiredOn: null }, select: { code: true } })).map((c) => c.code);
    const draft = { required, provenance, committeeCode, act: act ?? null, actProvenance: actProvenance ?? null };
    const faults = scopeRuleFaults(draft, { committees, acts: AUTHORITY_ACTS });
    if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [f.field, SCOPE_RULE_FAULT_TEXT[f.code]])) };
    const saved = scopeRuleToSave(draft);
    // The act is one of AUTHORITY_ACTS: the form read it as one, and scopeRuleFaults refused any other.
    const v = { ...saved, scopeAct: saved.scopeAct as AuthorityAct | null };
    await tx.sourcingMethod.update({ where: { id }, data: v });
    await audit(tx, orgId, "SourcingMethod", id, before.nameEn, "UPDATE", { scopeApprovalRequired: before.scopeApprovalRequired, scopeApprovalProvenance: before.scopeApprovalProvenance, scopeCommitteeCode: before.scopeCommitteeCode, scopeAct: before.scopeAct, scopeActProvenance: before.scopeActProvenance }, v);
    revalidatePath("/configuration/reference-data");
    revalidatePath("/sourcing", "layout");
    return done();
  });
}

// ------------------------------------------------------------------ increment 2: schedules of rates (FR-EST-004)

const issueLabel = (label: string, issueNo: number) => `Schedule of rates · ${label}, issue ${issueNo}`;
const scheduleRefusal = (fs: readonly { code: string; level: string; data?: Record<string, string | number | null> }[]): FormState => ({ ok: false, message: `Nothing was saved: ${fs.map((f) => scopeFaultText(f as Parameters<typeof scopeFaultText>[0])).join(" ")}` });

/// Lock every issue of a schedule, so two acts on one schedule never interleave.
async function lockSchedule(tx: Tx, organisationId: string, label: string) {
  await tx.$queryRaw`SELECT id FROM "RateSchedule" WHERE "organisationId" = ${organisationId} AND label = ${label} FOR UPDATE`;
}

/**
 * Start a draft issue of a schedule: a new schedule (issue 1), or the next issue of one,
 * copied item by item from its latest issue. One draft at a time per schedule.
 */
export async function startRateIssue(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const label = r.text("label", "Schedule", { required: true, max: 200 });
  const provenance = r.choice("provenance", "Provenance", PROVENANCE, { required: true });
  const governingSource = r.text("governingSource", "Governing source", { max: 500 });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    // A new schedule's label has no rows to lock yet: the organisation is locked first, so
    // two starts of one new label run one after the other and the second sees the first.
    await lockOrganisation(tx, orgId);
    await lockSchedule(tx, orgId, label);
    const issues = await loadRateIssues(orgId, tx);
    const faults = startIssueFaults(issues, label);
    if (faults.length) return faults[0].code === "LABEL_REQUIRED" ? { ok: false, errors: { label: scopeFaultText(faults[0]) } } : scheduleRefusal(faults);
    const issueNo = nextIssueNo(issues, label);
    const from = issues.filter((i) => i.label === label).sort((a, b) => b.issueNo - a.issueNo)[0] ?? null;
    const row = await tx.rateSchedule.create({ data: { organisationId: orgId, label, issueNo, status: "DRAFT", provenance, governingSource, notes } });
    await audit(tx, orgId, RATE_ENTITY.schedule, row.id, issueLabel(label, issueNo), "CREATE", null, { schedule: label, issue: issueNo, status: RATE_SCHEDULE_STATUS_LABEL.DRAFT, provenance, governingSource, ...(from ? { copiedFrom: `issue ${from.issueNo}`, items: from.items.length } : {}) });
    for (const i of from?.items ?? []) {
      const item = await tx.rateScheduleItem.create({ data: { organisationId: orgId, scheduleId: row.id, code: i.code, descriptionEn: i.descriptionEn, descriptionMs: i.descriptionMs, unit: i.unit, rate: senToDecimalString(i.rate), sortOrder: i.sortOrder } });
      await audit(tx, orgId, RATE_ENTITY.item, item.id, `${issueLabel(label, issueNo)} · ${i.code}`, "CREATE", null, { code: i.code, description: i.descriptionEn, unit: i.unit, rate: formatSen(i.rate) });
    }
    return done();
  });
}

/// Lock and read one issue (and every issue of its schedule) for an edit.
async function lockedIssue(tx: Tx, orgId: string, scheduleId: string) {
  const at = await tx.rateSchedule.findFirst({ where: { id: scheduleId, organisationId: orgId }, select: { label: true } });
  if (!at) return null;
  await lockSchedule(tx, orgId, at.label);
  const issues = await loadRateIssues(orgId, tx);
  const issue = issues.find((i) => i.id === scheduleId);
  return issue ? { issue, issues } : null;
}

/// Add or edit an item of a draft issue. An issued issue is never changed.
export async function saveRateItem(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const scheduleId = String(data.get("scheduleId") ?? "");
  const itemId = String(data.get("itemId") ?? "") || undefined;
  const r = new FormReader(data);
  const code = r.text("code", "Code", { required: true, max: 40 });
  const descriptionEn = r.text("descriptionEn", "Description", { required: true, max: 2000 });
  const unit = r.text("unit", "Unit", { max: 40 });
  const rateRaw = r.money("rate", "Rate", { required: true });
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  if (r.failed || rateRaw == null) return { ok: false, errors: r.errors };
  const rate = parseSen(rateRaw);
  return db.$transaction(async (tx) => {
    const l = await lockedIssue(tx, orgId, scheduleId);
    if (!l) return GONE;
    const faults = itemFaults({ code, descriptionEn, rate, id: itemId }, l.issue);
    if (faults.length) {
      const withField = faults.filter((f) => f.field);
      return withField.length === faults.length ? { ok: false, errors: Object.fromEntries(withField.map((f) => [f.field!, scopeFaultText(f)])) } : scheduleRefusal(faults);
    }
    const before = itemId ? l.issue.items.find((i) => i.id === itemId) ?? null : null;
    if (itemId && !before) return GONE;
    const row = { code: code.trim(), descriptionEn, unit, rate: senToDecimalString(rate), sortOrder };
    const saved = before ? await tx.rateScheduleItem.update({ where: { id: before.id }, data: row }) : await tx.rateScheduleItem.create({ data: { organisationId: orgId, scheduleId, ...row } });
    await audit(tx, orgId, RATE_ENTITY.item, saved.id, `${issueLabel(l.issue.label, l.issue.issueNo)} · ${row.code}`, before ? "UPDATE" : "CREATE",
      before ? { code: before.code, description: before.descriptionEn, unit: before.unit, rate: formatSen(before.rate) } : null, { code: row.code, description: descriptionEn, unit, rate: formatSen(rate) });
    return done();
  });
}

/// Remove an item of a draft issue, its whole row kept in the trail.
export async function removeRateItem(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const scheduleId = String(data.get("scheduleId") ?? "");
  const itemId = String(data.get("itemId") ?? "");
  return db.$transaction(async (tx) => {
    const l = await lockedIssue(tx, orgId, scheduleId);
    if (!l) return GONE;
    const fault = scheduleEditFault(l.issue);
    if (fault) return scheduleRefusal([fault]);
    const item = l.issue.items.find((i) => i.id === itemId);
    if (!item) return GONE;
    await tx.rateScheduleItem.delete({ where: { id: item.id } });
    await writeAudit(tx, { organisationId: orgId, entity: RATE_ENTITY.item, entityId: item.id, entityLabel: `${issueLabel(l.issue.label, l.issue.issueNo)} · ${item.code}` }, "DELETE",
      diffFields({ code: item.code, description: item.descriptionEn, unit: item.unit, rate: formatSen(item.rate) }, {}));
    return done();
  });
}

/**
 * Issue a draft: from the day it takes effect, named as issued by a person (recorded on
 * their behalf, not signed), on the organisation's day. The issue issued before it is
 * superseded in the same act; lines already priced from it keep what it said.
 */
export async function issueRateSchedule(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const scheduleId = String(data.get("scheduleId") ?? "");
  const r = new FormReader(data);
  const effectiveFrom = r.date("effectiveFrom", "Takes effect from", { required: true });
  const issuedByPersonId = r.optionalText("issuedByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const org = await tx.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { timeZone: true } });
    const today = org.timeZone ? todayIn(new Date(), org.timeZone) : null;
    const l = await lockedIssue(tx, orgId, scheduleId);
    if (!l) return GONE;
    const issuer = issuedByPersonId ? await activePerson(orgId, issuedByPersonId, tx) : null;
    if (issuedByPersonId && !issuer) return { ok: false, errors: { issuedByPersonId: scopeFaultText("PERSON_UNKNOWN") } };
    const effective = effectiveFrom ? storedDay(effectiveFrom) : null;
    const { faults, supersedes } = issueFaults(l.issue, l.issues, { effectiveFrom: effective, issuedByPersonId: issuer?.id ?? null, today });
    if (faults.length) {
      const byField: Record<string, string> = {};
      for (const f of faults) if (f.code === "EFFECTIVE_REQUIRED" || f.code === "EFFECTIVE_NOT_AFTER_CURRENT") byField.effectiveFrom = scopeFaultText(f); else if (f.code === "ISSUER_REQUIRED") byField.issuedByPersonId = scopeFaultText(f);
      return Object.keys(byField).length === faults.length ? { ok: false, errors: byField } : scheduleRefusal(faults);
    }
    if (supersedes) {
      await tx.rateSchedule.update({ where: { id: supersedes.id }, data: { status: "SUPERSEDED", supersededOn: dayToDate(today!) } });
      await audit(tx, orgId, RATE_ENTITY.schedule, supersedes.id, issueLabel(supersedes.label, supersedes.issueNo), "UPDATE", { status: RATE_SCHEDULE_STATUS_LABEL.ISSUED }, { status: RATE_SCHEDULE_STATUS_LABEL.SUPERSEDED, supersededBy: `issue ${l.issue.issueNo}`, supersededOn: today });
    }
    await tx.rateSchedule.update({ where: { id: l.issue.id }, data: { status: "ISSUED", effectiveFrom: dayToDate(effective!), issuedOn: dayToDate(today!), issuedByPersonId: issuer!.id } });
    await audit(tx, orgId, RATE_ENTITY.schedule, l.issue.id, issueLabel(l.issue.label, l.issue.issueNo), "UPDATE", { status: RATE_SCHEDULE_STATUS_LABEL.DRAFT }, { status: RATE_SCHEDULE_STATUS_LABEL.ISSUED, effectiveFrom: effective, issuedOn: today, issuedBy: `${issuer!.name} (recorded on behalf of, not signed)`, items: l.issue.items.length });
    revalidatePath("/sourcing", "layout");
    return done();
  });
}

/// Discard a draft issue (never an issued one), with its items; the trail keeps every row.
export async function discardRateIssue(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const scheduleId = String(data.get("scheduleId") ?? "");
  return db.$transaction(async (tx) => {
    const l = await lockedIssue(tx, orgId, scheduleId);
    if (!l) return GONE;
    const fault = scheduleEditFault(l.issue);
    if (fault) return scheduleRefusal([fault]);
    for (const i of l.issue.items) {
      await tx.rateScheduleItem.delete({ where: { id: i.id } });
      await writeAudit(tx, { organisationId: orgId, entity: RATE_ENTITY.item, entityId: i.id, entityLabel: `${issueLabel(l.issue.label, l.issue.issueNo)} · ${i.code}` }, "DELETE", diffFields({ code: i.code, description: i.descriptionEn, unit: i.unit, rate: formatSen(i.rate) }, {}));
    }
    await tx.rateSchedule.delete({ where: { id: l.issue.id } });
    await writeAudit(tx, { organisationId: orgId, entity: RATE_ENTITY.schedule, entityId: l.issue.id, entityLabel: issueLabel(l.issue.label, l.issue.issueNo) }, "DELETE", diffFields({ schedule: l.issue.label, issue: l.issue.issueNo, status: RATE_SCHEDULE_STATUS_LABEL.DRAFT }, {}));
    return done();
  });
}
