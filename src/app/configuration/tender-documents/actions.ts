"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { storedDay, todayIn } from "@/lib/dates";
import { formatSen, parseSen } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { ENTITY } from "@/lib/tender-docs/audit-view";
import { conditionsPolicyFaults, conditionsPolicyFaultText } from "@/lib/tender-docs/config-conditions";
import { loadTaxonomyUses } from "@/lib/tender-docs/repo";
import { methodPackFault, PART_CONFIG_FAULT_TEXT, partConfigFaults, POLICY_FAULT_TEXT, policyFaults, policyFaultText } from "@/lib/tender-docs/config";
import { NOT_SET, PACK_KIND_LABEL, PART_CONTENT_LABEL, PART_ROLE_LABEL, PART_SOURCE_LABEL, yesNoNotSet } from "@/lib/tender-docs/labels";
import { formatPct } from "@/lib/tender-docs/percent";
import { PACK_KINDS, PART_CONTENTS, PART_ROLES, PART_SOURCES, type ConfiguredPart, type Provenance } from "@/lib/tender-docs/types";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

/**
 * Configuration › Tender documents (6.4 plan §5): the parts each pack kind assembles on each
 * basis, the tender documents' policy, and each sourcing method's document pack. Nothing is
 * shipped set (Q-8: a customer's part lists are its go-live seed). Each write locks what it
 * edits — the organisation for a create — re-reads it, runs the lib's check
 * (`tender-docs/config.ts`) on what it read, and writes it with its before/after audit row,
 * in words, in one transaction. Every value set says where it came from.
 */

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PROVENANCE_WORDS: Record<(typeof PROVENANCE)[number], string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const PATH = "/configuration/tender-documents";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };
const GONE: FormState = { ok: false, message: "That record no longer exists. Reload the page." };
const RESTORE_NO_ZONE: FormState = { ok: false, message: "The organisation's time zone is not set, so whether another live part already takes this one's role cannot be judged. Set it under Configuration, Organisation, then restore the part." };
const TRI = ["yes", "no", "unset"] as const;
const tri = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);
const prov = (p: string | null | undefined) => (p ? (PROVENANCE_WORDS[p as (typeof PROVENANCE)[number]] ?? NOT_SET) : NOT_SET);

async function organisation(): Promise<{ id: string; timeZone: string | null } | null> {
  return db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
}

