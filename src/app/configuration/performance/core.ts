import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { db } from "@/lib/db";
import { dayToDate } from "@/lib/dates";
import { CONFIG_TEXT, decimalField } from "@/lib/evaluation/config";
import { exerciseOrg } from "@/lib/method/repo";
import { formIssueFaults, SCALE_TOPS, weightFromPercent } from "@/lib/performance/form";
import { performanceFaultText, performanceRefusal, weightText } from "@/lib/performance/labels";
import { snapshotOfForm, type FormRow } from "@/lib/performance/load";
import { FormReader } from "@/lib/validate";
import { requireStaff, staffForPermission, toAuditActor } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { eligibleFor } from "@/lib/auth/eligibility-store";
import { loadDraftMakers, noteDraftMaker } from "@/lib/auth/draft-makers";
import { draftIssueFault, issueReason } from "@/lib/auth/maker-checker";
import { twoPersonOn } from "@/lib/auth/policy-store";
import type { AuditActor, StaffActor } from "@/lib/auth/types";

/**
 * Settings › Performance forms (Phase 2 close-out stage D; ADR 0047 D6; ruling 10). A form belongs to exactly one contract type, with no general
 * fallback; it is drafted row by row and issued by someone who did not make the draft (`draftIssueFault`, and trigger `guard_draft_issue`), as a
 * schedule of rates is. Issuing freezes it: a report pins it with its snapshot. One issued form per type: a second is refused until the first is
 * retired. Shipped empty. Every write locks the form, re-reads it, checks it and writes it with its before/after audit row in one transaction.
 *
 * The draft's edits are the maker's (`configuration.draft`) and the issue the checker's (`configuration.issue`), called directly by `actions.ts`;
 * retiring an issued form is proposed there and runs here when a second person applies it.
 */

const PATH = "/configuration/performance";
const ENTITY = "PerformanceForm";
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const SCALES = SCALE_TOPS.map(String) as readonly string[];
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const GONE: FormState = { ok: false, message: "That form no longer exists. Reload the page." };
const NOT_DRAFT: FormState = { ok: false, message: "Only a draft is changed. An issued form is frozen." };

const formLabel = (f: { nameEn: string; version: number }) => `Performance form ${f.nameEn}, version ${f.version}`;

function done(): FormState {
  revalidatePath(PATH);
  return { ok: true };
}

async function audit(tx: Tx, actor: AuditActor, organisationId: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId, entity: ENTITY, entityId, entityLabel, reason }, action, changes);
}

async function lockForm(tx: Tx, orgId: string, formId: string): Promise<FormRow | null> {
  await tx.$queryRaw`SELECT id FROM "PerformanceForm" WHERE id = ${formId} AND "organisationId" = ${orgId} FOR UPDATE`;
  return tx.performanceForm.findFirst({ where: { id: formId, organisationId: orgId }, include: { criteria: { orderBy: { sortOrder: "asc" } }, grades: { orderBy: { lowerPct: "asc" } } } });
}

/// A draft edit: the form locked and re-read, refused unless a draft; an accepted edit puts the signed-in person on record as a maker.
async function inDraft(actor: StaffActor, formId: string, fn: (tx: Tx, orgId: string, f: FormRow) => Promise<FormState>): Promise<FormState> {
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const result = await db.$transaction(async (tx) => {
    const f = await lockForm(tx, o.id, formId);
    if (!f) return GONE;
    if (f.status !== "DRAFT") return NOT_DRAFT;
    const out = await fn(tx, o.id, f);
    if (out.ok) await noteDraftMaker(tx, { organisationId: o.id, entity: ENTITY, entityId: f.id, actor });
    return out;
  });
  return result.ok ? done() : result;
}

function dec(r: FormReader, data: FormData, name: string, opts: Parameters<typeof decimalField>[1]): string | null {
  const x = decimalField(String(data.get(name) ?? ""), opts);
  if ("fault" in x) {
    r.reject(name, CONFIG_TEXT[x.fault]);
    return null;
  }
  if (x.value == null) r.reject(name, "Required.");
  return x.value;
}

// ------------------------------------------------------------------ the form

