import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { db } from "@/lib/db";
import { CONFIG_TEXT, decimalField, draftFault, newVersionFault, nextVersion, parentFault, retireFault, type ConfigFault } from "@/lib/evaluation/config";
import { draftFindings, loadModel, type ModelRow } from "@/lib/evaluation/config-read";
import { ASPECT_KIND_LABEL, CAPITAL_BASE_LABEL, modelFindingText, INPUT_LABEL, OUTCOME_LABEL, ROUTE_LABEL, SCALE_LABEL, SHORTLIST_RULE_LABEL, SIDE_LABEL, STAGE_KIND_LABEL } from "@/lib/evaluation/labels";
import { modelSnapshot } from "@/lib/evaluation/model";
import { ASPECT_KINDS, BAND_OUTCOMES, CAPITAL_BASES, COMPUTED_INPUTS, CRITERION_SCALES, EVALUATION_ROUTES, SHORTLIST_RULES, SIDES, STAGE_KINDS, type Finding } from "@/lib/evaluation/types";
import { FormReader } from "@/lib/validate";
import { Prisma } from "@/generated/prisma/client";
import { requireStaff, staffForPermission, toAuditActor } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { eligibleFor } from "@/lib/auth/eligibility-store";
import { loadDraftMakers, noteDraftMaker } from "@/lib/auth/draft-makers";
import { draftIssueFault, issueReason } from "@/lib/auth/maker-checker";
import { twoPersonOn } from "@/lib/auth/policy-store";
import { permissionHeldThrough } from "@/lib/auth/permission-store";
import type { AuditActor, StaffActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Configuration › Evaluation models (6.8 plan §4 item 10; FR-EVL-006, 008, 009; ADR 0018). A model is
 * drafted row by row and issued: the issue checks the draft (`modelFaults`) and freezes its content on
 * the version (`modelSnapshot`); an issued version is read-only, and a change is a new version copied
 * from it. Aspects, the evaluation policy, each contract basis's route and each method's suggested model
 * are set here too. Every write locks what it edits, re-reads it, checks it and writes it with its
 * before/after audit row in one transaction; every value says where it came from; nothing is shipped.
 *
 * Phase 5a (ADR 0034 D15): a draft's edits are the maker's (`configuration.draft`; each puts the signed-in person on record as a maker), and the issue is a
 * signature by a holder of `configuration.issue` who is not one of the makers, held by the database as well (trigger `guard_draft_issue`). The rest of this file
 * (retiring a version, the aspects, the policy, the routes and the suggested models) is proposed in `actions.ts` and runs here when a second person applies it.
 */

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/evaluation";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };
const GONE: FormState = { ok: false, message: "That record no longer exists. Reload the page." };
const MODEL_ENTITY = "EvaluationModel";

async function organisationId(scope: OrgScope): Promise<string | null> {
  const org = await db.organisation.findUnique({ where: { id: scope.organisationId }, select: { id: true } });
  return org?.id ?? null;
}

function done(modelId?: string): FormState {
  revalidatePath(PATH);
  if (modelId) revalidatePath(`${PATH}/${modelId}`);
  return { ok: true };
}

async function audit(tx: Tx, actor: AuditActor, organisationId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId, entity, entityId, entityLabel, reason }, action, changes);
}

async function lockOrganisation(tx: Tx, organisationId: string) {
  await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR UPDATE`;
}

const modelLabel = (m: { nameEn: string; version: number }) => `Evaluation model ${m.nameEn}, version ${m.version}`;
const yesNo = (v: boolean | null | undefined) => (v == null ? null : v ? "yes" : "no");
const triState = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);
const said = (fs: readonly Finding[]) => fs.map(modelFindingText).join(" ");

/// A typed decimal, rejected on its field in words.
function dec(r: FormReader, data: FormData, name: string, opts: Parameters<typeof decimalField>[1] = {}): string | null {
  const x = decimalField(String(data.get(name) ?? ""), opts);
  if ("fault" in x) {
    r.reject(name, CONFIG_TEXT[x.fault]);
    return null;
  }
  return x.value;
}
const reject = (field: string, fault: ConfigFault): FormState => ({ ok: false, errors: { [field]: CONFIG_TEXT[fault] } });

/**
 * Run a draft edit: the organisation, then the model's row locked and re-read; refused unless a draft.
 * The audit rows of every part of a model are written against the model, so its History holds them all.
 */
async function inDraft(scope: StaffActor, modelId: string, fn: (tx: Tx, orgId: string, m: ModelRow) => Promise<FormState>, opts: { makes?: boolean } = {}): Promise<FormState> {
  const orgId = await organisationId(scope);
  if (!orgId) return NO_ORG;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EvaluationModel" WHERE id = ${modelId} AND "organisationId" = ${orgId} FOR UPDATE`;
    const m = await loadModel(orgId, modelId, tx);
    if (!m) return GONE;
    const f = draftFault(m.status);
    if (f) return { ok: false, message: CONFIG_TEXT[f] };
    const out = await fn(tx, orgId, m);
    // An accepted edit of the draft puts the signed-in person on record as a maker; a refused one does not. The issue (`makes: false`) is not an edit.
    if (out.ok && opts.makes !== false) await noteDraftMaker(tx, { organisationId: orgId, entity: "EvaluationModel", entityId: modelId, actor: scope });
    return out;
  });
  if (result.ok) done(modelId);
  return result;
}

// ------------------------------------------------------------------ models

