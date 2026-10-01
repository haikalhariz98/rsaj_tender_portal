"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { awardAuditView } from "@/lib/award/audit-view";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { parseSen, senToDecimalString } from "@/lib/money";
import { bandSetFaults } from "@/lib/securities/liability";
import { FormReader } from "@/lib/validate";
import { splitValues } from "@/lib/ui/select-logic";

/**
 * Award controls: the customer's policy for awards and the lists the award reads. Every
 * setting ships unset and every list empty (6.11 rulings); saving an empty field clears
 * it back to unset, which is recorded. Rows are retired, never deleted, and every write
 * is audited with its before and after in the same transaction.
 */

const PATH = "/configuration/awards";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const INSTRUMENTS = ["LETTER_OF_ACCEPTANCE", "WORK_INDENT"] as const;

async function org() {
  const o = await exerciseOrg();
  return o;
}

async function audit(tx: Tx, orgId: string, entity: string, entityId: string, label: string, before: Record<string, unknown> | null, after: Record<string, unknown>, reason: string) {
  const changes = diffFields(before ? awardAuditView(before) : null, awardAuditView(after));
  if (before && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel: label, reason }, before ? "UPDATE" : "CREATE", changes);
}

const done = (): FormState => {
  revalidatePath(PATH);
  revalidatePath("/awards");
  return { ok: true };
};

async function templateOk(tx: Tx, orgId: string, id: string | null) {
  if (!id) return true;
  return !!(await tx.documentTemplate.findFirst({ where: { id, organisationId: orgId }, select: { id: true } }));
}

export async function saveAwardPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    tenderInstrument: r.choice("tenderInstrument", "Tender instrument", INSTRUMENTS),
    quotationInstrument: r.choice("quotationInstrument", "Quotation instrument", INSTRUMENTS),
    indentValidityDays: r.int("indentValidityDays", "Indent validity", { min: 1 }),
    commencementGraceDays: r.int("commencementGraceDays", "Commencement grace", { min: 0 }),
    acceptanceReturnDays: r.int("acceptanceReturnDays", "Days to return", { min: 1 }),
    preContractUnitCode: r.optionalText("preContractUnitCode"),
    postContractUnitCode: r.optionalText("postContractUnitCode"),
    quotationContractKey: r.choice("quotationContractKey", "Quotation contract number", ["INDENT_NUMBER", "CONTRACT_SERIES"] as const),
    regulatedActivityLabel: r.optionalText("regulatedActivityLabel"),
    loaTemplateId: r.optionalText("loaTemplateId"),
    declarationTemplateId: r.optionalText("declarationTemplateId"),
    coveringMemoTemplateId: r.optionalText("coveringMemoTemplateId"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE),
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    for (const k of ["loaTemplateId", "declarationTemplateId", "coveringMemoTemplateId"] as const) if (!(await templateOk(tx, o.id, v[k]))) return { ok: false, errors: { [k]: "That template no longer exists." } } as FormState;
    for (const k of ["preContractUnitCode", "postContractUnitCode"] as const) {
      if (v[k] && !(await tx.orgUnit.findFirst({ where: { organisationId: o.id, code: v[k]! }, select: { id: true } }))) return { ok: false, errors: { [k]: "That unit is not in the organisation's structure." } } as FormState;
    }
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const before = await tx.awardPolicy.findUnique({ where: { organisationId: o.id } });
    const row = await tx.awardPolicy.upsert({ where: { organisationId: o.id }, update: v, create: { organisationId: o.id, ...v } });
    await audit(tx, o.id, "AwardPolicy", row.id, "Award controls", before, v, reason);
    return done();
  });
}