/// Start a form for a contract type (a draft), or change a draft's name, scale and source.
export async function saveForm(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    scaleMax: r.choice("scaleMax", "Score range", SCALES, { required: true }),
    provenance: r.choice("provenance", "Source", PROVENANCE, { required: true }),
    source: r.text("source", "Reference", { max: 400 }),
  };
  const typeCode = id ? null : r.text("contractTypeCode", "Contract type", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const row = { nameEn: v.nameEn, scaleMax: Number(v.scaleMax), provenance: v.provenance!, source: v.source };
  const words = (x: typeof row) => ({ form: x.nameEn, scoreRange: x.scaleMax, provenance: x.provenance, source: x.source || null });
  if (id) {
    return inDraft(actor, id, async (tx, org, f) => {
      await tx.performanceForm.update({ where: { id: f.id, organisationId: org }, data: row });
      await audit(tx, toAuditActor(actor), org, f.id, formLabel({ ...f, nameEn: row.nameEn }), "UPDATE", diffFields(words(f), words(row)));
      return { ok: true };
    });
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    const type = await tx.contractType.findFirst({ where: { organisationId: o.id, code: typeCode! }, select: { nameEn: true } });
    if (!type) return { ok: false, errors: { contractTypeCode: "Choose one of the organisation's contract types." } } as FormState;
    const last = await tx.performanceForm.findFirst({ where: { organisationId: o.id, contractTypeCode: typeCode! }, orderBy: { version: "desc" }, select: { version: true } });
    // The series remembers a discarded draft's number, so it is never given again.
    const series = await tx.performanceFormSeries.findUnique({ where: { organisationId_contractTypeCode: { organisationId: o.id, contractTypeCode: typeCode! } }, select: { lastVersion: true } });
    const version = Math.max(series?.lastVersion ?? 0, last?.version ?? 0) + 1;
    await tx.performanceFormSeries.upsert({ where: { organisationId_contractTypeCode: { organisationId: o.id, contractTypeCode: typeCode! } }, create: { organisationId: o.id, contractTypeCode: typeCode!, lastVersion: version }, update: { lastVersion: version } });
    const f = await tx.performanceForm.create({ data: { organisationId: o.id, contractTypeCode: typeCode!, version, ...row } });
    await audit(tx, toAuditActor(actor), o.id, f.id, formLabel(f), "CREATE", diffFields(null, { ...words(row), contractType: type.nameEn, version, status: "Draft" }));
    await noteDraftMaker(tx, { organisationId: o.id, entity: ENTITY, entityId: f.id, actor });
    return done();
  });
}

/// Throw away a draft never issued (nothing can have pinned it), with a reason.
export async function discardForm(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why the draft is discarded." } };
  const result = await db.$transaction(async (tx) => {
    const f = await lockForm(tx, o.id, id);
    if (!f) return GONE;
    if (f.status !== "DRAFT") return NOT_DRAFT;
    await tx.configurationDraftMaker.deleteMany({ where: { organisationId: o.id, entity: ENTITY, entityId: f.id } });
    await tx.performanceForm.delete({ where: { id: f.id, organisationId: o.id } });
    await audit(tx, toAuditActor(actor), o.id, f.id, formLabel(f), "DELETE", snapshotFields({ form: f.nameEn, version: f.version, status: "Draft" }), reason);
    return { ok: true } as FormState;
  });
  return result.ok ? done() : result;
}

/// Retire an issued form: no new report opens on it; reports that pinned it keep their snapshot. Proposed, and applied by a second person.
export async function retireForm(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  if (!o.today) return { ok: false, message: "Set the organisation's time zone first." };
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why it is retired." } };
  const result = await db.$transaction(async (tx) => {
    const f = await lockForm(tx, o.id, id);
    if (!f) return GONE;
    if (f.status !== "ISSUED") return { ok: false, message: "Only an issued form is retired." } as FormState;
    await tx.performanceForm.update({ where: { id: f.id, organisationId: o.id }, data: { status: "RETIRED", retiredOn: dayToDate(o.today!) } });
    await audit(tx, toAuditActor(actor), o.id, f.id, formLabel(f), "UPDATE", diffFields({ status: "Issued", retiredOn: null }, { status: "Retired", retiredOn: o.today }), reason);
    return { ok: true } as FormState;
  });
  return result.ok ? done() : result;
}

