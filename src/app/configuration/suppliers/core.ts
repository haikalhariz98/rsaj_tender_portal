import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { validLimit } from "@/lib/portal/apply";
import { ADDRESS_LIMIT_BOUNDS } from "@/lib/portal/register/address-limit";
import { documentTypeFaults, listValueFaults, valueFaults } from "@/lib/suppliers/config";
import { exercisesHoldingRank } from "@/lib/tender-docs/requirement-store";
import { bandPolicyFaults } from "@/lib/suppliers/expiry";
import { asHeading, LIST_KIND_SINGULAR, supplierFaultText, VALUE_KIND_LABEL } from "@/lib/suppliers/labels";
import { REGISTRATION_VALUE_KINDS, SUPPLIER_LIST_KINDS, type Finding, type RegistrationValueKind, type SupplierListKind } from "@/lib/suppliers/types";
import { bytesOfMegabytes, DECLARATION_KIND_WORDS, DECLARATION_KINDS, declarationTextErrors, megabytesOfBytes, registrationSettingErrors, type DeclarationKindName } from "@/lib/suppliers/registration-settings";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

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

async function organisation(scope: OrgScope) {
  return db.organisation.findUnique({ where: { id: scope.organisationId }, select: { id: true, timeZone: true } });
}
const lockOrganisation = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
function done(): FormState {
  revalidatePath(PATH);
  revalidatePath("/suppliers");
  return { ok: true };
}
const audit = (tx: Tx, actor: AuditActor, organisationId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(tx, { actor, organisationId, entity, entityId, entityLabel, reason }, action, changes);
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
  const actor = await requireStaff();
  const org = await organisation(actor);
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
    // 615-C1: a requirement that asks for a grade is compared by the ranks of its body's grades, read live, and cannot be edited once its pack has gone for approval. While such an exercise
    // stands (until its envelopes are opened) no rank of that body moves: any grade of it may be the one a bidder holds, so a change to any would change who qualifies.
    const holding = before && kind === "GRADE" && before.rank !== v.rank ? await exercisesHoldingRank(tx, org.id, bodyId) : [];
    const fs = valueFaults(
      { ...v, kind, code },
      {
        bodyExists: !!body,
        codeTaken: !before && siblings.some((x) => x.kind === kind && x.code === code),
        categoryCodes: siblings.filter((x) => x.kind === "CATEGORY").map((x) => x.code),
        gradeRanks: siblings.filter((x) => x.rank != null).map((x) => x.rank!),
        rankHeld: before ? { was: before.rank, byExercises: holding } : undefined,
      },
    );
    if (fs.length) return refusal(fs);
    const row = { nameEn: v.nameEn, nameMs: v.nameMs, parentCode: v.parentCode, rank: v.rank, valueCeiling: v.valueCeiling, ceilingProvenance: v.valueCeiling ? v.ceilingProvenance : null, governingSource: v.governingSource, provenance: v.provenance!, sortOrder: v.sortOrder };
    const what = `Registration value · ${asHeading(body!.labelEn)} · ${v.nameEn}`;
    if (!before) {
      const created = await tx.registrationValue.create({ data: { organisationId: org.id, bodyId, kind: kind!, code, ...row } });
      await audit(tx, toAuditActor(actor), org.id, "RegistrationValue", created.id, what, "CREATE", diffFields(null, valueWords(created)));
    } else {
      const after = await tx.registrationValue.update({ where: { id: before.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org.id, "RegistrationValue", before.id, what, "UPDATE", diffFields(valueWords(before), valueWords(after)), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

/// Retire a value (it stays on the documents that record it), or bring it back. Retiring asks the reason.
export async function setRegistrationValueRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return setRetired(actor, toAuditActor(actor), data, "RegistrationValue", async (tx, id, orgId) => {
    const v = await tx.registrationValue.findFirst({ where: { id, organisationId: orgId }, include: { body: { select: { labelEn: true } } } });
    return v ? { label: `Registration value · ${asHeading(v.body.labelEn)} · ${v.nameEn}`, retiredOn: v.retiredOn, apply: (d: Date | null) => tx.registrationValue.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ document types (FR-VND-002)

const typeWords = (t: { nameEn: string; nameMs: string | null; valueKinds: string[]; expires: boolean | null; mandatoryAtRegistration: boolean | null; notApplicableAllowed: boolean | null; hintEn: string | null; hintMs: string | null; recordsRate: boolean | null; repeatable: boolean | null; governingSource: string; provenance: string; retiredOn?: Date | null }, bodyName: string | null) => ({
  name: t.nameEn,
  nameInMalay: t.nameMs,
  registrationBody: bodyName,
  valuesRecorded: t.valueKinds.length ? t.valueKinds.map((k) => VALUE_KIND_LABEL[k as RegistrationValueKind]?.en ?? k).join(", ") : null,
  expires: triWords(t.expires, "Carries an expiry", "Does not expire"),
  mandatoryAtRegistration: triWords(t.mandatoryAtRegistration, "Mandatory for every registration", "Not mandatory"),
  notApplicableAllowed: triWords(t.notApplicableAllowed, "May be recorded as not applicable", "May not be recorded as not applicable"),
  whatTheApplicantIsTold: t.hintEn,
  whatTheApplicantIsToldInMalay: t.hintMs,
  recordsARate: triWords(t.recordsRate, "Records a rate", "Records no rate"),
  severalMayBeLodged: triWords(t.repeatable, "Several, each with a title", "One"),
  governingSource: t.governingSource || null,
  whereItComesFrom: prov(t.provenance),
  retiredOn: t.retiredOn ? retiredWords(t.retiredOn) : null,
});

/// Add or change a document type. Its three switches may be left not set: each then blocks the act it governs, naming itself.
export async function saveDocumentType(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
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
    // Phase 4b: what the applicant is told the document is, whether it carries a rate, whether several may be lodged.
    hintEn: r.optionalText("hintEn"),
    hintMs: r.optionalText("hintMs"),
    recordsRate: tri(r.choice("recordsRate", "Whether it records a rate", TRI)),
    repeatable: tri(r.choice("repeatable", "Whether several may be lodged", TRI)),
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
    if (before && !reason && (before.expires !== v.expires || before.mandatoryAtRegistration !== v.mandatoryAtRegistration || before.notApplicableAllowed !== v.notApplicableAllowed || before.bodyId !== v.bodyId || before.recordsRate !== v.recordsRate || before.repeatable !== v.repeatable) && (await tx.supplierDocument.count({ where: { typeId: before.id } })) > 0) {
      return { ok: false, errors: { reason: "Documents of this type are on file: say why its setting changes." } };
    }
    const row = { nameEn: v.nameEn, nameMs: v.nameMs, bodyId: v.bodyId, valueKinds, expires: v.expires, mandatoryAtRegistration: v.mandatoryAtRegistration, notApplicableAllowed: v.notApplicableAllowed, hintEn: v.hintEn, hintMs: v.hintMs, recordsRate: v.recordsRate, repeatable: v.repeatable, governingSource: v.governingSource, provenance: v.provenance!, sortOrder: v.sortOrder };
    const bodyName = async (bid: string | null) => (bid ? ((await tx.registrationBody.findFirst({ where: { id: bid, organisationId: actor.organisationId } }))?.labelEn ?? "A body no longer configured") : null);
    if (!before) {
      const created = await tx.supplierDocumentType.create({ data: { organisationId: org.id, code, ...row } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierDocumentType", created.id, `Supplier document type · ${row.nameEn}`, "CREATE", diffFields(null, typeWords(created, body?.labelEn ?? null)));
    } else {
      const after = await tx.supplierDocumentType.update({ where: { id: before.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org.id, "SupplierDocumentType", before.id, `Supplier document type · ${row.nameEn}`, "UPDATE", diffFields(typeWords(before, await bodyName(before.bodyId)), typeWords(after, body?.labelEn ?? null)), reason);
    }
    return done();
  });
}

/// Retire a document type (documents of it stay on file and keep their state), or bring it back.
export async function setDocumentTypeRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return setRetired(actor, toAuditActor(actor), data, "SupplierDocumentType", async (tx, id, orgId) => {
    const t = await tx.supplierDocumentType.findFirst({ where: { id, organisationId: orgId } });
    return t ? { label: `Supplier document type · ${t.nameEn}`, retiredOn: t.retiredOn, apply: (d: Date | null) => tx.supplierDocumentType.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ the register's lists

/// Add or change an entity type or a country.
export async function saveListValue(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    list: r.choice("list", "List", SUPPLIER_LIST_KINDS),
    code: r.code("code", "Code"),
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    nameMs: r.optionalText("nameMs"),
    // Phase 4a: the country's dial code, shown before the mobile number on the public form. Only a country has one.
    callingCode: r.optionalText("callingCode"),
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
    const fs = listValueFaults({ ...v, code }, { kindListed: !!list, list, codeTaken: !before && !!list && !!(await tx.supplierListValue.findFirst({ where: { organisationId: org.id, list, code }, select: { id: true } })) });
    if (fs.length) return refusal(fs);
    const words = (x: { nameEn: string; nameMs: string | null; provenance: string; callingCode?: string | null }) => ({ name: x.nameEn, nameInMalay: x.nameMs, ...(list === "COUNTRY" ? { dialCode: x.callingCode ?? "Not set" } : {}), whereItComesFrom: prov(x.provenance) });
    const what = `${LIST_KIND_SINGULAR[list!].en} · ${v.nameEn}`;
    if (!before) {
      const created = await tx.supplierListValue.create({ data: { organisationId: org.id, list: list!, code, nameEn: v.nameEn, nameMs: v.nameMs, callingCode: v.callingCode, provenance: v.provenance!, sortOrder: v.sortOrder } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierListValue", created.id, what, "CREATE", diffFields(null, words(created)));
    } else {
      const after = await tx.supplierListValue.update({ where: { id: before.id, organisationId: actor.organisationId }, data: { nameEn: v.nameEn, nameMs: v.nameMs, callingCode: v.callingCode, provenance: v.provenance!, sortOrder: v.sortOrder } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierListValue", before.id, what, "UPDATE", diffFields(words(before), words(after)), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

export async function setListValueRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return setRetired(actor, toAuditActor(actor), data, "SupplierListValue", async (tx, id, orgId) => {
    const v = await tx.supplierListValue.findFirst({ where: { id, organisationId: orgId } });
    return v ? { label: `${LIST_KIND_SINGULAR[v.list as SupplierListKind].en} · ${v.nameEn}`, retiredOn: v.retiredOn, apply: (d: Date | null) => tx.supplierListValue.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ the policy

/// The register's policy (6.15 §2). Every field may be left not set; nothing is defaulted.
export async function saveSupplierPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    verificationNoticeEn: r.optionalText("verificationNoticeEn"),
    verificationNoticeMs: r.optionalText("verificationNoticeMs"),
    noticeProvenance: r.choice("noticeProvenance", "Where the notice comes from", PROVENANCE),
    // Phase 4a: whether a contact must give an email AND a mobile number. Not set keeps "an email or a telephone". Tri-state: "" is not set.
    contactRule: r.choice("contactRule", "Contact rule", ["both", "either"] as const),
    contactRuleProvenance: r.choice("contactRuleProvenance", "Where the contact rule comes from", PROVENANCE),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
  };
  if ((v.verificationNoticeEn || v.verificationNoticeMs) && !v.noticeProvenance) r.reject("noticeProvenance", "Say where the notice comes from.");
  if (v.contactRule && !v.contactRuleProvenance) r.reject("contactRuleProvenance", "Say where the contact rule comes from.");
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.supplierPolicy.findUnique({ where: { organisationId: org.id } });
    // The contact rule is tri-state in the form and a nullable boolean in the table: "both" asks for an email AND a mobile number, "either" for one of them, not set keeps today's rule.
    const { contactRule, ...rest } = v;
    const row = { ...rest, contactNeedsEmailAndPhone: contactRule === "both" ? true : contactRule === "either" ? false : null, contactRuleProvenance: contactRule ? v.contactRuleProvenance : null };
    const ruleWords = (b: boolean | null | undefined) => (b == null ? "Not set: an email or a telephone is enough" : b ? "An email and a mobile number" : "An email or a mobile number");
    const words = (p: typeof row | NonNullable<typeof before> | null) => (p ? { verificationNotice: p.verificationNoticeEn ?? "Not set", verificationNoticeInMalay: p.verificationNoticeMs ?? "Not set", noticeFrom: prov(p.noticeProvenance), contactRule: ruleWords(p.contactNeedsEmailAndPhone), contactRuleFrom: prov(p.contactRuleProvenance), governingSource: p.governingSource || null } : null);
    if (!before) {
      const created = await tx.supplierPolicy.create({ data: { organisationId: org.id, ...row } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", created.id, "Supplier register · policy", "CREATE", diffFields(null, words(row)!), String(data.get("reason") ?? ""));
    } else {
      await tx.supplierPolicy.update({ where: { id: before.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", before.id, "Supplier register · policy", "UPDATE", diffFields(words(before), words(row)!), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

/**
 * How the public application form is opened: the notice about personal details (in English) and how
 * many applications it takes. Nothing is defaulted: until the notice and both limits are set, the form
 * says it is not open and names what is missing. Each figure says where it comes from.
 */
export async function savePortalIntake(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    personalDataNoticeEn: r.optionalText("personalDataNoticeEn"),
    personalDataNoticeMs: r.optionalText("personalDataNoticeMs"),
    personalDataProvenance: r.choice("personalDataProvenance", "Where the notice comes from", PROVENANCE),
    portalDailyLimit: r.int("portalDailyLimit", "Applications taken in any 24 hours", { min: 1 }),
    portalDailyLimitPerNumber: r.int("portalDailyLimitPerNumber", "Applications taken for one registration number in 24 hours", { min: 1 }),
    portalLimitProvenance: r.choice("portalLimitProvenance", "Where the limits come from", PROVENANCE),
    // RSEC-1(a): how many submissions one address may send in a window, counted in memory per server process.
    portalAddressAttempts: r.int("portalAddressAttempts", "Applications from one address", { min: ADDRESS_LIMIT_BOUNDS.attempts.min }),
    portalAddressMinutes: r.int("portalAddressMinutes", "Minutes they are counted over", { min: ADDRESS_LIMIT_BOUNDS.minutes.min }),
    portalAddressProvenance: r.choice("portalAddressProvenance", "Where the address limit comes from", PROVENANCE),
  };
  if ((v.portalAddressAttempts == null) !== (v.portalAddressMinutes == null)) r.reject(v.portalAddressAttempts == null ? "portalAddressAttempts" : "portalAddressMinutes", "Set both, or neither.");
  if ((v.portalAddressAttempts != null || v.portalAddressMinutes != null) && !v.portalAddressProvenance) r.reject("portalAddressProvenance", "Say where the address limit comes from.");
  if (v.portalAddressAttempts != null && v.portalAddressAttempts > ADDRESS_LIMIT_BOUNDS.attempts.max) r.reject("portalAddressAttempts", `Use a whole number from 1 to ${ADDRESS_LIMIT_BOUNDS.attempts.max.toLocaleString("en-GB")}.`);
  if (v.portalAddressMinutes != null && v.portalAddressMinutes > ADDRESS_LIMIT_BOUNDS.minutes.max) r.reject("portalAddressMinutes", `Use a whole number from 1 to ${ADDRESS_LIMIT_BOUNDS.minutes.max.toLocaleString("en-GB")}.`);
  if ((v.personalDataNoticeEn || v.personalDataNoticeMs) && !v.personalDataProvenance) r.reject("personalDataProvenance", "Say where the notice comes from.");
  if ((v.portalDailyLimit != null || v.portalDailyLimitPerNumber != null) && !v.portalLimitProvenance) r.reject("portalLimitProvenance", "Say where the limits come from.");
  if ((v.portalDailyLimit == null) !== (v.portalDailyLimitPerNumber == null)) r.reject(v.portalDailyLimit == null ? "portalDailyLimit" : "portalDailyLimitPerNumber", "Set both limits, or neither.");
  for (const f of ["portalDailyLimit", "portalDailyLimitPerNumber"] as const) if (v[f] != null && !validLimit(v[f]!)) r.reject(f, "Use a whole number from 1 to 100,000.");
  if (v.portalDailyLimit != null && v.portalDailyLimitPerNumber != null && v.portalDailyLimitPerNumber > v.portalDailyLimit) r.reject("portalDailyLimitPerNumber", "One number cannot take more than the whole day's limit.");
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.supplierPolicy.findUnique({ where: { organisationId: org.id } });
    const words = (p: typeof v | NonNullable<typeof before> | null) =>
      p
        ? {
            personalDataNotice: p.personalDataNoticeEn ?? "Not set",
            personalDataNoticeInMalay: p.personalDataNoticeMs ?? "Not set",
            noticeFrom: prov(p.personalDataProvenance),
            applicationsPerDay: p.portalDailyLimit ?? "Not set",
            applicationsPerNumberPerDay: p.portalDailyLimitPerNumber ?? "Not set",
            limitsFrom: prov(p.portalLimitProvenance),
            applicationsFromOneAddress: p.portalAddressAttempts != null && p.portalAddressMinutes != null ? `${p.portalAddressAttempts} in ${p.portalAddressMinutes} minutes` : "Not set",
            addressLimitFrom: prov(p.portalAddressProvenance),
          }
        : null;
    if (!before) {
      const created = await tx.supplierPolicy.create({ data: { organisationId: org.id, ...v } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", created.id, "Supplier register · online applications", "CREATE", diffFields(null, words(v)!), String(data.get("reason") ?? ""));
    } else {
      await tx.supplierPolicy.update({ where: { id: before.id, organisationId: actor.organisationId }, data: v });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", before.id, "Supplier register · online applications", "UPDATE", diffFields(words(before), words(v)!), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

// ------------------------------------------------------------------ registration online (Phase 4b)

/**
 * The settings the supplier's own registration is judged by: who to write to for help, how many files and bytes it may hold, the classes its uploads and bank statement take, and whether the
 * signed online declaration stands in for the paper. Every one may be left not set; each unset one closes what it governs and the supplier's screen names it. Each set one says where it comes from.
 */
export async function saveRegistrationSettings(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    helpEmail: r.optionalText("helpEmail"),
    helpPhone: r.optionalText("helpPhone"),
    helpProvenance: r.choice("helpProvenance", "Where the help contact comes from", PROVENANCE),
    maxFiles: r.int("maxFiles", "Files one registration may hold", { min: 1 }),
    maxMegabytes: r.int("maxMegabytes", "Megabytes one registration may hold", { min: 1 }),
    uploadLimitProvenance: r.choice("uploadLimitProvenance", "Where the limits come from", PROVENANCE),
    uploadClassId: r.optionalText("uploadClassId"),
    statementClassId: r.optionalText("statementClassId"),
    uploadClassProvenance: r.choice("uploadClassProvenance", "Where the classes come from", PROVENANCE),
    onlineDeclarationReplacesPaper: tri(r.choice("onlineDeclarationReplacesPaper", "Whether the online declaration replaces the paper", TRI)),
    onlineDeclarationProvenance: r.choice("onlineDeclarationProvenance", "Where that ruling comes from", PROVENANCE),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const classes = await db.documentClass.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true, classification: true } });
  const errors = registrationSettingErrors(v, { classes });
  if (errors.length) return { ok: false, errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  const maxBytes = bytesOfMegabytes(v.maxMegabytes);
  const row = {
    helpEmail: v.helpEmail,
    helpPhone: v.helpPhone,
    helpProvenance: v.helpEmail || v.helpPhone ? v.helpProvenance : null,
    uploadMaxFilesPerApplication: v.maxFiles,
    uploadMaxBytesPerApplication: maxBytes,
    uploadLimitProvenance: v.maxFiles != null ? v.uploadLimitProvenance : null,
    supplierUploadClassId: v.uploadClassId,
    supplierBankStatementClassId: v.statementClassId,
    uploadClassProvenance: v.uploadClassId || v.statementClassId ? v.uploadClassProvenance : null,
    onlineDeclarationReplacesPaper: v.onlineDeclarationReplacesPaper,
    onlineDeclarationProvenance: v.onlineDeclarationReplacesPaper != null ? v.onlineDeclarationProvenance : null,
  };
  const className = (id: string | null) => (id ? (classes.find((c) => c.id === id)?.nameEn ?? "A class no longer configured") : "Not set");
  const words = (p: { helpEmail: string | null; helpPhone: string | null; helpProvenance: string | null; uploadMaxFilesPerApplication: number | null; uploadMaxBytesPerApplication: bigint | null; uploadLimitProvenance: string | null; supplierUploadClassId: string | null; supplierBankStatementClassId: string | null; uploadClassProvenance: string | null; onlineDeclarationReplacesPaper: boolean | null; onlineDeclarationProvenance: string | null } | null) =>
    p
      ? {
          helpEmail: p.helpEmail ?? "Not set",
          helpPhone: p.helpPhone ?? "Not set",
          helpFrom: prov(p.helpProvenance),
          filesPerRegistration: p.uploadMaxFilesPerApplication ?? "Not set",
          megabytesPerRegistration: p.uploadMaxBytesPerApplication == null ? "Not set" : megabytesOfBytes(p.uploadMaxBytesPerApplication),
          limitsFrom: prov(p.uploadLimitProvenance),
          classOfUploads: className(p.supplierUploadClassId),
          classOfBankStatement: className(p.supplierBankStatementClassId),
          classesFrom: prov(p.uploadClassProvenance),
          onlineDeclarationReplacesPaper: triWords(p.onlineDeclarationReplacesPaper, "Replaces the paper declaration", "The paper declaration is still required"),
          rulingFrom: prov(p.onlineDeclarationProvenance),
        }
      : null;
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.supplierPolicy.findUnique({ where: { organisationId: org.id } });
    const reason = String(data.get("reason") ?? "");
    if (!before) {
      const created = await tx.supplierPolicy.create({ data: { organisationId: org.id, ...row } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", created.id, "Supplier register · registration online", "CREATE", diffFields(null, words(row)!), reason);
    } else {
      await tx.supplierPolicy.update({ where: { id: before.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", before.id, "Supplier register · registration online", "UPDATE", diffFields(words(before), words(row)!), reason);
    }
    return done();
  });
}

/**
 * A declaration's wording (FR-VND-005, FR-VND-006): the customer's, in English and Malay, versioned. A new wording is a new version, in force from the organisation's day it is saved and
 * superseding the one before it; a supplier mid-way is asked to read the new one again, because a signature names the wording it was shown. A version some supplier has signed is never edited in
 * place: its wording is what they signed. A version nobody has signed may be corrected, with the reason.
 */
export async function saveDeclarationText(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    kind: r.choice("kind", "Which declaration", DECLARATION_KINDS),
    bodyEn: r.text("bodyEn", "Wording", { required: true, max: 8000 }),
    bodyMs: r.optionalText("bodyMs"),
    provenance: r.choice("provenance", "Where the wording comes from", PROVENANCE),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
  };
  const reason = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  const errors = declarationTextErrors(v, DECLARATION_KINDS);
  if (errors.length) return { ok: false, errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  const today = todayIn(new Date(), org.timeZone);
  if (!today) return NO_ZONE;
  const words = (t: { kind: string; version: number; bodyEn: string; bodyMs: string | null; provenance: string; governingSource: string }) => ({
    declaration: DECLARATION_KIND_WORDS[t.kind as DeclarationKindName] ?? t.kind,
    version: t.version,
    wording: t.bodyEn,
    wordingInMalay: t.bodyMs ?? "Not set",
    whereItComesFrom: prov(t.provenance),
    governingSource: t.governingSource || null,
  });
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    // A wording being corrected is locked BEFORE the signatures are counted, after the organisation (the order a registration being sent takes them in: the organisation shared, then the texts
    // shared). A registration sent a moment before has then committed its signature and is counted; one sent a moment after waits for this to commit and signs the corrected wording it is then shown.
    if (id) await tx.$queryRaw`SELECT id FROM "DeclarationText" WHERE id = ${id} AND "organisationId" = ${org.id} FOR UPDATE`;
    const before = id ? await tx.declarationText.findFirst({ where: { id, organisationId: org.id }, include: { _count: { select: { signed: true } } } }) : null;
    if (id && !before) return GONE;
    if (before) {
      if (before._count.signed > 0) return { ok: false, message: `Version ${before.version} has been signed by ${before._count.signed} ${before._count.signed === 1 ? "supplier" : "suppliers"}, so its wording cannot change. Add a new version instead.` };
      if (!reason) return { ok: false, errors: { reason: "Say why the wording changes." } };
      const after = await tx.declarationText.update({ where: { id: before.id, organisationId: org.id }, data: { bodyEn: v.bodyEn, bodyMs: v.bodyMs, provenance: v.provenance!, governingSource: v.governingSource } });
      await audit(tx, toAuditActor(actor), org.id, "DeclarationText", before.id, `${DECLARATION_KIND_WORDS[before.kind as DeclarationKindName]} · version ${before.version}`, "UPDATE", diffFields(words(before), words(after)), reason);
      return done();
    }
    const latest = await tx.declarationText.aggregate({ where: { organisationId: org.id, kind: v.kind! }, _max: { version: true } });
    const created = await tx.declarationText.create({ data: { organisationId: org.id, kind: v.kind!, version: (latest._max.version ?? 0) + 1, bodyEn: v.bodyEn, bodyMs: v.bodyMs, provenance: v.provenance!, governingSource: v.governingSource, issuedOn: dayToDate(today) } });
    await audit(tx, toAuditActor(actor), org.id, "DeclarationText", created.id, `${DECLARATION_KIND_WORDS[v.kind!]} · version ${created.version}`, "CREATE", diffFields(null, { ...words(created), inForceFrom: formatDate(today) }), reason);
    return done();
  });
}

/// Withdraw a declaration's wording, or bring it back. A kind with no wording in force closes its step of the registration and names the missing text.
export async function setDeclarationTextRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return setRetired(actor, toAuditActor(actor), data, "DeclarationText", async (tx, id, orgId) => {
    const t = await tx.declarationText.findFirst({ where: { id, organisationId: orgId } });
    return t ? { label: `${DECLARATION_KIND_WORDS[t.kind as DeclarationKindName]} · version ${t.version}`, retiredOn: t.retiredOn, apply: (d: Date | null) => tx.declarationText.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn: d } }) } : null;
  });
}

// ------------------------------------------------------------------ retiring

async function setRetired(scope: OrgScope, by: AuditActor, data: FormData, entity: string, find: (tx: Tx, id: string, orgId: string) => Promise<{ label: string; retiredOn: Date | null; apply: (d: Date | null) => Promise<unknown> } | null>): Promise<FormState> {
  const org = await organisation(scope);
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
    await audit(tx, by, org.id, entity, id, row.label, "UPDATE", diffFields({ retiredOn: retiredWords(row.retiredOn) }, { retiredOn: retiredWords(to) }), reason);
    return done();
  });
}

// ------------------------------------------------------------------ a2: standing reasons and the standing rules

/// Add or change a reason on the maintained list (FR-VND-010): for a suspension or for a blacklisting.
export async function saveStandingReason(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    appliesTo: r.choice("appliesTo", "Given for", ["SUSPEND", "BLACKLIST"] as const, { required: !id }),
    code: r.code("code", "Code"),
    nameEn: r.text("nameEn", "Reason", { required: true, max: 400 }),
    nameMs: r.text("nameMs", "Reason (Malay)", { max: 400 }),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = id ? await tx.standingReason.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const code = before?.code ?? v.code;
    if (!code) return { ok: false, errors: { code: supplierFaultText({ code: "CODE_REQUIRED", level: "block" }) } };
    if (!before && (await tx.standingReason.findFirst({ where: { organisationId: org.id, code }, select: { id: true } }))) return { ok: false, errors: { code: supplierFaultText({ code: "CODE_TAKEN", level: "block" }) } };
    const words = (x: { appliesTo: string; nameEn: string; nameMs: string; governingSource: string; provenance: string }) => ({ givenFor: x.appliesTo === "SUSPEND" ? "Suspension" : "Blacklisting", reason: x.nameEn, reasonInMalay: x.nameMs || null, governingSource: x.governingSource || null, whereItComesFrom: prov(x.provenance) });
    if (!before) {
      const created = await tx.standingReason.create({ data: { organisationId: org.id, code, appliesTo: v.appliesTo!, nameEn: v.nameEn, nameMs: v.nameMs, governingSource: v.governingSource, provenance: v.provenance!, sortOrder: v.sortOrder } });
      await audit(tx, toAuditActor(actor), org.id, "StandingReason", created.id, `Standing reason · ${v.nameEn}`, "CREATE", diffFields(null, words(created)));
    } else {
      // Its use (suspension or blacklisting) is fixed once made: events recorded under it say which.
      const after = await tx.standingReason.update({ where: { id: before.id, organisationId: actor.organisationId }, data: { nameEn: v.nameEn, nameMs: v.nameMs, governingSource: v.governingSource, provenance: v.provenance!, sortOrder: v.sortOrder } });
      await audit(tx, toAuditActor(actor), org.id, "StandingReason", before.id, `Standing reason · ${v.nameEn}`, "UPDATE", diffFields(words(before), words(after)), String(data.get("reason") ?? ""));
    }
    return done();
  });
}

export async function setStandingReasonRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return setRetired(actor, toAuditActor(actor), data, "StandingReason", async (tx, id, orgId) => {
    const v = await tx.standingReason.findFirst({ where: { id, organisationId: orgId } });
    return v ? { label: `Standing reason · ${v.nameEn}`, retiredOn: v.retiredOn, apply: (d: Date | null) => tx.standingReason.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn: d } }) } : null;
  });
}

/**
 * The register's standing rules (FR-VND-008, OD-4, OD-5, OD-6, OD-7, condition 4): expiry bands, the
 * closing-day switch, suspension on lapse (with the reason it is shown with), the first-offence period,
 * whether a sale needs the register, the restriction's evidence and the consequence of an ineligible
 * bidder at an opening. Each may be left not set; a value set says where it came from. Nothing is defaulted.
 */
export async function saveStandingRules(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation(actor);
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    criticalDays: r.int("criticalDays", "Critical, days left", { min: 0 }),
    warningDays: r.int("warningDays", "Warning, days left", { min: 0 }),
    upcomingDays: r.int("upcomingDays", "Upcoming, days left", { min: 0 }),
    bandsProvenance: r.choice("bandsProvenance", "Where the bands come from", PROVENANCE),
    expiryOnClosingDayCounts: tri(r.choice("expiryOnClosingDayCounts", "A document expiring on the closing day", TRI)),
    closingDayProvenance: r.choice("closingDayProvenance", "Where that comes from", PROVENANCE),
    autoSuspendOnLapse: tri(r.choice("autoSuspendOnLapse", "Suspended when a mandatory document expires", TRI)),
    lapseReasonId: r.optionalText("lapseReasonId"),
    lapseProvenance: r.choice("lapseProvenance", "Where that comes from", PROVENANCE),
    blacklistFirstOffenceMonths: r.int("blacklistFirstOffenceMonths", "A first-offence blacklisting lasts (months)", { min: 1 }),
    blacklistProvenance: r.choice("blacklistProvenance", "Where the period comes from", PROVENANCE),
    registerRequiredForSale: tri(r.choice("registerRequiredForSale", "Documents sold only to suppliers on the register", TRI)),
    saleProvenance: r.choice("saleProvenance", "Where that comes from", PROVENANCE),
    restrictionEvidenceTypeId: r.optionalText("restrictionEvidenceTypeId"),
    restrictionProvenance: r.choice("restrictionProvenance", "Where that comes from", PROVENANCE),
    ineligibleBidConsequence: (() => { const c = r.choice("ineligibleBidConsequence", "A bidder found not eligible at the opening", ["ELIMINATE", "REPORT", "unset"] as const); return c === "unset" ? null : c; })(),
    ineligibleProvenance: r.choice("ineligibleProvenance", "Where that comes from", PROVENANCE),
  };
  const need = (set: boolean, field: string) => { if (set && !(v as Record<string, unknown>)[field]) r.reject(field, "Say where it comes from."); };
  need(v.criticalDays != null || v.warningDays != null || v.upcomingDays != null, "bandsProvenance");
  need(v.expiryOnClosingDayCounts != null, "closingDayProvenance");
  need(v.autoSuspendOnLapse != null, "lapseProvenance");
  need(v.blacklistFirstOffenceMonths != null, "blacklistProvenance");
  need(v.registerRequiredForSale != null, "saleProvenance");
  need(v.restrictionEvidenceTypeId != null, "restrictionProvenance");
  need(v.ineligibleBidConsequence != null, "ineligibleProvenance");
  const bandFaults = bandPolicyFaults(v);
  if (bandFaults.length) r.reject("criticalDays", bandFaults.map((f) => supplierFaultText(f)).join(" "));
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.supplierPolicy.findUnique({ where: { organisationId: org.id } });
    const reason = v.lapseReasonId ? await tx.standingReason.findFirst({ where: { id: v.lapseReasonId, organisationId: org.id } }) : null;
    if (v.lapseReasonId && (!reason || reason.appliesTo !== "SUSPEND")) return { ok: false, errors: { lapseReasonId: supplierFaultText({ code: "REASON_NOT_FOR_SUSPENSION", level: "block" }) } };
    const type = v.restrictionEvidenceTypeId ? await tx.supplierDocumentType.findFirst({ where: { id: v.restrictionEvidenceTypeId, organisationId: org.id } }) : null;
    if (v.restrictionEvidenceTypeId && !type) return { ok: false, errors: { restrictionEvidenceTypeId: supplierFaultText({ code: "TYPE_NOT_CONFIGURED", level: "block" }) } };
    const names = { reasons: await tx.standingReason.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true } }), types: await tx.supplierDocumentType.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true } }) };
    const words = (p: Partial<typeof v> | null) => ({
      expiryBands: p?.criticalDays != null ? `critical within ${p.criticalDays} days, warning within ${p.warningDays}, upcoming within ${p.upcomingDays}` : "Not set",
      bandsFrom: prov(p?.bandsProvenance),
      expiringOnClosingDay: triWords(p?.expiryOnClosingDayCounts ?? null, "Counts as valid", "Does not count as valid"),
      closingDayFrom: prov(p?.closingDayProvenance),
      suspendedOnLapse: triWords(p?.autoSuspendOnLapse ?? null, "Yes, derived on read", "No"),
      lapseReason: names.reasons.find((x) => x.id === p?.lapseReasonId)?.nameEn ?? null,
      lapseFrom: prov(p?.lapseProvenance),
      firstOffenceMonths: p?.blacklistFirstOffenceMonths ?? "Not set",
      periodFrom: prov(p?.blacklistProvenance),
      saleNeedsRegister: triWords(p?.registerRequiredForSale ?? null, "Yes", "No"),
      saleFrom: prov(p?.saleProvenance),
      restrictionEvidence: names.types.find((x) => x.id === p?.restrictionEvidenceTypeId)?.nameEn ?? "Not set",
      restrictionFrom: prov(p?.restrictionProvenance),
      ineligibleBidder: p?.ineligibleBidConsequence === "ELIMINATE" ? "Eliminated at the opening" : p?.ineligibleBidConsequence === "REPORT" ? "Reported to the committee" : "Not set",
      ineligibleFrom: prov(p?.ineligibleProvenance),
    });
    const why = String(data.get("reason") ?? "");
    if (!before) {
      const created = await tx.supplierPolicy.create({ data: { organisationId: org.id, ...v } });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", created.id, "Supplier register · standing rules", "CREATE", diffFields(null, words(v)), why);
    } else {
      await tx.supplierPolicy.update({ where: { id: before.id, organisationId: actor.organisationId }, data: v });
      await audit(tx, toAuditActor(actor), org.id, "SupplierPolicy", before.id, "Supplier register · standing rules", "UPDATE", diffFields(words(before), words(v)), why);
    }
    return done();
  });
}