/// A recipient of an instrument's copies (FR-AWD-004).
export async function saveRecipient(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const existing = await db.distributionRecipient.findMany({ where: { organisationId: o.id }, select: { id: true, code: true } });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That recipient no longer exists." };
  const v = {
    code: current ? current.code : r.code("code", "Code", { taken: existing.map((e) => e.code) }),
    instrumentKind: r.choice("instrumentKind", "Instrument", INSTRUMENTS, { required: true }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    nameMs: r.optionalText("nameMs"),
    mandatory: r.bool("mandatory"),
    onlyWhenRegulated: r.bool("onlyWhenRegulated"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const w = { ...v, instrumentKind: v.instrumentKind!, provenance: v.provenance! };
  return db.$transaction(async (tx) => {
    const before = id ? await tx.distributionRecipient.findUnique({ where: { id } }) : null;
    const row = id ? await tx.distributionRecipient.update({ where: { id }, data: w }) : await tx.distributionRecipient.create({ data: { organisationId: o.id, ...w } });
    await audit(tx, o.id, "DistributionRecipient", row.id, v.nameEn, before, w, reason);
    return done();
  });
}

/// An appointment-letter variant (FR-AWD-007): contract types plus a terms band.
export async function saveVariant(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const existing = await db.appointmentLetterVariant.findMany({ where: { organisationId: o.id }, select: { id: true, code: true } });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That variant no longer exists." };
  const types = splitValues(data.get("contractTypeCodes"));
  const v = {
    code: current ? current.code : r.code("code", "Code", { taken: existing.map((e) => e.code) }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    templateId: r.text("templateId", "Template", { required: true }),
    contractTypeCodes: types,
    termsBandKey: r.optionalText("termsBandKey"),
    nonCommencement: r.choice("nonCommencement", "If work does not commence", ["CANCEL_AND_BLACKLIST", "WARNING_LETTER"] as const),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (!(await templateOk(tx, o.id, v.templateId))) return { ok: false, errors: { templateId: "That template no longer exists." } } as FormState;
    const known = await tx.contractType.findMany({ where: { organisationId: o.id, code: { in: types } }, select: { code: true } });
    if (known.length !== types.length) return { ok: false, errors: { contractTypeCodes: "Choose contract types from the list." } } as FormState;
    const before = id ? await tx.appointmentLetterVariant.findUnique({ where: { id } }) : null;
    const w = { ...v, provenance: v.provenance! };
    const row = id ? await tx.appointmentLetterVariant.update({ where: { id }, data: w }) : await tx.appointmentLetterVariant.create({ data: { organisationId: o.id, ...w } });
    await audit(tx, o.id, "AppointmentLetterVariant", row.id, v.nameEn, before && { ...before, contractTypeCodes: before.contractTypeCodes.join(", ") }, { ...w, contractTypeCodes: types.join(", ") }, reason);
    return done();
  });
}

/// A kind of condition precedent (FR-AWD-014).
export async function saveConditionKind(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const existing = await db.conditionPrecedentKind.findMany({ where: { organisationId: o.id }, select: { id: true, code: true } });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That condition no longer exists." };
  const v = {
    code: current ? current.code : r.code("code", "Code", { taken: existing.map((e) => e.code) }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    excludesEotReason: r.bool("excludesEotReason"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const w = { ...v, provenance: v.provenance! };
  return db.$transaction(async (tx) => {
    const before = id ? await tx.conditionPrecedentKind.findUnique({ where: { id } }) : null;
    const row = id ? await tx.conditionPrecedentKind.update({ where: { id }, data: w }) : await tx.conditionPrecedentKind.create({ data: { organisationId: o.id, ...w } });
    await audit(tx, o.id, "ConditionPrecedentKind", row.id, v.nameEn, before, w, reason);
    return done();
  });
}

/// A policy a contract must carry (FR-AWD-013).
export async function saveRequirement(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const existing = await db.insuranceRequirement.findMany({ where: { organisationId: o.id }, select: { id: true, code: true } });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That requirement no longer exists." };
  const pct = r.optionalText("percent");
  if (pct && !/^\d{1,3}(\.\d{1,4})?$/.test(pct)) r.reject("percent", "A percentage, to at most four decimal places.");
  const v = {
    code: current ? current.code : r.code("code", "Code", { taken: existing.map((e) => e.code) }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    kind: r.choice("kind", "Kind", ["WORKS", "PUBLIC_LIABILITY", "WORKMENS_COMPENSATION", "CAR", "EAR"] as const, { required: true }),
    contractTypeCode: r.optionalText("contractTypeCode"),
    required: r.bool("required"),
    percent: pct,
    tailMonths: r.int("tailMonths", "Tail months", { min: 0 }),
    tailDays: r.int("tailDays", "Tail days", { min: 0 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const w = { ...v, kind: v.kind!, provenance: v.provenance! };
  return db.$transaction(async (tx) => {
    if (v.contractTypeCode && !(await tx.contractType.findFirst({ where: { organisationId: o.id, code: v.contractTypeCode }, select: { id: true } }))) return { ok: false, errors: { contractTypeCode: "Choose a contract type from the list." } } as FormState;
    const before = id ? await tx.insuranceRequirement.findUnique({ where: { id } }) : null;
    const row = id ? await tx.insuranceRequirement.update({ where: { id }, data: w }) : await tx.insuranceRequirement.create({ data: { organisationId: o.id, ...w } });
    await audit(tx, o.id, "InsuranceRequirement", row.id, v.nameEn, before, w, reason);
    return done();
  });
}

/**
 * A liability band, (min, max] (FR-AWD-013). A band that would overlap another is
 * refused on save; gaps are shown on the screen, since the printed table the customer
 * transcribes has them (6.11 ruling).
 */
export async function saveBand(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const existing = await db.liabilityBand.findMany({ where: { organisationId: o.id } });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That band no longer exists." };
  const v = {
    code: current ? current.code : r.code("code", "Code", { taken: existing.map((e) => e.code) }),
    minValue: r.money("minValue", "Above"),
    maxValue: r.money("maxValue", "Up to"),
    limitAmount: r.money("limitAmount", "Limit", { required: true }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (v.minValue && v.maxValue && parseSen(v.maxValue) <= parseSen(v.minValue)) r.reject("maxValue", "The upper edge must be above the lower.");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const money = (x: string | null) => (x ? senToDecimalString(parseSen(x)) : null);
  const w = { ...v, minValue: money(v.minValue), maxValue: money(v.maxValue), limitAmount: money(v.limitAmount)!, provenance: v.provenance! };
  return db.$transaction(async (tx): Promise<FormState> => {
    // One band set per organisation: saves are serialised on it, and the overlap check
    // reads the set inside the write, so two saves can never each pass alone and overlap.
    const lockKey = `liability_band:${o.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const live = await tx.liabilityBand.findMany({ where: { organisationId: o.id, retiredOn: null, NOT: id ? { id } : undefined } });
    const set = [...live.map((b) => ({ code: b.code, minValue: b.minValue ? parseSen(b.minValue.toString()) : null, maxValue: b.maxValue ? parseSen(b.maxValue.toString()) : null, limit: 0n })), { code: w.code, minValue: w.minValue ? parseSen(w.minValue) : null, maxValue: w.maxValue ? parseSen(w.maxValue) : null, limit: 0n }];
    const overlap = bandSetFaults(set).find((f) => f.kind === "OVERLAP" && (f.a === w.code || f.b === w.code));
    if (overlap) return { ok: false, errors: { minValue: "This band would overlap another: a contract price would fall in both. Adjust its edges." } };
    const before = id ? await tx.liabilityBand.findUnique({ where: { id } }) : null;
    const row = id ? await tx.liabilityBand.update({ where: { id }, data: w }) : await tx.liabilityBand.create({ data: { organisationId: o.id, ...w } });
    await audit(tx, o.id, "LiabilityBand", row.id, `Liability band ${w.code}`, before, w, reason);
    return done();
  });
}

/// An issuer on the regulator's approved list (FR-AWD-012).
export async function saveIssuer(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const existing = await db.approvedIssuer.findMany({ where: { organisationId: o.id }, select: { id: true, code: true } });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That issuer no longer exists." };
  const v = {
    code: current ? current.code : r.code("code", "Code", { taken: existing.map((e) => e.code) }),
    name: r.text("name", "Name", { required: true, max: 240 }),
    kind: r.choice("kind", "Kind", ["BANK", "INSURER", "TAKAFUL"] as const, { required: true }),
    listSource: r.text("listSource", "The list it is on", { max: 400 }),
    listAsAt: r.date("listAsAt", "List as at"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const w = { ...v, kind: v.kind!, provenance: v.provenance! };
  return db.$transaction(async (tx) => {
    const before = id ? await tx.approvedIssuer.findUnique({ where: { id } }) : null;
    const row = id ? await tx.approvedIssuer.update({ where: { id }, data: w }) : await tx.approvedIssuer.create({ data: { organisationId: o.id, ...w } });
    await audit(tx, o.id, "ApprovedIssuer", row.id, v.name, before, w, reason);
    return done();
  });
}

const RETIRABLE = {
  DistributionRecipient: "distributionRecipient",
  AppointmentLetterVariant: "appointmentLetterVariant",
  ConditionPrecedentKind: "conditionPrecedentKind",
  InsuranceRequirement: "insuranceRequirement",
  LiabilityBand: "liabilityBand",
  ApprovedIssuer: "approvedIssuer",
} as const;

/// Retire a row from one of the lists: kept, and no longer offered. A reason is required.
export async function retireRow(_prev: FormState, data: FormData): Promise<FormState> {
  const o = await org();
  if (!o) return NO_ORG;
  const entity = String(data.get("entity") ?? "") as keyof typeof RETIRABLE;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const r = new FormReader(data);
  const on = r.date("retiredOn", "Retired from", { required: true });
  if (!reason) r.reject("reason", "A reason is required.");
  if (!(entity in RETIRABLE)) return { ok: false, message: "That list cannot be changed here." };
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const model = (tx as unknown as Record<string, { findFirst: (a: object) => Promise<{ id: string; retiredOn: Date | null; code: string; nameEn?: string; name?: string } | null>; update: (a: object) => Promise<unknown> }>)[RETIRABLE[entity]];
    const before = await model.findFirst({ where: { id, organisationId: o.id } });
    if (!before) return { ok: false, message: "That row no longer exists." } as FormState;
    await model.update({ where: { id }, data: { retiredOn: on } });
    await writeAudit(tx, { organisationId: o.id, entity, entityId: id, entityLabel: before.nameEn ?? before.name ?? before.code, reason }, "UPDATE", diffFields({ retiredOn: before.retiredOn }, { retiredOn: on }));
    return done();
  });
}