/// Check the draft and issue it, by someone who did not make it. Its content is frozen: a report pins the form with its snapshot.
export async function issueForm(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.issue");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  if (actor.system) return { ok: false, message: "A loader run is not a person, so it cannot issue a performance form: a person issues it." };
  const id = String(data.get("id") ?? "");
  const now = toSecond(new Date());
  const eligible = (tx: Tx) => eligibleFor(tx, { organisationId: o.id, timeZone: actor.organisationTimeZone, now: new Date() }, "configuration.issue");
  // The issuer is never one of the makers. Said before anything is written; judged again under the form's lock.
  const makersNow = await loadDraftMakers(db, ENTITY, id);
  const early = draftIssueFault({ makerPersonIds: makersNow.personIds, issuerPersonId: actor.personId, twoPersonChanges: await twoPersonOn(db, o.id), eligiblePersonIds: await eligible(db) });
  if (early) return { ok: false, message: early.en };
  const begun = await beginAct(actor, data, "PerformanceForm.issuedBy", { personField: "issuedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  try {
    const result = await db.$transaction(async (tx) => {
      const f = await lockForm(tx, o.id, id);
      if (!f) return GONE;
      if (f.status !== "DRAFT") return NOT_DRAFT;
      const makers = await loadDraftMakers(tx, ENTITY, f.id);
      const twoPerson = await twoPersonOn(tx, o.id);
      const makerFault = draftIssueFault({ makerPersonIds: makers.personIds, issuerPersonId: actor.personId, twoPersonChanges: twoPerson, eligiblePersonIds: await eligible(tx) });
      if (makerFault) return { ok: false, message: makerFault.en } as FormState;
      // One issued form per contract type (ruling 10), judged under the organisation's lock so two issues cannot both pass.
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
      const otherIssued = !!(await tx.performanceForm.findFirst({ where: { organisationId: o.id, contractTypeCode: f.contractTypeCode, status: "ISSUED", id: { not: f.id } }, select: { id: true } }));
      const snap = snapshotOfForm(f);
      const faults = formIssueFaults({ name: f.nameEn, scaleMax: f.scaleMax, criteria: snap.criteria, bands: snap.bands, otherIssued });
      if (faults.length) return { ok: false, message: performanceRefusal("Not issued:", faults) } as FormState;
      await tx.performanceForm.update({ where: { id: f.id, organisationId: o.id }, data: { status: "ISSUED", issuedAt: now, issuedByPersonId: act.subjectPersonId } });
      await audit(tx, toAuditActor(actor), o.id, f.id, formLabel(f), "UPDATE", diffFields({ status: "Draft" }, { status: "Issued", issuedBy: actor.personName, madeBy: makers.names.join(", "), criteria: f.criteria.length, grades: f.grades.length }), issueReason("", { makerPersonIds: makers.personIds, issuerPersonId: actor.personId, twoPersonChanges: twoPerson }));
      await act.write(tx, f.id);
      return { ok: true, message: "Issued." } as FormState;
    });
    if (result.ok) revalidatePath(PATH);
    return result;
  } catch (e) {
    const refused = attributionRefusalState(e);
    if (refused) return refused;
    throw e;
  }
}

// ------------------------------------------------------------------ criteria and grades

export async function saveCriterion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const formId = String(data.get("formId") ?? "");
  const criterionId = String(data.get("criterionId") ?? "");
  const r = new FormReader(data);
  const v = {
    sortOrder: r.int("sortOrder", "Order", { min: 1 }),
    labelEn: r.text("labelEn", "Criterion", { required: true, max: 300 }),
    guideEn: r.text("guideEn", "How it is scored", { max: 4000 }),
    weight: weightFromPercent(String(data.get("weight") ?? "")),
  };
  if (v.weight == null) r.reject("weight", "A percentage from 0 to 100, up to two places, such as 25 or 12.5.");
  if (r.failed) return { ok: false, errors: r.errors };
  const row = { sortOrder: v.sortOrder, labelEn: v.labelEn, guideEn: v.guideEn, weight: v.weight! };
  const words = (x: { sortOrder: number; labelEn: string; guideEn: string; weight: { toString(): string } }) => ({ criterion: x.labelEn, order: x.sortOrder, weight: weightText(x.weight), guide: x.guideEn || null });
  return inDraft(actor, formId, async (tx, org, f) => {
    const self = criterionId ? f.criteria.find((c) => c.id === criterionId) : null;
    if (criterionId && !self) return GONE;
    const label = `${formLabel(f)} · ${row.labelEn}`;
    // The order is the next number unless one is given; two criteria never share one (and the table refuses it too).
    const sortOrder = row.sortOrder ?? self?.sortOrder ?? Math.max(0, ...f.criteria.map((c) => c.sortOrder)) + 1;
    if (f.criteria.some((c) => c.id !== self?.id && c.sortOrder === sortOrder)) return { ok: false, errors: { sortOrder: performanceFaultText({ code: "CRITERION_ORDER_REPEATED", level: "block" }) } } as FormState;
    const data2 = { ...row, sortOrder };
    if (self) {
      await tx.performanceCriterion.update({ where: { id: self.id, organisationId: org }, data: data2 });
      await audit(tx, toAuditActor(actor), org, f.id, label, "UPDATE", diffFields(words(self), words(data2)));
    } else {
      await tx.performanceCriterion.create({ data: { ...data2, organisationId: org, formId: f.id } });
      await audit(tx, toAuditActor(actor), org, f.id, label, "CREATE", diffFields(null, words(data2)));
    }
    return { ok: true };
  });
}