async function lockOrganisation(tx: Tx, organisationId: string) {
  await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR UPDATE`;
}

function done(): FormState {
  revalidatePath(PATH);
  revalidatePath("/sourcing");
  return { ok: true };
}

// ------------------------------------------------------------------ parts

/// A part in words, for its trail: labels, never codes.
async function partWords(tx: Tx, organisationId: string, p: Omit<ConfiguredPart, "retiredOn"> & { retiredOn?: string | null }) {
  const [basis, template, unit] = [
    p.contractBasisCode ? await tx.contractBasis.findFirst({ where: { organisationId, code: p.contractBasisCode }, select: { nameEn: true } }) : null,
    p.templateCode ? await tx.documentTemplate.findFirst({ where: { organisationId, code: p.templateCode }, select: { nameEn: true } }) : null,
    p.ownerOrgUnitCode ? await tx.orgUnit.findFirst({ where: { organisationId, code: p.ownerOrgUnitCode }, select: { nameEn: true } }) : null,
  ];
  return {
    code: p.code,
    documentPack: PACK_KIND_LABEL[p.packKind],
    contractBasis: p.contractBasisCode ? (basis?.nameEn ?? "A basis no longer configured") : "Every basis",
    printedNumber: p.printedNumber,
    labelEn: p.labelEn,
    labelMs: p.labelMs,
    role: PART_ROLE_LABEL[p.role],
    content: PART_CONTENT_LABEL[p.content],
    source: PART_SOURCE_LABEL[p.source],
    mandatory: yesNoNotSet(p.mandatory),
    inTenderTableDocument: yesNoNotSet(p.inTableDocument),
    returnedByTheBidder: yesNoNotSet(p.returnedByBidder ?? null),
    returnAnswerFrom: p.returnedByBidder == null ? null : prov(p.returnedByBidderProvenance ?? null),
    preparedBy: p.ownerOrgUnitCode ? (unit?.nameEn ?? "An office no longer configured") : NOT_SET,
    template: p.templateCode ? (template?.nameEn ?? "A template no longer configured") : null,
    governingSource: p.governingSource || null,
    whereItComesFrom: prov(p.provenance),
    retiredOn: p.retiredOn ?? null,
  };
}

/// Add or change a configured part (FR-DOC-001, 002, 013).
export async function saveTenderPart(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation();
  if (!org) return NO_ORG;
  const today = todayIn(new Date(), org.timeZone);
  if (!today) return { ok: false, message: "The organisation's time zone is not set, so a part's dates cannot be judged. Set it under Configuration, Organisation." };
  const id = String(data.get("id") ?? "").trim() || undefined;
  const r = new FormReader(data);
  const v = {
    code: r.text("code", "Code", { required: true, max: 60 }),
    packKind: r.choice("packKind", "Document pack", PACK_KINDS.filter((k) => k !== "NONE"), { required: true }),
    contractBasisCode: r.optionalText("contractBasisCode"),
    printedNumber: r.text("printedNumber", "Printed number", { required: true, max: 20 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    labelEn: r.text("labelEn", "Name", { required: true, max: 400 }),
    labelMs: r.optionalText("labelMs"),
    role: r.choice("role", "What the part is", PART_ROLES, { required: true }),
    content: r.choice("content", "Content", PART_CONTENTS, { required: true }),
    source: r.choice("source", "Where its content comes from", PART_SOURCES, { required: true }),
    mandatory: tri(r.choice("mandatory", "Mandatory", TRI, { required: true })),
    inTableDocument: tri(r.choice("inTableDocument", "In the Tender Table Document", TRI, { required: true })),
    returnedByBidder: tri(r.choice("returnedByBidder", "Returned by the bidder", TRI, { required: true })),
    returnedByBidderProvenance: r.choice("returnedByBidderProvenance", "Where the return answer comes from", PROVENANCE) as Provenance | null,
    ownerOrgUnitCode: r.optionalText("ownerOrgUnitCode"),
    templateCode: r.optionalText("templateCode"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed || !v.packKind || !v.role || !v.content || !v.source || !v.provenance) return { ok: false, errors: r.errors };
  const part = { ...v, packKind: v.packKind, role: v.role, content: v.content, source: v.source, provenance: v.provenance as Provenance, returnedByBidderProvenance: v.returnedByBidder == null ? null : v.returnedByBidderProvenance };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const [others, bases, templates, units, before] = [
      await tx.tenderDocumentPart.findMany({ where: { organisationId: org.id } }),
      await tx.contractBasis.findMany({ where: { organisationId: org.id }, select: { code: true } }),
      await tx.documentTemplate.findMany({ where: { organisationId: org.id }, select: { code: true } }),
      await tx.orgUnit.findMany({ where: { organisationId: org.id }, select: { code: true } }),
      id ? await tx.tenderDocumentPart.findFirst({ where: { id, organisationId: org.id } }) : null,
    ];
    if (id && !before) return GONE;
    const faults = partConfigFaults({ ...part, id }, { others: others.map((o) => ({ ...o, retiredOn: o.retiredOn ? storedDay(o.retiredOn) : null })), bases: bases.map((b) => b.code), templates: templates.map((t) => t.code), units: units.map((u) => u.code), today });
    if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [String(f.data?.field ?? "code"), PART_CONFIG_FAULT_TEXT[f.code]])) };
    if (!before) {
      const row = await tx.tenderDocumentPart.create({ data: { organisationId: org.id, ...part } });
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: ENTITY.config, entityId: row.id, entityLabel: `Tender document part · ${part.labelEn}`, reason }, "CREATE", diffFields(null, await partWords(tx, org.id, part)));
    } else {
      await tx.tenderDocumentPart.update({ where: { id: before.id }, data: part });
      const changes = diffFields(await partWords(tx, org.id, { ...before, provenance: before.provenance as Provenance, retiredOn: before.retiredOn ? storedDay(before.retiredOn) : null }), await partWords(tx, org.id, { ...part, retiredOn: before.retiredOn ? storedDay(before.retiredOn) : null }));
      if (changes.length) await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: ENTITY.config, entityId: before.id, entityLabel: `Tender document part · ${part.labelEn}`, reason }, "UPDATE", changes);
    }
    return done();
  });
}

/// Retire a part from a day (a pack started after it does not take it), with the reason; or restore it.
export async function retireTenderPart(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const on = r.date("retiredOn", "Retired from", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "TenderDocumentPart" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.tenderDocumentPart.findFirst({ where: { id, organisationId: org.id }, select: { labelEn: true, retiredOn: true } });
    if (!before) return GONE;
    await tx.tenderDocumentPart.update({ where: { id }, data: { retiredOn: on } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: ENTITY.config, entityId: id, entityLabel: `Tender document part · ${before.labelEn}`, reason }, "UPDATE", diffFields({ retiredOn: before.retiredOn ? storedDay(before.retiredOn) : null }, { retiredOn: storedDay(on) }));
    return done();
  });
}

export async function restoreTenderPart(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why it is restored." } };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.tenderDocumentPart.findFirst({ where: { id, organisationId: org.id } });
    if (!before) return GONE;
    // Whether another live part takes the role is judged on the organisation's day; unset blocks, never UTC's day.
    const today = todayIn(new Date(), org.timeZone);
    if (!today) return RESTORE_NO_ZONE;
    const others = await tx.tenderDocumentPart.findMany({ where: { organisationId: org.id } });
    const [bases, templates, units] = [
      await tx.contractBasis.findMany({ where: { organisationId: org.id }, select: { code: true } }),
      await tx.documentTemplate.findMany({ where: { organisationId: org.id }, select: { code: true } }),
      await tx.orgUnit.findMany({ where: { organisationId: org.id }, select: { code: true } }),
    ];
    // Restoring must not put two live parts in one role at one reach.
    const clash = partConfigFaults({ ...before, provenance: before.provenance as Provenance, id }, { others: others.map((o) => ({ ...o, retiredOn: o.retiredOn ? storedDay(o.retiredOn) : null })), bases: bases.map((b) => b.code), templates: templates.map((t) => t.code), units: units.map((u) => u.code), today });
    const role = clash.find((f) => f.code === "ROLE_TAKEN");
    if (role) return { ok: false, message: PART_CONFIG_FAULT_TEXT.ROLE_TAKEN };
    await tx.tenderDocumentPart.update({ where: { id }, data: { retiredOn: null } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: ENTITY.config, entityId: id, entityLabel: `Tender document part · ${before.labelEn}`, reason }, "UPDATE", diffFields({ retiredOn: before.retiredOn ? storedDay(before.retiredOn) : null }, { retiredOn: null }));
    return done();
  });
}

// ------------------------------------------------------------------ policy

const policyWords = (p: Record<string, unknown>) => ({
  restrictionStampEn: (p.restrictionStampTextEn as string | null) ?? NOT_SET,
  restrictionStampMs: (p.restrictionStampTextMs as string | null) ?? NOT_SET,
  restrictionAskedAs: (p.restrictionLabelEn as string | null) ?? NOT_SET,
  restrictionComesFrom: prov(p.restrictionProvenance as string | null),
  assuranceRequired: yesNoNotSet(p.assuranceRequired as boolean | null),
  assuranceComesFrom: prov(p.assuranceProvenance as string | null),
  regulatorPermitList: (p.regulatorPermitTaxonomyName as string | null) ?? NOT_SET,
  ladDailyRate: p.ladDailyPct == null ? NOT_SET : formatPct(String(p.ladDailyPct)),
  ladDailyRateComesFrom: prov(p.ladDailyPctProvenance as string | null),
  firstCertificateFloor: p.firstCertificateFloor == null ? NOT_SET : formatSen(parseSen(String(p.firstCertificateFloor))),
  firstCertificatePercentage: p.firstCertificatePct == null ? NOT_SET : formatPct(String(p.firstCertificatePct)),
  firstCertificateComesFrom: prov(p.firstCertificateProvenance as string | null),
  insuranceBeyondDefectsPeriod: p.insuranceExtraMonths == null ? NOT_SET : `${p.insuranceExtraMonths} months ${p.insuranceExtraDays} days`,
  insuranceBeyondComesFrom: prov(p.insuranceExtraProvenance as string | null),
  designAndBuildInsuranceBeyond: p.dbInsuranceExtraMonths == null ? NOT_SET : `${p.dbInsuranceExtraMonths} months ${p.dbInsuranceExtraDays} days`,
  designAndBuildInsuranceComesFrom: prov(p.dbInsuranceExtraProvenance as string | null),
  governingSource: (p.governingSource as string) || null,
});

/// Save the tender documents' policy. Every value nullable: unset reads "Not set" where used, never a default.
export async function saveTenderPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    restrictionStampTextEn: r.optionalText("restrictionStampTextEn"),
    restrictionStampTextMs: r.optionalText("restrictionStampTextMs"),
    restrictionLabelEn: r.optionalText("restrictionLabelEn"),
    restrictionProvenance: r.choice("restrictionProvenance", "Where it comes from", PROVENANCE),
    assuranceRequired: tri(r.choice("assuranceRequired", "Assurance confirmations required", TRI)),
    assuranceProvenance: r.choice("assuranceProvenance", "Where it comes from", PROVENANCE),
    ladDailyPct: r.optionalText("ladDailyPct"),
    ladDailyPctProvenance: r.choice("ladDailyPctProvenance", "Where it comes from", PROVENANCE),
    firstCertificateFloor: r.money("firstCertificateFloor", "First certificate floor"),
    firstCertificatePct: r.optionalText("firstCertificatePct"),
    firstCertificateProvenance: r.choice("firstCertificateProvenance", "Where it comes from", PROVENANCE),
    insuranceExtraMonths: r.int("insuranceExtraMonths", "Months", { min: 0 }),
    insuranceExtraDays: r.int("insuranceExtraDays", "Days", { min: 0 }),
    insuranceExtraProvenance: r.choice("insuranceExtraProvenance", "Where it comes from", PROVENANCE),
    dbInsuranceExtraMonths: r.int("dbInsuranceExtraMonths", "Months", { min: 0 }),
    dbInsuranceExtraDays: r.int("dbInsuranceExtraDays", "Days", { min: 0 }),
    dbInsuranceExtraProvenance: r.choice("dbInsuranceExtraProvenance", "Where it comes from", PROVENANCE),
    regulatorPermitTaxonomyCode: r.optionalText("regulatorPermitTaxonomyCode"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const faults = policyFaults(v);
  if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [String(f.data?.field), policyFaultText(f)])) };
  // A provenance only with its value: an answer removed takes its provenance with it.
  const value = {
    ...v,
    ladDailyPctProvenance: v.ladDailyPct == null ? null : v.ladDailyPctProvenance,
    firstCertificateProvenance: v.firstCertificateFloor == null ? null : v.firstCertificateProvenance,
    insuranceExtraProvenance: v.insuranceExtraMonths == null ? null : v.insuranceExtraProvenance,
    dbInsuranceExtraProvenance: v.dbInsuranceExtraMonths == null ? null : v.dbInsuranceExtraProvenance,
    restrictionProvenance: v.restrictionLabelEn || v.restrictionStampTextEn || v.restrictionStampTextMs ? v.restrictionProvenance : null,
    assuranceProvenance: v.assuranceRequired == null ? null : v.assuranceProvenance,
  };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    // Read under the lock: the list named is a plain list, not a taxonomy contracts are classified in (C2).
    const taxonomies = await tx.classificationTaxonomy.findMany({ where: { organisationId: org.id }, select: { code: true, nameEn: true } });
    const more = conditionsPolicyFaults(v, taxonomies.map((t) => t.code), await loadTaxonomyUses(org.id, tx));
    if (more.length) return { ok: false, errors: Object.fromEntries(more.map((f) => [String(f.data?.field), conditionsPolicyFaultText(f)])) };
    const taxonomyName = (code: string | null | undefined) => (code ? (taxonomies.find((t) => t.code === code)?.nameEn ?? "A list no longer configured") : null);
    const before = await tx.tenderDocumentPolicy.findUnique({ where: { organisationId: org.id } });
    const row = before ? await tx.tenderDocumentPolicy.update({ where: { id: before.id }, data: value }) : await tx.tenderDocumentPolicy.create({ data: { organisationId: org.id, ...value } });
    const changes = diffFields(before ? policyWords({ ...before, regulatorPermitTaxonomyName: taxonomyName(before.regulatorPermitTaxonomyCode) }) : null, policyWords({ ...value, regulatorPermitTaxonomyName: taxonomyName(value.regulatorPermitTaxonomyCode) }));
    if (!before || changes.length) await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: ENTITY.policy, entityId: row.id, entityLabel: "Tender documents policy", reason }, before ? "UPDATE" : "CREATE", changes);
    return done();
  });
}

// ------------------------------------------------------------------ a method's document pack

/// Which pack a sourcing method assembles (TENDER, QUOTATION, none), or not set; with its provenance.
export async function saveMethodDocumentPack(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const raw = r.choice("documentPackKind", "Document pack", [...PACK_KINDS, "unset"] as const, { required: true });
  const provenance = r.choice("documentPackKindProvenance", "Where it comes from", PROVENANCE);
  if (r.failed || !raw) return { ok: false, errors: r.errors };
  const kind = raw === "unset" ? null : raw;
  const fault = methodPackFault(kind, provenance);
  if (fault) return { ok: false, errors: { documentPackKindProvenance: POLICY_FAULT_TEXT.PROVENANCE_REQUIRED } };
  const v = { documentPackKind: kind, documentPackKindProvenance: kind == null ? null : provenance };
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "SourcingMethod" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.sourcingMethod.findFirst({ where: { id, organisationId: org.id }, select: { nameEn: true, documentPackKind: true, documentPackKindProvenance: true } });
    if (!before) return GONE;
    await tx.sourcingMethod.update({ where: { id }, data: v });
    const words = (x: { documentPackKind: string | null; documentPackKindProvenance: string | null }) => ({ documentPack: x.documentPackKind ? PACK_KIND_LABEL[x.documentPackKind as keyof typeof PACK_KIND_LABEL] : NOT_SET, documentPackComesFrom: prov(x.documentPackKindProvenance) });
    const changes = diffFields(words(before), words(v));
    if (changes.length) await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: "SourcingMethod", entityId: id, entityLabel: before.nameEn, reason: String(data.get("reason") ?? "") }, "UPDATE", changes);
    revalidatePath("/configuration/reference-data");
    return done();
  });
}
