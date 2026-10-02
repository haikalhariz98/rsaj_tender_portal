"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { documentTypeFaults, listValueFaults, valueFaults } from "@/lib/suppliers/config";
import { LIST_KIND_SINGULAR, supplierFaultText, VALUE_KIND_LABEL } from "@/lib/suppliers/labels";
import { REGISTRATION_VALUE_KINDS, SUPPLIER_LIST_KINDS, type Finding, type RegistrationValueKind, type SupplierListKind } from "@/lib/suppliers/types";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";

/**
 * Configuration › Supplier register (6.15 §5): the registration bodies' values (FR-VND-003), the document
 * types (FR-VND-002), the register's lists and its policy. Nothing ships (AGENTS.md rule 1). Each write
 * locks the organisation (or the row), re-reads it, runs the lib's check (`src/lib/suppliers/config.ts`)
 * and writes with its before/after audit row in words, in one transaction. A retired value or type stays
 * on the records that used it; changing a type's switch once documents of it are on file needs a reason.
 */

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
type Prov = (typeof PROVENANCE)[number];
const PROVENANCE_WORDS: Record<Prov, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const prov = (p: string | null | undefined) => (p ? (PROVENANCE_WORDS[p as Prov] ?? "Not set") : "Not set");
const PATH = "/configuration/suppliers";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };
const GONE: FormState = { ok: false, message: "That record no longer exists. Reload the page." };
const NO_ZONE: FormState = { ok: false, message: "The organisation's time zone is not set, so no day can be recorded. Set it under Configuration, Organisation." };
const TRI = ["yes", "no", "unset"] as const;
const tri = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);
const triWords = (v: boolean | null, yes: string, no: string) => (v == null ? "Not set" : v ? yes : no);

