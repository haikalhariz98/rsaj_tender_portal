"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { checkDefFaults, configFaultText, targetFaults } from "@/lib/certificate/config";
import { CHECK_KIND_WORDS, KIND_WORDS, SUBJECT_WORDS } from "@/lib/certificate/labels";
import { CERTIFICATE_KINDS, ROUTING_CHECK_KINDS, ROUTING_SUBJECTS } from "@/lib/certificate/types";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { AuditActor } from "@/lib/auth/types";

/**
 * Routing sheet configuration (6.14 increment 1, FR-CRT-007, 008; ADR 0023, 0024): the types, each with its
 * internal checks and its ICC targets. Ships empty: the spec's targets (4 weeks, 6 weeks, 2 weeks up to 20%,
 * 52 and 41 days) are the customer's seed, never the product's. Every write is audited with its before and
 * after in the same transaction; a removal asks for a reason; a type in use is retired, never deleted. A sheet
 * already started keeps the type as it was frozen.
 */

const PATH = "/configuration/routing-sheets";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const CODE = /^[a-z][a-z0-9_]*$/;
const PCT = /^\d{1,5}(\.\d{1,4})?$/;

const done = (typeId?: string): FormState => {
  revalidatePath(PATH);
  if (typeId) revalidatePath(`${PATH}/${typeId}`);
  return { ok: true };
};

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, label: string, before: Record<string, unknown> | null, after: Record<string, unknown>, reason: string) {
  const changes = diffFields(before, after);
  if (before && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel: label, reason }, before ? "UPDATE" : "CREATE", changes);
}

const edgeWords = (v: boolean | null) => (v == null ? "not decided" : v ? "the band it closes: up to and including the edge" : "the band it opens: from the edge up");
const typeWords = (t: { labelEn: string; labelMs: string | null; subject: (typeof ROUTING_SUBJECTS)[number]; certificateKind: (typeof CERTIFICATE_KINDS)[number] | null; upperEdgeInclusive: boolean | null; provenance: string }) => ({
  name: t.labelEn,
  nameMalay: t.labelMs,
  drawnOver: SUBJECT_WORDS[t.subject].en,
  forCertificate: t.certificateKind ? KIND_WORDS[t.certificateKind].en : t.subject === "CERTIFICATE" ? "any kind" : null,
  valueOnABandEdge: edgeWords(t.upperEdgeInclusive),
  provenance: t.provenance,
});