/// Start a model (version 1, a draft), or change a draft's name, route and source.
export async function saveModel(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    nameMs: r.optionalText("nameMs"),
    route: r.choice("route", "Route", EVALUATION_ROUTES, { required: true }),
    provenance: r.choice("provenance", "Where this came from", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  const fields = (x: typeof v) => ({ name: x.nameEn, nameMs: x.nameMs, route: x.route ? ROUTE_LABEL[x.route] : null, provenance: x.provenance, source: x.governingSource || null, notes: x.notes || null });
  if (id) {
    if (r.failed) return { ok: false, errors: r.errors };
    return inDraft(actor, id, async (tx, org, m) => {
      await tx.evaluationModel.update({ where: { id, organisationId: actor.organisationId }, data: { ...v, route: v.route!, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, id, modelLabel(m), "UPDATE", diffFields(fields({ nameEn: m.nameEn, nameMs: m.nameMs, route: m.route, provenance: m.provenance, governingSource: m.governingSource, notes: m.notes }), fields(v)));
      return { ok: true };
    });
  }
  const existing = await db.evaluationModel.findMany({ where: { organisationId: orgId }, select: { code: true } });
  const code = r.code("code", "Code", { taken: [...new Set(existing.map((e) => e.code))] });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    await lockOrganisation(tx, orgId);
    if (await tx.evaluationModel.findFirst({ where: { organisationId: orgId, code }, select: { id: true } })) return reject("code", "CODE_TAKEN");
    const row = await tx.evaluationModel.create({ data: { organisationId: orgId, code, version: 1, ...v, route: v.route!, provenance: v.provenance! } });
    await audit(tx, toAuditActor(actor), orgId, MODEL_ENTITY, row.id, modelLabel(row), "CREATE", diffFields(null, { ...fields(v), version: 1, status: "Draft" }));
    await noteDraftMaker(tx, { organisationId: orgId, entity: "EvaluationModel", entityId: row.id, actor });
    return done(row.id);
  });
}

/// Check the draft and issue it: its content is frozen on the version, and it is offered on the Window card. Issuing is a signature by someone who did not make the draft.
export async function issueModel(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.issue");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  if (actor.system) return { ok: false, message: "A loader run is not a person, so it cannot issue an evaluation model: a person issues it, with their password." };
  const id = String(data.get("id") ?? "");
  const now = toSecond(new Date());

  // The issuer is never one of the makers. Said before the password is asked, so a maker is told so and spends nothing; judged again below under the draft's lock.
  const early = await db.evaluationModel.findFirst({ where: { id, organisationId: actor.organisationId }, select: { id: true } });
  if (!early) return GONE;
  const makersNow = await loadDraftMakers(db, "EvaluationModel", id);
  const beforePassword = draftIssueFault({
    makerPersonIds: makersNow.personIds,
    issuerPersonId: actor.personId,
    twoPersonChanges: await twoPersonOn(db, actor.organisationId),
    eligiblePersonIds: await eligibleFor(db, { organisationId: actor.organisationId, timeZone: actor.organisationTimeZone, now: new Date() }, "configuration.issue"),
  });
  if (beforePassword) return { ok: false, message: beforePassword.en };

  // Issuing is a signature: the password is asked again, every time, before the transaction (a wrong one counts towards the lockout).
  const begun = await beginAct(actor, data, "EvaluationModel.issuedBy", { personField: "personId", document: { entity: "EvaluationModel", id } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const heldThrough = await permissionHeldThrough(db, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, "configuration.issue");

  try {
    return await inDraft(
      actor,
      id,
      async (tx, org, m) => {
        const makers = await loadDraftMakers(tx, "EvaluationModel", id);
        const twoPerson = await twoPersonOn(tx, org);
        const makerFault = draftIssueFault({
          makerPersonIds: makers.personIds,
          issuerPersonId: actor.personId,
          twoPersonChanges: twoPerson,
          eligiblePersonIds: await eligibleFor(tx, { organisationId: org, timeZone: actor.organisationTimeZone, now: new Date() }, "configuration.issue"),
        });
        if (makerFault) return { ok: false, message: makerFault.en };
        const { content, aspects, findings } = await draftFindings(org, m, now, tx);
        const blocks = findings.filter((f) => f.level === "block");
        if (blocks.length) return { ok: false, message: `Not issued: ${said(blocks)}` };
        const snapshot = modelSnapshot(m.id, content, aspects, now);
        const moved = await tx.evaluationModel.updateMany({ where: { id, status: "DRAFT" }, data: { status: "ISSUED", issuedAt: now, issuedByPersonId: actor.personId, contentSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
        if (moved.count !== 1) return GONE;
        const warned = findings.filter((f) => f.level !== "block");
        await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, id, modelLabel(m), "UPDATE", diffFields({ status: "Draft" }, { status: "Issued", issuedBy: actor.personName, madeBy: makers.names.join(", "), stages: content.stages.length, bandSets: content.bandSets.length, aspects: snapshot.aspects.length, issuedWith: warned.length ? said(warned) : null }), issueReason("", { makerPersonIds: makers.personIds, issuerPersonId: actor.personId, twoPersonChanges: twoPerson }));
        await act.write(tx, id, { document: { entity: "EvaluationModel", id }, roleCode: heldThrough });
        return { ok: true, message: warned.length ? `Issued. ${said(warned)}` : "Issued." };
      },
      { makes: false },
    );
  } catch (e) {
    const refused = attributionRefusalState(e);
    if (refused) return refused;
    throw e;
  }
}

/// Take over a draft nobody is on record as having made (a draft that existed when this rule landed, or one a loader made), so that a different person issues it.
export async function adoptModelDraft(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  if (actor.system) return { ok: false, message: "A loader run is not a person, so it cannot adopt a draft." };
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why you are adopting it." } };
  return inDraft(
    actor,
    id,
    async (tx, org, m) => {
      const makers = await loadDraftMakers(tx, "EvaluationModel", id);
      if (makers.personIds.length > 0) return { ok: false, message: `This draft already has ${makers.personIds.length === 1 ? "a maker" : "makers"} on record (${makers.names.join(", ")}), so it needs no adopting.` };
      await noteDraftMaker(tx, { organisationId: org, entity: "EvaluationModel", entityId: id, actor });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, id, modelLabel(m), "UPDATE", [{ field: "madeBy", before: null, after: actor.personName }], `Adopted: ${reason}`);
      return { ok: true };
    },
    { makes: false },
  );
}

/// Retire an issued version: no longer offered; exercises that pinned it keep their snapshot.
export async function retireModel(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why it is retired." } };
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EvaluationModel" WHERE id = ${id} AND "organisationId" = ${orgId} FOR UPDATE`;
    const m = await tx.evaluationModel.findFirst({ where: { id, organisationId: orgId } });
    if (!m) return GONE;
    const f = retireFault(m.status);
    if (f) return { ok: false, message: CONFIG_TEXT[f] };
    await tx.evaluationModel.update({ where: { id, organisationId: actor.organisationId }, data: { status: "RETIRED", retiredAt: toSecond(new Date()) } });
    await audit(tx, toAuditActor(actor), orgId, MODEL_ENTITY, id, modelLabel(m), "UPDATE", diffFields({ status: "Issued" }, { status: "Retired" }), reason);
    return { ok: true };
  });
  return result.ok ? done(id) : result;
}

/// Throw away a draft never issued (nothing can have pinned it), with a reason.
export async function discardDraft(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why the draft is discarded." } };
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EvaluationModel" WHERE id = ${id} AND "organisationId" = ${orgId} FOR UPDATE`;
    const m = await tx.evaluationModel.findFirst({ where: { id, organisationId: orgId } });
    if (!m) return GONE;
    const f = draftFault(m.status);
    if (f) return { ok: false, message: CONFIG_TEXT[f] };
    await tx.configurationDraftMaker.deleteMany({ where: { organisationId: orgId, entity: MODEL_ENTITY, entityId: id } });
    await tx.evaluationModel.delete({ where: { id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), orgId, MODEL_ENTITY, id, modelLabel(m), "DELETE", snapshotFields({ name: m.nameEn, version: m.version, status: "Draft" }), reason);
    return { ok: true };
  });
  if (result.ok) revalidatePath(PATH);
  return result;
}

/// Start the next version of a model as a draft, copied row by row from the version given.
export async function newModelVersion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const fromId = String(data.get("id") ?? "");
  let createdId: string | null = null;
  const result = await db.$transaction(async (tx) => {
    await lockOrganisation(tx, orgId);
    const from = await loadModel(orgId, fromId, tx);
    if (!from) return GONE;
    const versions = await tx.evaluationModel.findMany({ where: { organisationId: orgId, code: from.code }, select: { version: true, status: true } });
    const f = newVersionFault(versions);
    if (f) return { ok: false, message: CONFIG_TEXT[f] };
    const version = nextVersion(versions);
    const next = await tx.evaluationModel.create({ data: { organisationId: orgId, code: from.code, version, nameEn: from.nameEn, nameMs: from.nameMs, route: from.route, provenance: from.provenance, governingSource: from.governingSource, notes: from.notes } });
    for (const set of from.bandSets) {
      const s = await tx.evaluationBandSet.create({ data: { organisationId: orgId, modelId: next.id, code: set.code, nameEn: set.nameEn, provenance: set.provenance, governingSource: set.governingSource } });
      for (const b of set.bands) await tx.evaluationBand.create({ data: { organisationId: orgId, setId: s.id, labelEn: b.labelEn, labelMs: b.labelMs, lower: b.lower, lowerInclusive: b.lowerInclusive, lowerIsFloor: b.lowerIsFloor, upper: b.upper, upperInclusive: b.upperInclusive, upperIsFloor: b.upperIsFloor, outcome: b.outcome, sortOrder: b.sortOrder } });
    }
    for (const st of from.stages) {
      const { id: _id, modelId: _m, organisationId: _o, criteria, factorOptions, ...rest } = st;
      void _id; void _m; void _o;
      const s = await tx.evaluationStage.create({ data: { ...rest, organisationId: orgId, modelId: next.id } });
      const ids = new Map<string, string>();
      // Groups first, so each criterion inside one finds its new parent.
      for (const c of [...criteria].sort((a, b) => Number(a.parentId != null) - Number(b.parentId != null))) {
        const { id: cid, stageId: _s, organisationId: _co, parentId, ...cr } = c;
        void _s; void _co;
        const row = await tx.evaluationCriterion.create({ data: { ...cr, organisationId: orgId, stageId: s.id, parentId: parentId ? (ids.get(parentId) ?? null) : null } });
        ids.set(cid, row.id);
      }
      for (const x of factorOptions) await tx.evaluationFactorOption.create({ data: { organisationId: orgId, stageId: s.id, code: x.code, labelEn: x.labelEn, labelMs: x.labelMs, factorPct: x.factorPct, provenance: x.provenance, governingSource: x.governingSource } });
    }
    await audit(tx, toAuditActor(actor), orgId, MODEL_ENTITY, next.id, modelLabel(next), "CREATE", diffFields(null, { name: next.nameEn, version, status: "Draft", copiedFrom: `Version ${from.version}` }));
    await noteDraftMaker(tx, { organisationId: orgId, entity: "EvaluationModel", entityId: next.id, actor });
    createdId = next.id;
    return { ok: true };
  });
  if (!result.ok) return result;
  done(createdId!);
  return { ok: true, message: "The new version is a draft: change it, then issue it." };
}