export async function removeCriterion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const formId = String(data.get("formId") ?? "");
  const criterionId = String(data.get("criterionId") ?? "");
  return inDraft(actor, formId, async (tx, org, f) => {
    const c = f.criteria.find((x) => x.id === criterionId);
    if (!c) return GONE;
    await tx.performanceCriterion.delete({ where: { id: c.id, organisationId: org } });
    await audit(tx, toAuditActor(actor), org, f.id, `${formLabel(f)} · ${c.labelEn}`, "DELETE", snapshotFields({ criterion: c.labelEn, weight: weightText(c.weight) }));
    return { ok: true };
  });
}

/// A grade from its lower bound up to the next grade's.
export async function saveBand(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const formId = String(data.get("formId") ?? "");
  const bandId = String(data.get("bandId") ?? "");
  const r = new FormReader(data);
  const v = { label: r.text("label", "Grade", { required: true, max: 60 }), lowerPct: dec(r, data, "lowerPct", { min: 0, max: 100 }) };
  if (r.failed) return { ok: false, errors: r.errors };
  const words = (x: { label: string; lowerPct: { toString(): string } }) => ({ grade: x.label, fromPercent: x.lowerPct.toString() });
  return inDraft(actor, formId, async (tx, org, f) => {
    const self = bandId ? f.grades.find((b) => b.id === bandId) : null;
    if (bandId && !self) return GONE;
    const row = { label: v.label, lowerPct: v.lowerPct! };
    const label = `${formLabel(f)} · grade ${row.label}`;
    if (self) {
      await tx.performanceGradeBand.update({ where: { id: self.id, organisationId: org }, data: row });
      await audit(tx, toAuditActor(actor), org, f.id, label, "UPDATE", diffFields(words(self), words(row)));
    } else {
      await tx.performanceGradeBand.create({ data: { ...row, sortOrder: f.grades.length, organisationId: org, formId: f.id } });
      await audit(tx, toAuditActor(actor), org, f.id, label, "CREATE", diffFields(null, words(row)));
    }
    return { ok: true };
  });
}

export async function removeBand(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const formId = String(data.get("formId") ?? "");
  const bandId = String(data.get("bandId") ?? "");
  return inDraft(actor, formId, async (tx, org, f) => {
    const b = f.grades.find((x) => x.id === bandId);
    if (!b) return GONE;
    await tx.performanceGradeBand.delete({ where: { id: b.id, organisationId: org } });
    await audit(tx, toAuditActor(actor), org, f.id, `${formLabel(f)} · grade ${b.label}`, "DELETE", snapshotFields({ grade: b.label, fromPercent: b.lowerPct.toString() }));
    return { ok: true };
  });
}