async function organisation() {
  return db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
}
const lockOrganisation = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
function done(): FormState {
  revalidatePath(PATH);
  revalidatePath("/suppliers");
  return { ok: true };
}
const audit = (tx: Tx, organisationId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(tx, { organisationId, entity, entityId, entityLabel, reason }, action, changes);
const refusal = (fs: readonly Finding[]): FormState => ({ ok: false, message: `Nothing was saved: ${fs.map((f) => supplierFaultText(f)).join(" ")}` });
const retiredWords = (d: Date | null) => (d ? formatDate(storedDay(d)) : null);

// ------------------------------------------------------------------ registration values (FR-VND-003)

const valueWords = (v: { kind: string; nameEn: string; nameMs: string | null; parentCode: string | null; rank: number | null; valueCeiling: { toString(): string } | string | null; ceilingProvenance: string | null; governingSource: string; provenance: string; retiredOn?: Date | null }) => ({
  kindOfValue: VALUE_KIND_LABEL[v.kind as RegistrationValueKind]?.en ?? null,
  name: v.nameEn,
  nameInMalay: v.nameMs,
  underCategory: v.parentCode,
  rank: v.rank,
  valueCeiling: v.valueCeiling == null ? null : formatMoney(parseSen(v.valueCeiling.toString())),
  ceilingFrom: v.valueCeiling == null ? null : prov(v.ceilingProvenance),
  governingSource: v.governingSource || null,
  whereItComesFrom: prov(v.provenance),
  retiredOn: v.retiredOn ? retiredWords(v.retiredOn) : null,
});

/// Add or change a value under a registration body (a grade with its rank and ceiling; a specialisation under a category).
export async function saveRegistrationValue(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    bodyId: r.text("bodyId", "Registration body", { required: true }),
    kind: r.choice("kind", "Kind of value", REGISTRATION_VALUE_KINDS),
    code: r.code("code", "Code"),
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    nameMs: r.optionalText("nameMs"),
    parentCode: r.optionalText("parentCode"),
    rank: r.int("rank", "Rank", { min: 1 }),
    valueCeiling: r.money("valueCeiling", "Value ceiling"),
    ceilingProvenance: r.choice("ceilingProvenance", "Where the ceiling comes from", PROVENANCE),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = id ? await tx.registrationValue.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const bodyId = before?.bodyId ?? v.bodyId;
    const kind = (before?.kind ?? v.kind) as RegistrationValueKind | null;
    const code = before?.code ?? v.code;
    const body = await tx.registrationBody.findFirst({ where: { id: bodyId, organisationId: org.id } });
    const siblings = await tx.registrationValue.findMany({ where: { bodyId, NOT: id ? { id } : undefined }, select: { kind: true, code: true, rank: true } });
    const fs = valueFaults(
      { ...v, kind, code },
      { bodyExists: !!body, codeTaken: !before && siblings.some((x) => x.kind === kind && x.code === code), categoryCodes: siblings.filter((x) => x.kind === "CATEGORY").map((x) => x.code), gradeRanks: siblings.filter((x) => x.rank != null).map((x) => x.rank!) },
    );
    if (fs.length) return refusal(fs);
    const row = { nameEn: v.nameEn, nameMs: v.nameMs, parentCode: v.parentCode, rank: v.rank, valueCeiling: v.valueCeiling, ceilingProvenance: v.valueCeiling ? v.ceilingProvenance : null, governingSource: v.governingSource, provenance: v.provenance!, sortOrder: v.sortOrder };
    const what = `Registration value · ${body!.labelEn} · ${v.nameEn}`;
    if (!before) {
      const created = await tx.registrationValue.create({ data: { organisationId: org.id, bodyId, kind: kind!, code, ...row } });
      await audit(tx, org.id, "RegistrationValue", created.id, what, "CREATE", diffFields(null, valueWords(created)));
    } else {
      const after = await tx.registrationValue.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "RegistrationValue", before.id, what, "UPDATE", diffFields(valueWords(before), valueWords(after)), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

/// Retire a value (it stays on the documents that record it), or bring it back. Retiring asks the reason.
export async function setRegistrationValueRetired(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired(data, "RegistrationValue", async (tx, id, orgId) => {
    const v = await tx.registrationValue.findFirst({ where: { id, organisationId: orgId }, include: { body: { select: { labelEn: true } } } });
    return v ? { label: `Registration value · ${v.body.labelEn} · ${v.nameEn}`, retiredOn: v.retiredOn, apply: (d: Date | null) => tx.registrationValue.update({ where: { id }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ document types (FR-VND-002)

const typeWords = (t: { nameEn: string; nameMs: string | null; valueKinds: string[]; expires: boolean | null; mandatoryAtRegistration: boolean | null; notApplicableAllowed: boolean | null; governingSource: string; provenance: string; retiredOn?: Date | null }, bodyName: string | null) => ({
  name: t.nameEn,
  nameInMalay: t.nameMs,
  registrationBody: bodyName,
  valuesRecorded: t.valueKinds.length ? t.valueKinds.map((k) => VALUE_KIND_LABEL[k as RegistrationValueKind]?.en ?? k).join(", ") : null,
  expires: triWords(t.expires, "Carries an expiry", "Does not expire"),
  mandatoryAtRegistration: triWords(t.mandatoryAtRegistration, "Mandatory for every registration", "Not mandatory"),
  notApplicableAllowed: triWords(t.notApplicableAllowed, "May be recorded as not applicable", "May not be recorded as not applicable"),
  governingSource: t.governingSource || null,
  whereItComesFrom: prov(t.provenance),
  retiredOn: t.retiredOn ? retiredWords(t.retiredOn) : null,
});

/// Add or change a document type. Its three switches may be left not set: each then blocks the act it governs, naming itself.
export async function saveDocumentType(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    code: r.code("code", "Code"),
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    nameMs: r.optionalText("nameMs"),
    bodyId: r.optionalText("bodyId"),
    expires: tri(r.choice("expires", "Whether it expires", TRI)),
    mandatoryAtRegistration: tri(r.choice("mandatoryAtRegistration", "Mandatory for every registration", TRI)),
    notApplicableAllowed: tri(r.choice("notApplicableAllowed", "May be not applicable", TRI)),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  // The shared multi-select posts its choices as one newline-joined field (splitValues).
  const posted = splitValues(data.get("valueKinds"));
  const valueKinds = posted.filter((k): k is RegistrationValueKind => (REGISTRATION_VALUE_KINDS as readonly string[]).includes(k));
  if (valueKinds.length !== posted.length) return { ok: false, errors: { valueKinds: "A value kind chosen is not one of the available options." } };
  const reason = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = id ? await tx.supplierDocumentType.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const code = before?.code ?? v.code;
    const body = v.bodyId ? await tx.registrationBody.findFirst({ where: { id: v.bodyId, organisationId: org.id } }) : null;
    const fs = documentTypeFaults({ ...v, code, valueKinds }, { codeTaken: !before && !!(await tx.supplierDocumentType.findFirst({ where: { organisationId: org.id, code }, select: { id: true } })), bodyExists: !!body });
    if (fs.length) return refusal(fs);
    // A switch judged on documents already on file changes only with the reason.
    if (before && !reason && (before.expires !== v.expires || before.mandatoryAtRegistration !== v.mandatoryAtRegistration || before.notApplicableAllowed !== v.notApplicableAllowed || before.bodyId !== v.bodyId) && (await tx.supplierDocument.count({ where: { typeId: before.id } })) > 0) {
      return { ok: false, errors: { reason: "Documents of this type are on file: say why its setting changes." } };
    }
    const row = { nameEn: v.nameEn, nameMs: v.nameMs, bodyId: v.bodyId, valueKinds, expires: v.expires, mandatoryAtRegistration: v.mandatoryAtRegistration, notApplicableAllowed: v.notApplicableAllowed, governingSource: v.governingSource, provenance: v.provenance!, sortOrder: v.sortOrder };
    const bodyName = async (bid: string | null) => (bid ? ((await tx.registrationBody.findFirst({ where: { id: bid } }))?.labelEn ?? "A body no longer configured") : null);
    if (!before) {
      const created = await tx.supplierDocumentType.create({ data: { organisationId: org.id, code, ...row } });
      await audit(tx, org.id, "SupplierDocumentType", created.id, `Supplier document type · ${row.nameEn}`, "CREATE", diffFields(null, typeWords(created, body?.labelEn ?? null)));
    } else {
      const after = await tx.supplierDocumentType.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "SupplierDocumentType", before.id, `Supplier document type · ${row.nameEn}`, "UPDATE", diffFields(typeWords(before, await bodyName(before.bodyId)), typeWords(after, body?.labelEn ?? null)), reason);
    }
    return done();
  });
}

/// Retire a document type (documents of it stay on file and keep their state), or bring it back.
export async function setDocumentTypeRetired(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired(data, "SupplierDocumentType", async (tx, id, orgId) => {
    const t = await tx.supplierDocumentType.findFirst({ where: { id, organisationId: orgId } });
    return t ? { label: `Supplier document type · ${t.nameEn}`, retiredOn: t.retiredOn, apply: (d: Date | null) => tx.supplierDocumentType.update({ where: { id }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ the register's lists

/// Add or change an entity type or a country.
export async function saveListValue(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    list: r.choice("list", "List", SUPPLIER_LIST_KINDS),
    code: r.code("code", "Code"),
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    nameMs: r.optionalText("nameMs"),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = id ? await tx.supplierListValue.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const list = (before?.list ?? v.list) as SupplierListKind | null;
    const code = before?.code ?? v.code;
    const fs = listValueFaults({ ...v, code }, { kindListed: !!list, codeTaken: !before && !!list && !!(await tx.supplierListValue.findFirst({ where: { organisationId: org.id, list, code }, select: { id: true } })) });
    if (fs.length) return refusal(fs);
    const words = (x: { nameEn: string; nameMs: string | null; provenance: string }) => ({ name: x.nameEn, nameInMalay: x.nameMs, whereItComesFrom: prov(x.provenance) });
    const what = `${LIST_KIND_SINGULAR[list!].en} · ${v.nameEn}`;
    if (!before) {
      const created = await tx.supplierListValue.create({ data: { organisationId: org.id, list: list!, code, nameEn: v.nameEn, nameMs: v.nameMs, provenance: v.provenance!, sortOrder: v.sortOrder } });
      await audit(tx, org.id, "SupplierListValue", created.id, what, "CREATE", diffFields(null, words(created)));
    } else {
      const after = await tx.supplierListValue.update({ where: { id: before.id }, data: { nameEn: v.nameEn, nameMs: v.nameMs, provenance: v.provenance!, sortOrder: v.sortOrder } });
      await audit(tx, org.id, "SupplierListValue", before.id, what, "UPDATE", diffFields(words(before), words(after)), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

export async function setListValueRetired(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired(data, "SupplierListValue", async (tx, id, orgId) => {
    const v = await tx.supplierListValue.findFirst({ where: { id, organisationId: orgId } });
    return v ? { label: `${LIST_KIND_SINGULAR[v.list as SupplierListKind].en} · ${v.nameEn}`, retiredOn: v.retiredOn, apply: (d: Date | null) => tx.supplierListValue.update({ where: { id }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ the policy

/// The register's policy (6.15 §2). Every field may be left not set; nothing is defaulted.
export async function saveSupplierPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    verificationNoticeEn: r.optionalText("verificationNoticeEn"),
    verificationNoticeMs: r.optionalText("verificationNoticeMs"),
    noticeProvenance: r.choice("noticeProvenance", "Where the notice comes from", PROVENANCE),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
  };
  if ((v.verificationNoticeEn || v.verificationNoticeMs) && !v.noticeProvenance) r.reject("noticeProvenance", "Say where the notice comes from.");
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.supplierPolicy.findUnique({ where: { organisationId: org.id } });
    const words = (p: typeof v | NonNullable<typeof before> | null) => (p ? { verificationNotice: p.verificationNoticeEn ?? "Not set", verificationNoticeInMalay: p.verificationNoticeMs ?? "Not set", noticeFrom: prov(p.noticeProvenance), governingSource: p.governingSource || null } : null);
    if (!before) {
      const created = await tx.supplierPolicy.create({ data: { organisationId: org.id, ...v } });
      await audit(tx, org.id, "SupplierPolicy", created.id, "Supplier register · policy", "CREATE", diffFields(null, words(v)!), String(data.get("reason") ?? ""));
    } else {
      await tx.supplierPolicy.update({ where: { id: before.id }, data: v });
      await audit(tx, org.id, "SupplierPolicy", before.id, "Supplier register · policy", "UPDATE", diffFields(words(before), words(v)!), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

// ------------------------------------------------------------------ retiring

async function setRetired(data: FormData, entity: string, find: (tx: Tx, id: string, orgId: string) => Promise<{ label: string; retiredOn: Date | null; apply: (d: Date | null) => Promise<unknown> } | null>): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const retire = String(data.get("retire") ?? "") === "yes";
  const reason = String(data.get("reason") ?? "").trim();
  if (retire && !reason) return { ok: false, errors: { reason: "Give the reason." } };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const row = await find(tx, id, org.id);
    if (!row) return GONE;
    const today = todayIn(new Date(), org.timeZone);
    if (!today) return NO_ZONE;
    const to = retire ? dayToDate(today) : null;
    await row.apply(to);
    await audit(tx, org.id, entity, id, row.label, "UPDATE", diffFields({ retiredOn: retiredWords(row.retiredOn) }, { retiredOn: retiredWords(to) }), reason);
    return done();
  });
}