// ------------------------------------------------------------------ stages

export async function saveStage(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const stageId = String(data.get("stageId") ?? "");
  const r = new FormReader(data);
  const v = {
    order: r.int("order", "Order", { required: true, min: 1 }),
    labelEn: r.text("labelEn", "Name", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    kind: r.choice("kind", "What the stage does", STAGE_KINDS, { required: true }),
    side: r.choice("side", "Who evaluates it", SIDES, { required: true }),
    unlocksAfterOrder: r.int("unlocksAfterOrder", "Opens after the stage of order", { min: 1 }),
    maxMarks: dec(r, data, "maxMarks", { min: 0, minExclusive: true }),
    passMark: dec(r, data, "passMark", { min: 0, max: 100 }),
    passInclusive: triState(r.optionalText("passInclusive")),
    mustPass: triState(r.optionalText("mustPass")),
    compositeWeight: dec(r, data, "compositeWeight", { min: 0, max: 100, minExclusive: true }),
    committeeCode: r.optionalText("committeeCode"),
    shortlistRule: r.choice("shortlistRule", "Shortlist rule", SHORTLIST_RULES),
    shortlistMin: r.int("shortlistMin", "Fewest shortlisted", { min: 1 }),
    shortlistMax: r.int("shortlistMax", "Most shortlisted", { min: 1 }),
    shortlistOfficeCode: r.optionalText("shortlistOfficeCode"),
    capitalBase: r.choice("capitalBase", "Minimum capital is a percentage of", CAPITAL_BASES),
    provenance: r.choice("provenance", "Where this came from", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
  };
  if (v.shortlistMin != null && v.shortlistMax != null && v.shortlistMin > v.shortlistMax) r.reject("shortlistMax", "The most shortlisted cannot be fewer than the fewest.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inDraft(actor, modelId, async (tx, org, m) => {
    const self = stageId ? m.stages.find((s) => s.id === stageId) : null;
    if (stageId && !self) return GONE;
    const code = self ? self.code : r.code("code", "Code", { taken: m.stages.map((s) => s.code) });
    if (!self && r.failed) return { ok: false, errors: r.errors };
    if (m.stages.some((s) => s.order === v.order && s.id !== stageId)) return reject("order", "ORDER_TAKEN");
    if (v.committeeCode && !(await tx.committee.findFirst({ where: { organisationId: org, code: v.committeeCode }, select: { id: true } }))) return reject("committeeCode", "UNKNOWN_CHOICE");
    if (v.shortlistOfficeCode && !(await tx.authorityRole.findFirst({ where: { organisationId: org, code: v.shortlistOfficeCode }, select: { id: true } }))) return reject("shortlistOfficeCode", "UNKNOWN_CHOICE");
    const row = { ...v, order: v.order!, kind: v.kind!, side: v.side!, provenance: v.provenance! };
    const words = async (x: typeof row | NonNullable<typeof self>) => ({
      stage: x.labelEn,
      nameMs: x.labelMs,
      order: x.order,
      kind: STAGE_KIND_LABEL[x.kind],
      side: SIDE_LABEL[x.side],
      opensAfter: x.unlocksAfterOrder,
      maxMarks: x.maxMarks?.toString() ?? null,
      passMark: x.passMark?.toString() ?? null,
      onThePassMark: x.passInclusive == null ? null : x.passInclusive ? "passes" : "fails",
      mustPass: yesNo(x.mustPass),
      compositeWeight: x.compositeWeight?.toString() ?? null,
      committee: x.committeeCode ? ((await tx.committee.findFirst({ where: { organisationId: org, code: x.committeeCode }, select: { nameEn: true } }))?.nameEn ?? "A committee no longer configured") : null,
      shortlist: x.shortlistRule ? SHORTLIST_RULE_LABEL[x.shortlistRule] : null,
      shortlistRange: x.shortlistMin != null || x.shortlistMax != null ? `${x.shortlistMin ?? "?"} to ${x.shortlistMax ?? "?"}` : null,
      shortlistOffice: x.shortlistOfficeCode ? ((await tx.authorityRole.findFirst({ where: { organisationId: org, code: x.shortlistOfficeCode }, select: { nameEn: true } }))?.nameEn ?? "An office no longer configured") : null,
      capitalBase: x.capitalBase ? CAPITAL_BASE_LABEL[x.capitalBase] : null,
      provenance: x.provenance,
      source: x.governingSource || null,
    });
    if (self) {
      await tx.evaluationStage.update({ where: { id: self.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${row.labelEn}`, "UPDATE", diffFields(await words(self), await words(row)));
    } else {
      await tx.evaluationStage.create({ data: { ...row, code, organisationId: org, modelId: m.id } });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${row.labelEn}`, "CREATE", diffFields(null, await words(row)));
    }
    return { ok: true };
  });
}

export async function removeStage(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const stageId = String(data.get("stageId") ?? "");
  return inDraft(actor, modelId, async (tx, org, m) => {
    const s = m.stages.find((x) => x.id === stageId);
    if (!s) return GONE;
    await tx.evaluationStage.delete({ where: { id: s.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${s.labelEn}`, "DELETE", snapshotFields({ stage: s.labelEn, kind: STAGE_KIND_LABEL[s.kind], criteria: s.criteria.length, factors: s.factorOptions.length }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ criteria

export async function saveCriterion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const stageId = String(data.get("stageId") ?? "");
  const criterionId = String(data.get("criterionId") ?? "");
  const r = new FormReader(data);
  const v = {
    parentCode: r.optionalText("parentCode"),
    order: r.int("order", "Order", { required: true, min: 1 }),
    labelEn: r.text("labelEn", "Name", { required: true, max: 300 }),
    labelMs: r.optionalText("labelMs"),
    maxMarks: dec(r, data, "maxMarks", { min: 0, minExclusive: true }),
    scale: r.choice("scale", "How it is judged", CRITERION_SCALES, { required: true }),
    computedInput: r.choice("computedInput", "The figure it is worked from", COMPUTED_INPUTS) ?? "NONE",
    bandSetCode: r.optionalText("bandSetCode"),
    needsNamedContractor: r.bool("needsNamedContractor"),
    provenance: r.choice("provenance", "Where this came from", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return inDraft(actor, modelId, async (tx, org, m) => {
    const stage = m.stages.find((s) => s.id === stageId);
    if (!stage) return GONE;
    const self = criterionId ? stage.criteria.find((c) => c.id === criterionId) : null;
    if (criterionId && !self) return GONE;
    const codeOf = new Map(stage.criteria.map((c) => [c.id, c.code]));
    const tree = stage.criteria.map((c) => ({ code: c.code, parentCode: c.parentId ? (codeOf.get(c.parentId) ?? null) : null }));
    const code = self ? self.code : r.code("code", "Code", { taken: stage.criteria.map((c) => c.code) });
    if (!self && r.failed) return { ok: false, errors: r.errors };
    const pf = parentFault(tree, v.parentCode, self?.code ?? null);
    if (pf) return reject("parentCode", pf);
    if (v.bandSetCode && !m.bandSets.some((b) => b.code === v.bandSetCode)) return reject("bandSetCode", "UNKNOWN_CHOICE");
    const parentId = v.parentCode ? stage.criteria.find((c) => c.code === v.parentCode)!.id : null;
    const row = { parentId, order: v.order!, labelEn: v.labelEn, labelMs: v.labelMs, maxMarks: v.maxMarks, scale: v.scale!, computedInput: v.computedInput, bandSetCode: v.bandSetCode, needsNamedContractor: v.needsNamedContractor, provenance: v.provenance!, governingSource: v.governingSource };
    const words = (x: Omit<typeof row, "maxMarks"> & { maxMarks: { toString(): string } | null }) => ({
      criterion: x.labelEn,
      nameMs: x.labelMs,
      inGroup: x.parentId ? (stage.criteria.find((c) => c.id === x.parentId)?.labelEn ?? null) : null,
      order: x.order,
      maxMarks: x.maxMarks?.toString() ?? null,
      judged: SCALE_LABEL[x.scale],
      workedFrom: x.computedInput === "NONE" ? null : INPUT_LABEL[x.computedInput],
      bandSet: x.bandSetCode ? (m.bandSets.find((b) => b.code === x.bandSetCode)?.nameEn ?? null) : null,
      needsNamedContractor: yesNo(x.needsNamedContractor),
      provenance: x.provenance,
      source: x.governingSource || null,
    });
    const label = `${modelLabel(m)} · ${stage.labelEn} · ${row.labelEn}`;
    if (self) {
      await tx.evaluationCriterion.update({ where: { id: self.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, label, "UPDATE", diffFields(words({ ...self, governingSource: self.governingSource }), words(row)));
    } else {
      await tx.evaluationCriterion.create({ data: { ...row, code, organisationId: org, stageId: stage.id } });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, label, "CREATE", diffFields(null, words(row)));
    }
    return { ok: true };
  });
}

export async function removeCriterion(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const criterionId = String(data.get("criterionId") ?? "");
  return inDraft(actor, modelId, async (tx, org, m) => {
    const stage = m.stages.find((s) => s.criteria.some((c) => c.id === criterionId));
    const c = stage?.criteria.find((x) => x.id === criterionId);
    if (!stage || !c) return GONE;
    if (stage.criteria.some((x) => x.parentId === c.id)) return { ok: false, message: CONFIG_TEXT.PARENT_IN_USE };
    await tx.evaluationCriterion.delete({ where: { id: c.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${stage.labelEn} · ${c.labelEn}`, "DELETE", snapshotFields({ criterion: c.labelEn, judged: SCALE_LABEL[c.scale] }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ factor options

export async function saveFactor(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const stageId = String(data.get("stageId") ?? "");
  const factorId = String(data.get("factorId") ?? "");
  const r = new FormReader(data);
  const v = {
    labelEn: r.text("labelEn", "Name", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    factorPct: dec(r, data, "factorPct", { min: 0, max: 100, minExclusive: true }),
    provenance: r.choice("provenance", "Where this came from", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
  };
  if (!v.factorPct && !r.errors.factorPct) r.reject("factorPct", "Percentage is required.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inDraft(actor, modelId, async (tx, org, m) => {
    const stage = m.stages.find((s) => s.id === stageId);
    if (!stage) return GONE;
    const self = factorId ? stage.factorOptions.find((x) => x.id === factorId) : null;
    if (factorId && !self) return GONE;
    const code = self ? self.code : r.code("code", "Code", { taken: stage.factorOptions.map((x) => x.code) });
    if (!self && r.failed) return { ok: false, errors: r.errors };
    const row = { ...v, factorPct: v.factorPct!, provenance: v.provenance! };
    const words = (x: { labelEn: string; labelMs: string | null; factorPct: { toString(): string }; provenance: string; governingSource: string }) => ({ factor: x.labelEn, nameMs: x.labelMs, percentage: x.factorPct.toString(), provenance: x.provenance, source: x.governingSource || null });
    const label = `${modelLabel(m)} · ${stage.labelEn} · ${row.labelEn}`;
    if (self) {
      await tx.evaluationFactorOption.update({ where: { id: self.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, label, "UPDATE", diffFields(words(self), words(row)));
    } else {
      await tx.evaluationFactorOption.create({ data: { ...row, code, organisationId: org, stageId: stage.id } });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, label, "CREATE", diffFields(null, words(row)));
    }
    return { ok: true };
  });
}

export async function removeFactor(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const factorId = String(data.get("factorId") ?? "");
  return inDraft(actor, modelId, async (tx, org, m) => {
    const stage = m.stages.find((s) => s.factorOptions.some((x) => x.id === factorId));
    const x = stage?.factorOptions.find((y) => y.id === factorId);
    if (!stage || !x) return GONE;
    await tx.evaluationFactorOption.delete({ where: { id: x.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${stage.labelEn} · ${x.labelEn}`, "DELETE", snapshotFields({ factor: x.labelEn, percentage: x.factorPct.toString() }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ band sets and bands

export async function saveBandSet(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const setId = String(data.get("setId") ?? "");
  const r = new FormReader(data);
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 200 }),
    provenance: r.choice("provenance", "Where this came from", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return inDraft(actor, modelId, async (tx, org, m) => {
    const self = setId ? m.bandSets.find((b) => b.id === setId) : null;
    if (setId && !self) return GONE;
    const code = self ? self.code : r.code("code", "Code", { taken: m.bandSets.map((b) => b.code) });
    if (!self && r.failed) return { ok: false, errors: r.errors };
    const row = { ...v, provenance: v.provenance! };
    const words = (x: typeof row) => ({ bandSet: x.nameEn, provenance: x.provenance, source: x.governingSource || null });
    if (self) {
      await tx.evaluationBandSet.update({ where: { id: self.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${row.nameEn}`, "UPDATE", diffFields(words(self), words(row)));
    } else {
      await tx.evaluationBandSet.create({ data: { ...row, code, organisationId: org, modelId: m.id } });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${row.nameEn}`, "CREATE", diffFields(null, words(row)));
    }
    return { ok: true };
  });
}

export async function removeBandSet(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const setId = String(data.get("setId") ?? "");
  return inDraft(actor, modelId, async (tx, org, m) => {
    const set = m.bandSets.find((b) => b.id === setId);
    if (!set) return GONE;
    if (m.stages.some((s) => s.criteria.some((c) => c.bandSetCode === set.code))) return { ok: false, message: CONFIG_TEXT.BAND_SET_IN_USE };
    await tx.evaluationBandSet.delete({ where: { id: set.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${set.nameEn}`, "DELETE", snapshotFields({ bandSet: set.nameEn, bands: set.bands.length }));
    return { ok: true };
  });
}

export async function saveBand(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const setId = String(data.get("setId") ?? "");
  const bandId = String(data.get("bandId") ?? "");
  const r = new FormReader(data);
  const lowerInclusive = triState(r.optionalText("lowerInclusive"));
  const upperInclusive = triState(r.optionalText("upperInclusive"));
  const v = {
    labelEn: r.text("labelEn", "Name", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    lower: dec(r, data, "lower"),
    lowerIsFloor: r.bool("lowerIsFloor"),
    upper: dec(r, data, "upper"),
    upperIsFloor: r.bool("upperIsFloor"),
    outcome: r.choice("outcome", "What a value in it means", BAND_OUTCOMES, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  // Which side of an edge a value exactly on it falls is the customer's decision: never assumed.
  if (v.lower != null && lowerInclusive == null) r.reject("lowerInclusive", "Say whether a value exactly on the lower edge is in this band.");
  if (v.upper != null && upperInclusive == null) r.reject("upperInclusive", "Say whether a value exactly on the upper edge is in this band.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inDraft(actor, modelId, async (tx, org, m) => {
    const set = m.bandSets.find((b) => b.id === setId);
    if (!set) return GONE;
    const self = bandId ? set.bands.find((b) => b.id === bandId) : null;
    if (bandId && !self) return GONE;
    const row = { ...v, outcome: v.outcome!, lowerInclusive: lowerInclusive ?? false, upperInclusive: upperInclusive ?? false };
    const edge = (x: { toString(): string } | null, inc: boolean, floor: boolean) => (x == null ? "open" : `${x.toString()}${inc ? " (in)" : " (out)"}${floor ? ", judged exactly" : ""}`);
    const words = (x: typeof row | NonNullable<typeof self>) => ({ band: x.labelEn, nameMs: x.labelMs, from: edge(x.lower, x.lowerInclusive, x.lowerIsFloor), to: edge(x.upper, x.upperInclusive, x.upperIsFloor), means: OUTCOME_LABEL[x.outcome], order: x.sortOrder });
    const label = `${modelLabel(m)} · ${set.nameEn} · ${row.labelEn}`;
    if (self) {
      await tx.evaluationBand.update({ where: { id: self.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, label, "UPDATE", diffFields(words(self), words(row)));
    } else {
      await tx.evaluationBand.create({ data: { ...row, organisationId: org, setId: set.id } });
      await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, label, "CREATE", diffFields(null, words(row)));
    }
    return { ok: true };
  });
}

export async function removeBand(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const modelId = String(data.get("modelId") ?? "");
  const bandId = String(data.get("bandId") ?? "");
  return inDraft(actor, modelId, async (tx, org, m) => {
    const set = m.bandSets.find((s) => s.bands.some((b) => b.id === bandId));
    const b = set?.bands.find((x) => x.id === bandId);
    if (!set || !b) return GONE;
    await tx.evaluationBand.delete({ where: { id: b.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), org, MODEL_ENTITY, m.id, `${modelLabel(m)} · ${set.nameEn} · ${b.labelEn}`, "DELETE", snapshotFields({ band: b.labelEn, means: OUTCOME_LABEL[b.outcome] }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ aspects (FR-EVL-003)

export async function saveAspect(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    kind: r.choice("kind", "What it assesses", ASPECT_KINDS, { required: true }),
    labelEn: r.text("labelEn", "Name", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    requiredOnRoute: r.choice("requiredOnRoute", "Required on", EVALUATION_ROUTES),
    provenance: r.choice("provenance", "Where this came from", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const existing = id ? [] : await db.evaluationAspect.findMany({ where: { organisationId: orgId }, select: { code: true } });
  const code = id ? "" : r.code("code", "Code", { taken: existing.map((e) => e.code) });
  if (r.failed) return { ok: false, errors: r.errors };
  const row = { ...v, kind: v.kind!, provenance: v.provenance! };
  const words = (x: typeof row) => ({ aspect: x.labelEn, nameMs: x.labelMs, assesses: ASPECT_KIND_LABEL[x.kind], requiredOn: x.requiredOnRoute ? ROUTE_LABEL[x.requiredOnRoute] : "Not required", provenance: x.provenance, source: x.governingSource || null, order: x.sortOrder });
  const result = await db.$transaction(async (tx) => {
    await lockOrganisation(tx, orgId);
    if (id) {
      const before = await tx.evaluationAspect.findFirst({ where: { id, organisationId: orgId } });
      if (!before) return GONE;
      await tx.evaluationAspect.update({ where: { id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), orgId, "EvaluationAspect", id, `Evaluation aspect ${row.labelEn}`, "UPDATE", diffFields(words(before), words(row)));
      return { ok: true };
    }
    if (await tx.evaluationAspect.findFirst({ where: { organisationId: orgId, code }, select: { id: true } })) return reject("code", "CODE_TAKEN");
    const created = await tx.evaluationAspect.create({ data: { ...row, code, organisationId: orgId } });
    await audit(tx, toAuditActor(actor), orgId, "EvaluationAspect", created.id, `Evaluation aspect ${row.labelEn}`, "CREATE", diffFields(null, words(row)));
    return { ok: true };
  });
  return result.ok ? done() : result;
}

export async function retireAspect(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why it is retired." } };
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EvaluationAspect" WHERE id = ${id} FOR UPDATE`;
    const a = await tx.evaluationAspect.findFirst({ where: { id, organisationId: orgId } });
    if (!a || a.retiredOn) return GONE;
    await tx.evaluationAspect.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn: toSecond(new Date()) } });
    await audit(tx, toAuditActor(actor), orgId, "EvaluationAspect", id, `Evaluation aspect ${a.labelEn}`, "UPDATE", diffFields({ retired: null }, { retired: "yes" }), reason);
    return { ok: true };
  });
  return result.ok ? done() : result;
}

// ------------------------------------------------------------------ the policy

export async function saveEvaluationPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    reportSeriesKey: r.optionalText("reportSeriesKey"),
    scoreDecimals: r.int("scoreDecimals", "Decimal places a score is judged at", { min: 0 }),
    scoreDecimalsProvenance: r.choice("scoreDecimalsProvenance", "Where this came from", PROVENANCE),
    // FR-EVL-020 (Phase 3b): a three-state setting, never defaulted. Not set: scoring shows the names, and the screen says so.
    anonymisedScoringChoice: r.choice("anonymisedScoring", "Anonymised technical scoring", ["ON", "OFF"] as const),
    anonymisedScoringProvenance: r.choice("anonymisedScoringProvenance", "Where this came from", PROVENANCE),
    checkerRoleCode: r.optionalText("checkerRoleCode"),
    recommenderRoleCode: r.optionalText("recommenderRoleCode"),
    // FR-EVL-014 (ruling of 2026-10-08 on log line 1735): the offices that read the evaluation as the Secretariat and as Internal Audit. Nullable, never defaulted: unset grants nothing.
    secretariatRoleCode: r.optionalText("secretariatRoleCode"),
    secretariatRoleProvenance: r.choice("secretariatRoleProvenance", "Where this came from", PROVENANCE),
    internalAuditRoleCode: r.optionalText("internalAuditRoleCode"),
    internalAuditRoleProvenance: r.choice("internalAuditRoleProvenance", "Where this came from", PROVENANCE),
    reportTemplateId: r.optionalText("reportTemplateId"),
    proposalTemplateId: r.optionalText("proposalTemplateId"),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (v.scoreDecimals != null && v.scoreDecimals > 4) r.reject("scoreDecimals", "At most four: scores are kept to four places.");
  if (v.scoreDecimals != null && !v.scoreDecimalsProvenance) r.reject("scoreDecimalsProvenance", CONFIG_TEXT.PROVENANCE_REQUIRED);
  if (v.anonymisedScoringChoice != null && !v.anonymisedScoringProvenance) r.reject("anonymisedScoringProvenance", CONFIG_TEXT.PROVENANCE_REQUIRED);
  if (v.secretariatRoleCode && !v.secretariatRoleProvenance) r.reject("secretariatRoleProvenance", CONFIG_TEXT.PROVENANCE_REQUIRED);
  if (v.internalAuditRoleCode && !v.internalAuditRoleProvenance) r.reject("internalAuditRoleProvenance", CONFIG_TEXT.PROVENANCE_REQUIRED);
  if (r.failed) return { ok: false, errors: r.errors };
  const { anonymisedScoringChoice, ...rest } = v;
  const row = { ...rest, secretariatRoleProvenance: v.secretariatRoleCode ? v.secretariatRoleProvenance : null, internalAuditRoleProvenance: v.internalAuditRoleCode ? v.internalAuditRoleProvenance : null, scoreDecimalsProvenance: v.scoreDecimals == null ? null : v.scoreDecimalsProvenance, anonymisedScoring: anonymisedScoringChoice == null ? null : anonymisedScoringChoice === "ON", anonymisedScoringProvenance: anonymisedScoringChoice == null ? null : v.anonymisedScoringProvenance };
  const result = await db.$transaction(async (tx) => {
    await lockOrganisation(tx, orgId);
    const series = await tx.numberingSeries.findMany({ where: { organisationId: orgId }, select: { key: true, nameEn: true } });
    const offices = await tx.authorityRole.findMany({ where: { organisationId: orgId, isCommittee: false }, select: { code: true, nameEn: true } });
    const templates = await tx.documentTemplate.findMany({ where: { organisationId: orgId }, select: { id: true, nameEn: true } });
    if (row.reportSeriesKey && !series.some((s) => s.key === row.reportSeriesKey)) return reject("reportSeriesKey", "UNKNOWN_CHOICE");
    for (const k of ["checkerRoleCode", "recommenderRoleCode", "secretariatRoleCode", "internalAuditRoleCode"] as const) if (row[k] && !offices.some((o) => o.code === row[k])) return reject(k, "UNKNOWN_CHOICE");
    for (const k of ["reportTemplateId", "proposalTemplateId"] as const) if (row[k] && !templates.some((t) => t.id === row[k])) return reject(k, "UNKNOWN_CHOICE");
    const before = await tx.evaluationPolicy.findUnique({ where: { organisationId: orgId } });
    const name = <T extends { nameEn: string }>(rows: T[], pick: (x: T) => boolean) => rows.find(pick)?.nameEn ?? null;
    const words = (x: typeof row) => ({
      reportSeries: x.reportSeriesKey ? name(series, (s) => s.key === x.reportSeriesKey) : null,
      scoreDecimals: x.scoreDecimals,
      scoreDecimalsFrom: x.scoreDecimalsProvenance,
      anonymisedScoring: x.anonymisedScoring == null ? null : x.anonymisedScoring ? "On" : "Off",
      anonymisedScoringFrom: x.anonymisedScoringProvenance,
      checker: x.checkerRoleCode ? name(offices, (o) => o.code === x.checkerRoleCode) : null,
      recommender: x.recommenderRoleCode ? name(offices, (o) => o.code === x.recommenderRoleCode) : null,
      secretariatOffice: x.secretariatRoleCode ? name(offices, (o) => o.code === x.secretariatRoleCode) : null,
      secretariatOfficeFrom: x.secretariatRoleProvenance,
      internalAuditOffice: x.internalAuditRoleCode ? name(offices, (o) => o.code === x.internalAuditRoleCode) : null,
      internalAuditOfficeFrom: x.internalAuditRoleProvenance,
      reportTemplate: x.reportTemplateId ? name(templates, (t) => t.id === x.reportTemplateId) : null,
      proposalTemplate: x.proposalTemplateId ? name(templates, (t) => t.id === x.proposalTemplateId) : null,
      source: x.governingSource || null,
      notes: x.notes || null,
    });
    const saved = await tx.evaluationPolicy.upsert({ where: { organisationId: orgId }, create: { organisationId: orgId, ...row }, update: row });
    await audit(tx, toAuditActor(actor), orgId, "EvaluationPolicy", saved.id, "Evaluation policy", before ? "UPDATE" : "CREATE", diffFields(before ? words({ ...before }) : null, words(row)));
    return { ok: true };
  });
  return result.ok ? done() : result;
}

// ------------------------------------------------------------------ a basis's route, a method's suggested model

export async function saveBasisRoute(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const route = r.choice("evaluationRoute", "Evaluation route", EVALUATION_ROUTES);
  const provenance = r.choice("evaluationRouteProvenance", "Where this came from", PROVENANCE);
  if (route && !provenance) r.reject("evaluationRouteProvenance", CONFIG_TEXT.PROVENANCE_REQUIRED);
  if (r.failed) return { ok: false, errors: r.errors };
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContractBasis" WHERE id = ${id} FOR UPDATE`;
    const b = await tx.contractBasis.findFirst({ where: { id, organisationId: orgId } });
    if (!b) return GONE;
    const after = { evaluationRoute: route, evaluationRouteProvenance: route ? provenance : null };
    await tx.contractBasis.update({ where: { id, organisationId: actor.organisationId }, data: after });
    const words = (x: typeof after) => ({ evaluationRoute: x.evaluationRoute ? ROUTE_LABEL[x.evaluationRoute] : null, evaluationRouteFrom: x.evaluationRouteProvenance });
    await audit(tx, toAuditActor(actor), orgId, "ContractBasis", id, `Contract basis ${b.nameEn}`, "UPDATE", diffFields(words(b), words(after)));
    return { ok: true };
  });
  return result.ok ? done() : result;
}

export async function saveMethodModel(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const code = String(data.get("defaultEvaluationModelCode") ?? "").trim() || null;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SourcingMethod" WHERE id = ${id} FOR UPDATE`;
    const m = await tx.sourcingMethod.findFirst({ where: { id, organisationId: orgId } });
    if (!m) return GONE;
    const models = await tx.evaluationModel.findMany({ where: { organisationId: orgId }, orderBy: { version: "desc" }, select: { code: true, nameEn: true } });
    if (code && !models.some((x) => x.code === code)) return reject("defaultEvaluationModelCode", "UNKNOWN_CHOICE");
    const name = (c: string | null) => (c ? (models.find((x) => x.code === c)?.nameEn ?? "A model no longer configured") : null);
    await tx.sourcingMethod.update({ where: { id, organisationId: actor.organisationId }, data: { defaultEvaluationModelCode: code } });
    await audit(tx, toAuditActor(actor), orgId, "SourcingMethod", id, `Method ${m.nameEn}`, "UPDATE", diffFields({ suggestedEvaluationModel: name(m.defaultEvaluationModelCode) }, { suggestedEvaluationModel: name(code) }));
    return { ok: true };
  });
  return result.ok ? done() : result;
}