export async function saveRoutingType(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const code = id ? null : r.text("code", "Code", { required: true, max: 60 }).trim();
  if (code && !CODE.test(code)) r.reject("code", "Small letters, digits and underscores, starting with a letter.");
  const edge = r.choice("upperEdgeInclusive", "A value exactly on a band's edge", ["upper", "lower"] as const);
  const v = {
    labelEn: r.text("labelEn", "Name", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    subject: r.choice("subject", "Drawn over", ROUTING_SUBJECTS, { required: true }),
    certificateKind: r.choice("certificateKind", "Certificate", CERTIFICATE_KINDS),
    templateId: r.optionalText("templateId"),
    upperEdgeInclusive: edge == null ? null : edge === "upper",
    provenance: r.choice("provenance", "Where it came from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (v.subject === "AWARD" && v.certificateKind) r.reject("certificateKind", "A sheet drawn over an award's route serves no certificate kind.");
  if (r.failed || !v.subject || !v.provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx) => {
    if (v.templateId && !(await tx.documentTemplate.findFirst({ where: { id: v.templateId, organisationId: o.id }, select: { id: true } }))) return { ok: false, errors: { templateId: "That template no longer exists." } } as FormState;
    if (id) {
      await tx.$queryRaw`SELECT id FROM "RoutingSheetType" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.routingSheetType.findFirst({ where: { id, organisationId: o.id } });
      if (!before) return { ok: false, message: "That routing sheet type no longer exists." } as FormState;
      const row = await tx.routingSheetType.update({ where: { id }, data: { ...v, subject: v.subject!, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "RoutingSheetType", row.id, row.labelEn, typeWords(before), typeWords(row), reason);
      return done(id);
    }
    if (await tx.routingSheetType.findFirst({ where: { organisationId: o.id, code: code! }, select: { id: true } })) return { ok: false, errors: { code: "Another type has that code." } } as FormState;
    const row = await tx.routingSheetType.create({ data: { organisationId: o.id, code: code!, ...v, subject: v.subject!, provenance: v.provenance! } });
    await audit(tx, toAuditActor(actor), o.id, "RoutingSheetType", row.id, row.labelEn, null, typeWords(row), reason);
    return done();
  });
}

export async function retireRoutingType(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg();
  if (!o?.today) return { ok: false, message: "Set the organisation's time zone first: a type retires from the organisation's day." };
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the type is retired." } };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RoutingSheetType" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.routingSheetType.findFirst({ where: { id, organisationId: o.id } });
    if (!before) return { ok: false, message: "That routing sheet type no longer exists." } as FormState;
    if (before.retiredOn) return { ok: false, message: `Already retired from ${storedDay(before.retiredOn)}.` } as FormState;
    await tx.routingSheetType.update({ where: { id }, data: { retiredOn: dayToDate(o.today!) } });
    await audit(tx, toAuditActor(actor), o.id, "RoutingSheetType", id, before.labelEn, { retiredFrom: null }, { retiredFrom: o.today }, reason);
    return done(id);
  });
}

async function onType(typeId: string, fn: (tx: Tx, t: { id: string; organisationId: string; labelEn: string }) => Promise<FormState>): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RoutingSheetType" WHERE id = ${typeId} FOR UPDATE`;
    const t = await tx.routingSheetType.findFirst({ where: { id: typeId, organisationId: o.id }, select: { id: true, organisationId: true, labelEn: true } });
    if (!t) return { ok: false, message: "That routing sheet type no longer exists." } as FormState;
    return fn(tx, t);
  });
}

const checkWords = (d: { order: number; kind: (typeof ROUTING_CHECK_KINDS)[number]; labelEn: string; labelMs: string | null; targetDays: number | null }, office: string | null) => ({ order: d.order, check: `${CHECK_KIND_WORDS[d.kind].en} (${d.labelEn})`, labelMalay: d.labelMs, office: office ?? "any officer", printedDays: d.targetDays });

export async function saveCheckDef(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const typeId = r.text("typeId", "Type", { required: true });
  const id = r.optionalText("id");
  const v = {
    order: r.int("order", "Place on the sheet", { min: 1, required: true }) ?? 0,
    kind: r.choice("kind", "Kind of check", ROUTING_CHECK_KINDS, { required: true }) ?? "CHECKED",
    labelEn: r.text("labelEn", "Label", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    officeCode: r.optionalText("officeCode"),
    targetDays: r.int("targetDays", "Printed days", { min: 1 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const res = await onType(typeId, async (tx, t) => {
    const rows = await tx.routingCheckDef.findMany({ where: { typeId: t.id } });
    const before = id ? rows.find((x) => x.id === id) : null;
    if (id && !before) return { ok: false, message: "That check is no longer on this type." };
    const roles = await tx.authorityRole.findMany({ where: { organisationId: t.organisationId, isCommittee: false }, select: { code: true, nameEn: true } });
    const fs = checkDefFaults(v, rows.filter((x) => x.id !== id), new Set(roles.map((x) => x.code)));
    if (fs.length) return { ok: false, message: configFaultText(fs) };
    const name = (c: string | null) => roles.find((x) => x.code === c)?.nameEn ?? null;
    const row = before ? await tx.routingCheckDef.update({ where: { id: before.id }, data: v }) : await tx.routingCheckDef.create({ data: { organisationId: t.organisationId, typeId: t.id, ...v } });
    await audit(tx, toAuditActor(actor), t.organisationId, "RoutingCheckDef", row.id, `${t.labelEn} · ${v.labelEn}`, before ? checkWords(before, name(before.officeCode)) : null, checkWords(v, name(v.officeCode)), String(data.get("reason") ?? ""));
    return { ok: true };
  });
  return res.ok ? done(typeId) : res;
}

export async function removeCheckDef(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const typeId = String(data.get("typeId") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the check comes off the sheet." } };
  const res = await onType(typeId, async (tx, t) => {
    const row = await tx.routingCheckDef.findFirst({ where: { id, typeId: t.id } });
    if (!row) return { ok: false, message: "That check is no longer on this type." };
    await tx.routingCheckDef.delete({ where: { id } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: t.organisationId, entity: "RoutingCheckDef", entityId: id, entityLabel: `${t.labelEn} · ${row.labelEn}`, reason }, "DELETE", snapshotFields(checkWords(row, null)));
    return { ok: true };
  });
  return res.ok ? done(typeId) : res;
}

const targetWords = (t: { pctMin: string | null; pctMax: string | null; targetDays: number; provenance: string }) => ({ band: t.pctMin == null && t.pctMax == null ? "every percentage" : `${t.pctMin == null ? "from nothing" : `from ${t.pctMin}%`} ${t.pctMax == null ? "upwards" : `to ${t.pctMax}%`}`, targetDays: t.targetDays, provenance: t.provenance });

export async function saveTarget(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const typeId = r.text("typeId", "Type", { required: true });
  const id = r.optionalText("id");
  const pctMin = r.optionalText("pctMin")?.trim() || null;
  const pctMax = r.optionalText("pctMax")?.trim() || null;
  if (pctMin && !PCT.test(pctMin)) r.reject("pctMin", "A percentage with at most four decimal places.");
  if (pctMax && !PCT.test(pctMax)) r.reject("pctMax", "A percentage with at most four decimal places.");
  const targetDays = r.int("targetDays", "Target days", { min: 1, required: true });
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || targetDays == null || !provenance) return { ok: false, errors: r.errors };
  const v = { pctMin, pctMax, targetDays };
  const res = await onType(typeId, async (tx, t) => {
    const rows = await tx.routingTarget.findMany({ where: { typeId: t.id } });
    const before = id ? rows.find((x) => x.id === id) : null;
    if (id && !before) return { ok: false, message: "That target is no longer on this type." };
    const str = (x: { pctMin: unknown; pctMax: unknown; targetDays: number }) => ({ pctMin: x.pctMin == null ? null : String(x.pctMin), pctMax: x.pctMax == null ? null : String(x.pctMax), targetDays: x.targetDays });
    const fs = targetFaults(v, rows.filter((x) => x.id !== id).map(str));
    if (fs.length) return { ok: false, message: configFaultText(fs) };
    const row = before ? await tx.routingTarget.update({ where: { id: before.id }, data: { ...v, provenance, notes } }) : await tx.routingTarget.create({ data: { organisationId: t.organisationId, typeId: t.id, ...v, provenance, notes } });
    await audit(tx, toAuditActor(actor), t.organisationId, "RoutingTarget", row.id, `${t.labelEn} · target`, before ? targetWords({ ...str(before), provenance: before.provenance }) : null, targetWords({ ...v, provenance }), String(data.get("reason") ?? ""));
    return { ok: true };
  });
  return res.ok ? done(typeId) : res;
}

export async function removeTarget(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const typeId = String(data.get("typeId") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the target comes off." } };
  const res = await onType(typeId, async (tx, t) => {
    const row = await tx.routingTarget.findFirst({ where: { id, typeId: t.id } });
    if (!row) return { ok: false, message: "That target is no longer on this type." };
    await tx.routingTarget.delete({ where: { id } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: t.organisationId, entity: "RoutingTarget", entityId: id, entityLabel: `${t.labelEn} · target`, reason }, "DELETE", snapshotFields(targetWords({ pctMin: row.pctMin?.toString() ?? null, pctMax: row.pctMax?.toString() ?? null, targetDays: row.targetDays, provenance: row.provenance })));
    return { ok: true };
  });
  return res.ok ? done(typeId) : res;
}
