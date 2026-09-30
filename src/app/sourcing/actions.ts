"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields, snapshotFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay } from "@/lib/dates";
import { ACT_LABEL } from "@/lib/labels";
import { resolveNameApproval } from "@/lib/method/approval";
import { keptForMethod, nameRoutesToWithdraw } from "@/lib/method/config";
import { evaluateExercise, saveBlockers, type Evaluation, type ExerciseDraft } from "@/lib/method/evaluate";
import { transitionFault, openFault } from "@/lib/method/exercise";
import { findingText, EXERCISE_STATUS_LABEL } from "@/lib/method/labels";
import { behaviourProfile } from "@/lib/method/profile";
import { nameRequestProposalFault, proposalFaults, proposalStateFor, proposalTransition } from "@/lib/method/proposal";
import { classificationSnapshotOf, determinationColumns } from "@/lib/method/snapshot";
import {
  evaluationContext,
  loadMethodConfig,
  draftOf,
  requisitionOfExercise,
  withLockedRequisitionForSourcing,
  type ExerciseOrg,
  type ExerciseRow,
  type SourcingRequisition,
} from "@/lib/method/repo";
import { DELIVERABLE_KINDS, type DeliverableKind, type Finding } from "@/lib/method/types";
import { parseSen, senToDecimalString } from "@/lib/money";
import { NumberingError, issueReference } from "@/lib/numbering/issue";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { deciderFaultText } from "@/lib/requisition/labels";
import { transitionFault as requisitionTransitionFault } from "@/lib/requisition/status";
import { FormReader } from "@/lib/validate";

/**
 * Writes for sourcing exercises (6.3).
 *
 * Every action is reachable by a direct POST, so each re-runs its checks inside one
 * transaction that locks the parent requisition and then the exercise, and reads the
 * issue in force, the configuration and the siblings there. The write and its audit
 * rows share the transaction; a refusal saves nothing and names what blocks it.
 * Nobody is signed in: a decision records the Person the officer names, "recorded on
 * behalf of, not signed", and the audit stays unattributed.
 */

const GONE: FormState = { ok: false, message: "That exercise no longer exists." };
const CHANGED: FormState = { ok: false, message: "The exercise changed while this was being saved. Reload and try again." };
const NO_ISSUE: FormState = { ok: false, message: "No approval matrix is in force, so the exercise's bands cannot be determined. Issue one under Configuration, Approval matrix." };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

function refresh(id?: string, requisitionId?: string) {
  revalidatePath("/sourcing");
  if (id) revalidatePath(`/sourcing/${id}`);
  if (requisitionId) revalidatePath(`/requisitions/${requisitionId}`);
}

async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

const labelOf = (x: { reference: string; title: string }) => `${x.reference} · ${x.title}`;
const refuse = (fs: readonly Finding[], lead = "Nothing was saved:") => ({ ok: false, message: `${lead} ${fs.map(findingText).join(" ")}` }) as FormState;

/// Run a write on an exercise under its requisition's lock and its own.
async function inExercise(id: string, fn: (tx: Tx, l: { org: ExerciseOrg; req: SourcingRequisition; ex: ExerciseRow }) => Promise<FormState>): Promise<FormState> {
  const reqId = await requisitionOfExercise(id);
  if (!reqId) return GONE;
  let result: FormState | null;
  try {
    result = await withLockedRequisitionForSourcing(reqId, id, (tx, l) => (l.ex ? fn(tx, { ...l, ex: l.ex }) : Promise.resolve(GONE)));
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    throw e;
  }
  if (result?.ok) refresh(id, reqId);
  return result ?? GONE;
}

// ------------------------------------------------------------------ the form

/// The scope lines, posted as JSON by the form. Anything malformed reads as none.
function readScope(data: FormData): { rows: ExerciseDraft["scope"]; bad: boolean } {
  try {
    const raw = JSON.parse(String(data.get("scope") ?? "[]"));
    if (!Array.isArray(raw)) return { rows: [], bad: true };
    let bad = false;
    const rows = raw
      .filter((l) => l && (l.amount || l.description))
      .map((l) => {
        const kind = DELIVERABLE_KINDS.includes(l.kind) ? (l.kind as DeliverableKind) : null;
        const amount = typeof l.amount === "string" && /^\d+(\.\d{1,2})?$/.test(l.amount.replace(/,/g, "").trim()) ? parseSen(l.amount) : null;
        if (!kind || amount == null) bad = true;
        return { kind: kind ?? "GOODS_DELIVERED", amount: amount ?? 0n, description: typeof l.description === "string" ? l.description.trim().slice(0, 400) : "" };
      });
    return { rows, bad };
  } catch {
    return { rows: [], bad: true };
  }
}

interface FormValues {
  title: string;
  draft: ExerciseDraft;
  coordinationAttendees: string;
  coordinationScopeNote: string;
  bqReference: string | null;
}

function readForm(r: FormReader, data: FormData, id: string | null): FormValues | null {
  const title = r.text("title", "Title", { required: true, max: 240 });
  const value = r.money("estimatedValue", "Estimated value", { required: true });
  const scope = readScope(data);
  if (scope.bad) r.reject("scope", "Every scope line needs what is delivered and an amount, to at most two decimal places.");
  const meeting = r.date("coordinationMeetingOn", "Coordination meeting");
  if (!value) return null;
  return {
    title,
    draft: {
      id,
      value: parseSen(value),
      methodCode: r.optionalText("sourcingMethodCode"),
      methodReason: r.text("methodReason", "Why this method", { max: 2000 }),
      externalRouteNote: r.text("externalRouteNote", "What the external body decided", { max: 2000 }),
      parentContractRef: r.optionalText("parentContractRef"),
      scope: scope.rows,
      contractTypeCode: r.optionalText("contractTypeCode"),
      typeReason: r.text("contractTypeOverrideReason", "Why this type", { max: 2000 }),
      typePersonId: r.optionalText("overriddenByPersonId"),
      basisCode: r.optionalText("contractBasisCode"),
      justificationReasonCode: r.optionalText("justificationReasonCode"),
      justificationText: r.text("justificationText", "Justification", { max: 4000 }),
      evidenceNote: r.text("evidenceNote", "Evidence", { max: 2000 }),
      dossierReference: null,
      emergencyTrigger: r.text("emergencyTrigger", "Emergency trigger", { max: 2000 }),
      coordinationMeetingOn: meeting ? storedDay(meeting) : null,
    },
    coordinationAttendees: r.text("coordinationAttendees", "Attendees", { max: 2000 }),
    coordinationScopeNote: r.text("coordinationScopeNote", "Scope fixed", { max: 4000 }),
    bqReference: r.optionalText("bqReference"),
  };
}

/// Field-level faults onto the form where a field is theirs; the rest as the message.
const FIELD_OF: Record<string, string> = {
  EXCEEDS_APPROVED_VALUE: "estimatedValue",
  METHOD_REQUIRED: "sourcingMethodCode",
  METHOD_UNKNOWN: "sourcingMethodCode",
  METHOD_RETIRED: "sourcingMethodCode",
  METHOD_NOT_IN_REGIME: "sourcingMethodCode",
  OVERRIDE_REASON_REQUIRED: "methodReason",
  SCOPE_REQUIRED: "scope",
  SCOPE_AMOUNT_INVALID: "scope",
  SCOPE_SUM_MISMATCH: "scope",
  TYPE_UNKNOWN: "contractTypeCode",
  TYPE_REASON_REQUIRED: "contractTypeOverrideReason",
  TYPE_PERSON_REQUIRED: "overriddenByPersonId",
  LOCKED: "contractTypeCode",
  BASIS_UNKNOWN: "contractBasisCode",
  REASON_UNKNOWN: "justificationReasonCode",
};

function faultState(r: FormReader, fs: readonly Finding[]): FormState {
  const loose: string[] = [];
  for (const f of fs) {
    const field = FIELD_OF[f.code];
    if (field && !r.errors[field]) r.reject(field, findingText(f));
    else loose.push(findingText(f));
  }
  return { ok: false, errors: r.errors, message: `Nothing was saved. ${loose.join(" ") || "Correct the fields marked below."}` };
}

/// What the method does not ask for is not kept (lib: keptForMethod).
function methodColumns(v: FormValues, ev: Evaluation) {
  const d = v.draft;
  const kept = keptForMethod(ev.method, {
    methodCode: d.methodCode,
    proposedCode: ev.bands.proposed.state === "PROPOSED" ? ev.bands.proposed.code : null,
    methodReason: d.methodReason,
    parentContractRef: d.parentContractRef,
    justificationReasonCode: d.justificationReasonCode,
    justificationText: d.justificationText,
    evidenceNote: d.evidenceNote,
    emergencyTrigger: d.emergencyTrigger,
    coordinationMeetingOn: d.coordinationMeetingOn,
    coordinationAttendees: v.coordinationAttendees,
    coordinationScopeNote: v.coordinationScopeNote,
    bqReference: v.bqReference,
  });
  return {
    ...kept,
    sourcingMethodCode: d.methodCode ?? "",
    externalRouteNote: d.externalRouteNote,
    coordinationMeetingOn: kept.coordinationMeetingOn ? dayToDate(kept.coordinationMeetingOn) : null,
    contractTypeOverrideReason: ev.type.state === "DERIVED" ? "" : d.typeReason,
    overriddenByPersonId: ev.type.state === "DERIVED" ? null : d.typePersonId,
    contractBasisCode: d.basisCode,
  };
}

const methodNameOf = (cfg: { methods: { code: string; nameEn: string }[] }) => (code: string) => cfg.methods.find((m) => m.code === code)?.nameEn ?? "A method no longer configured";

/// The audit view of an exercise's own fields: money as figures, JSON left out.
function auditView(x: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (["bandSnapshot", "bandWarnings", "classificationSnapshot", "determinedAt", "authorityMatrixId", "updatedAt", "createdAt", "id", "organisationId", "requisitionId"].includes(k)) continue;
    out[k] = v != null && typeof v === "object" && "toFixed" in (v as object) ? String(v) : v;
  }
  return out;
}

/// Replace the scope lines and the derived taxonomy values, audited row by row.
async function writeChildren(tx: Tx, orgId: string, ex: { id: string; reference: string }, before: ExerciseRow | null, scope: ExerciseDraft["scope"], ev: Evaluation, cfg: { taxonomies: { code: string; nameEn: string; values: { code: string; nameEn: string }[] }[] }) {
  // The trail names what it records: codes are configuration keys.
  const taxName = (t: string) => cfg.taxonomies.find((x) => x.code === t)?.nameEn ?? "A classification no longer configured";
  const valName = (t: string, v: string) => cfg.taxonomies.find((x) => x.code === t)?.values.find((x) => x.code === v)?.nameEn ?? "A value no longer configured";
  const same =
    before &&
    before.scopeParts.length === scope.length &&
    before.scopeParts.every((p, i) => p.deliverableKind === scope[i].kind && parseSen(p.amount.toString()) === scope[i].amount && p.description === scope[i].description);
  if (!same) {
    for (const p of before?.scopeParts ?? []) {
      await tx.exerciseScopePart.delete({ where: { id: p.id } });
      await audit(tx, orgId, "ExerciseScopePart", p.id, `${ex.reference} · scope`, "DELETE", snapshotFields({ deliverableKind: p.deliverableKind, amount: p.amount.toString(), description: p.description }));
    }
    for (const [i, p] of scope.entries()) {
      const row = await tx.exerciseScopePart.create({ data: { exerciseId: ex.id, deliverableKind: p.kind, amount: senToDecimalString(p.amount), description: p.description, sortOrder: i } });
      await audit(tx, orgId, "ExerciseScopePart", row.id, `${ex.reference} · scope`, "CREATE", diffFields(null, { deliverableKind: p.kind, amount: senToDecimalString(p.amount), description: p.description }));
    }
  }
  // Taxonomy values: derived ones follow the type; a chosen pick stays while it is
  // still among the candidates.
  const keep = new Map(ev.taxonomies.filter((t) => t.valueCode && (t.state === "DERIVED" || t.state === "CHOSEN")).map((t) => [t.taxonomyCode, t]));
  for (const tv of before?.taxonomyValues ?? []) {
    const next = keep.get(tv.taxonomyCode);
    if (next && next.valueCode === tv.valueCode && next.state === tv.pick) {
      keep.delete(tv.taxonomyCode);
      continue;
    }
    await tx.exerciseTaxonomyValue.delete({ where: { id: tv.id } });
    await audit(tx, orgId, "ExerciseTaxonomyValue", tv.id, `${ex.reference} · classification`, "DELETE", snapshotFields({ taxonomy: taxName(tv.taxonomyCode), value: valName(tv.taxonomyCode, tv.valueCode), pick: tv.pick }));
  }
  for (const t of keep.values()) {
    const row = await tx.exerciseTaxonomyValue.create({ data: { exerciseId: ex.id, taxonomyCode: t.taxonomyCode, valueCode: t.valueCode!, pick: t.state as "DERIVED" | "CHOSEN" } });
    await audit(tx, orgId, "ExerciseTaxonomyValue", row.id, `${ex.reference} · classification`, "CREATE", diffFields(null, { taxonomy: taxName(t.taxonomyCode), value: valName(t.taxonomyCode, t.valueCode!), pick: t.state }));
  }
}

/**
 * Open an exercise on an approved requisition (ruling R-6). The reference is issued
 * from the `exercise` series in the same transaction as the row and its audit.
 */
export async function createExercise(_prev: FormState, data: FormData): Promise<FormState> {
  const requisitionId = String(data.get("requisitionId") ?? "");
  const r = new FormReader(data);
  const v = readForm(r, data, null);
  if (!v || r.failed) return { ok: false, errors: r.errors, message: "Nothing was saved. Correct the fields marked below." };

  let id: string | null = null;
  try {
    const result = await withLockedRequisitionForSourcing(requisitionId, null, async (tx, l): Promise<FormState> => {
      const { issue, cfg, ctx } = await evaluationContext(l.org, l.req, null, tx);
      const fault = openFault(
        { status: l.req.status, sourcingPermitted: l.req.sourcingPermitted, approvedRoute: !!ctx?.approved },
        { today: l.org.today, methodsConfigured: cfg.config.methods.length > 0 },
      );
      if (fault) return refuse([fault], "No exercise was opened:");
      if (!issue || !ctx) return NO_ISSUE;
      const ev = evaluateExercise(v.draft, ctx);
      const blockers = saveBlockers(ev.findings);
      if (blockers.length > 0) return faultState(r, blockers);
      const on = dayToDate(l.org.today!);
      const reference = await issueReference(tx, l.org.id, "exercise", on);
      const m = ev.method!;
      const row = await tx.sourcingExercise.create({
        data: {
          organisationId: l.org.id,
          requisitionId: l.req.id,
          reference,
          title: v.title,
          estimatedValue: senToDecimalString(v.draft.value),
          status: "DRAFT",
          requisitionRuleKey: ctx.approved?.ruleKey ?? null,
          requisitionRuleLabel: ctx.approved?.ruleLabel ?? null,
          proposalState: proposalStateFor(m.requiresProposal, null, true),
          ...determinationColumns(ev, issue, methodNameOf(cfg.config), on),
          ...methodColumns(v, ev),
        },
      });
      await audit(tx, l.org.id, "SourcingExercise", row.id, labelOf(row), "CREATE", diffFields(null, { ...auditView(row), requisition: l.req.reference }));
      await writeChildren(tx, l.org.id, row, null, v.draft.scope, ev, cfg.config);
      id = row.id;
      return { ok: true };
    });
    if (!result) return { ok: false, message: "That requisition no longer exists." };
    if (!result.ok) return result;
  } catch (e) {
    if (e instanceof NumberingError) {
      return {
        ok: false,
        message:
          e.fault === "SERIES_MISSING"
            ? "No numbering series for sourcing exercises is configured, so no reference can be issued. Add the series keyed “exercise” under Configuration, Numbering."
            : "The sourcing exercises numbering series is not valid. Correct it under Configuration, Numbering.",
      };
    }
    throw e;
  }
  refresh(id!, requisitionId);
  redirect(`/sourcing/${id}`);
}

/**
 * Edit a draft. A change of method or value after the name was sent for approval
 * withdraws that route, on the record: it approved a different exercise (build
 * decision BD-5). A change of method re-opens the proposal; answers are kept.
 */
export async function updateExercise(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = readForm(r, data, id);
  if (!v || r.failed) return { ok: false, errors: r.errors, message: "Nothing was saved. Correct the fields marked below." };

  const result = await inExercise(id, async (tx, l): Promise<FormState> => {
    const ex = l.ex;
    if (ex.status !== "DRAFT") return { ok: false, message: `Only a draft exercise can be edited. This one is ${EXERCISE_STATUS_LABEL[ex.status].toLowerCase()}.` };
    if (!l.org.today) return { ok: false, message: findingText({ code: "TIME_ZONE_UNSET", level: "block" }) };
    const { issue, cfg, ctx } = await evaluationContext(l.org, l.req, ex, tx);
    if (!issue || !ctx) return NO_ISSUE;
    const ev = evaluateExercise(v.draft, ctx);
    const blockers = saveBlockers(ev.findings);
    if (blockers.length > 0) return faultState(r, blockers);
    const on = dayToDate(l.org.today);
    const methodChanged = ex.sourcingMethodCode !== v.draft.methodCode;
    const valueChanged = parseSen(ex.estimatedValue.toString()) !== v.draft.value;
    const after = {
      title: v.title,
      estimatedValue: senToDecimalString(v.draft.value),
      proposalState: proposalStateFor(ev.method!.requiresProposal, ex.proposalState, methodChanged),
      ...(methodChanged ? { proposalSubmittedOn: null, proposalReviewedOn: null, proposalReviewerPersonId: null, proposalReviewComment: "" } : {}),
      ...determinationColumns(ev, issue, methodNameOf(cfg.config), on),
      ...methodColumns(v, ev),
    };
    const moved = await tx.sourcingExercise.updateMany({ where: { id, status: "DRAFT", updatedAt: ex.updatedAt }, data: after });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, "SourcingExercise", id, labelOf(ex), "UPDATE", diffFields(auditView(ex), auditView(after)), String(data.get("reason") ?? ""));
    await writeChildren(tx, l.org.id, ex, ex, v.draft.scope, ev, cfg.config);
    const withdraw = nameRoutesToWithdraw(ex.approvalInstances, { methodChanged, valueChanged });
    for (const inst of withdraw.routes) {
      const warning = { code: "WITHDRAWN_ON_CHANGE", level: "warn", messageEn: `${withdraw.reason} This route no longer describes the exercise, so it was withdrawn.` };
      await tx.approvalInstance.update({
        where: { id: inst.id },
        data: { status: "RECALLED", closedAt: new Date(), warnings: [...((inst.warnings as object[]) ?? []), warning] as unknown as Prisma.InputJsonValue },
      });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, `${ex.reference} · approval of the name`, "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), withdraw.reason ?? "");
    }
    return { ok: true };
  });
  if (!result.ok) return result;
  redirect(`/sourcing/${id}`);
}

/// Resolve an ambiguous classification with the officer's pick, stored as chosen.
export async function chooseTaxonomyValue(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const taxonomyCode = r.text("taxonomyCode", "Classification", { required: true });
  const valueCode = r.text("valueCode", "Value", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status !== "DRAFT") return { ok: false, message: "Only a draft exercise's classification can be changed." };
    const { ctx } = await evaluationContext(l.org, l.req, ex, tx);
    if (!ctx) return NO_ISSUE;
    const { deriveTaxonomies } = await import("@/lib/method/taxonomy");
    const outcome = deriveTaxonomies(ex.contractTypeCode, ex.contractBasisCode, [], ctx.config.mappings, ctx.config.taxonomies, ctx.on).find((t) => t.taxonomyCode === taxonomyCode);
    if (!outcome || outcome.state !== "AMBIGUOUS") return { ok: false, message: "That classification is not waiting for a choice." };
    if (!outcome.candidates.includes(valueCode)) return { ok: false, errors: { valueCode: "Choose one of the values the mapping allows." } };
    const prior = ex.taxonomyValues.find((t) => t.taxonomyCode === taxonomyCode);
    if (prior) {
      await tx.exerciseTaxonomyValue.update({ where: { id: prior.id }, data: { valueCode, pick: "CHOSEN" } });
      await audit(tx, l.org.id, "ExerciseTaxonomyValue", prior.id, `${ex.reference} · classification`, "UPDATE", diffFields({ value: ctx.config.taxonomies.find((t) => t.code === taxonomyCode)?.values.find((v) => v.code === prior.valueCode)?.nameEn ?? null, pick: prior.pick }, { value: ctx.config.taxonomies.find((t) => t.code === taxonomyCode)?.values.find((v) => v.code === valueCode)?.nameEn ?? null, pick: "CHOSEN" }));
    } else {
      const row = await tx.exerciseTaxonomyValue.create({ data: { exerciseId: ex.id, taxonomyCode, valueCode, pick: "CHOSEN" } });
      await audit(tx, l.org.id, "ExerciseTaxonomyValue", row.id, `${ex.reference} · classification`, "CREATE", diffFields(null, { taxonomy: ctx.config.taxonomies.find((t) => t.code === taxonomyCode)?.nameEn ?? null, value: ctx.config.taxonomies.find((t) => t.code === taxonomyCode)?.values.find((v) => v.code === valueCode)?.nameEn ?? null, pick: "CHOSEN" }));
    }
    return { ok: true };
  });
}

// --------------------------------------------------------------- the proposal

/// The answers to the method's proposal items, while the proposal is being prepared.
export async function saveProposalAnswers(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status !== "DRAFT" || ex.proposalState !== "DRAFT") return { ok: false, message: "The proposal can be changed only while it is being prepared." };
    const cfg = await loadMethodConfig(l.org.id, tx);
    const items = cfg.checklist[ex.sourcingMethodCode] ?? [];
    for (const item of items) {
      if (!data.has(`item_${item.key}`)) continue;
      const text = String(data.get(`item_${item.key}`) ?? "").trim().slice(0, 8000);
      const prior = ex.proposalAnswers.find((a) => a.itemKey === item.key);
      if (prior && prior.text === text) continue;
      if (prior) {
        await tx.exerciseProposalAnswer.update({ where: { id: prior.id }, data: { text, answeredAt: new Date() } });
        await audit(tx, l.org.id, "ExerciseProposalAnswer", prior.id, `${ex.reference} · ${item.labelEn}`, "UPDATE", diffFields({ text: prior.text }, { text }));
      } else if (text) {
        const row = await tx.exerciseProposalAnswer.create({ data: { exerciseId: ex.id, itemKey: item.key, text } });
        await audit(tx, l.org.id, "ExerciseProposalAnswer", row.id, `${ex.reference} · ${item.labelEn}`, "CREATE", diffFields(null, { text }));
      }
    }
    return { ok: true };
  });
}

export async function submitProposal(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status !== "DRAFT") return { ok: false, message: "Only a draft exercise's proposal can be submitted." };
    const cfg = await loadMethodConfig(l.org.id, tx);
    const on = l.org.today ? dayToDate(l.org.today) : new Date();
    const faults = proposalFaults(cfg.checklist[ex.sourcingMethodCode] ?? [], ex.proposalAnswers, on);
    const t = proposalTransition(ex.proposalState, "SUBMITTED", { faults, today: l.org.today });
    if (t.length > 0) return refuse(t, "The proposal cannot be submitted:");
    await tx.sourcingExercise.update({ where: { id }, data: { proposalState: "SUBMITTED", proposalSubmittedOn: on } });
    await audit(tx, l.org.id, "SourcingExercise", id, labelOf(ex), "UPDATE", diffFields({ proposalState: ex.proposalState }, { proposalState: "SUBMITTED", proposalSubmittedOn: on }));
    return { ok: true };
  });
}

/// C&P's review: reviewed, or returned for amendment. The reviewer is a named Person,
/// recorded on their behalf.
export async function reviewProposal(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["REVIEWED", "DRAFT"] as const, { required: true });
  const personId = r.text("reviewerPersonId", "Reviewed by", { required: true });
  const on = r.date("reviewedOn", "Reviewed on", { required: true });
  const comment = r.text("comment", "Comment", { max: 4000 });
  if (outcome === "DRAFT" && !comment) r.reject("comment", "Say what needs amending.");
  if (r.failed || !outcome || !on) return { ok: false, errors: r.errors };
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status !== "DRAFT") return { ok: false, message: "Only a draft exercise's proposal can be reviewed." };
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
    const t = proposalTransition(ex.proposalState, outcome, { faults: [], reviewerPersonId: person?.id ?? null, on: storedDay(on), today: l.org.today });
    if (t.length > 0) return refuse(t, "The review was not recorded:");
    const after = { proposalState: outcome, proposalReviewedOn: outcome === "REVIEWED" ? on : null, proposalReviewerPersonId: person!.id, proposalReviewComment: comment };
    await tx.sourcingExercise.update({ where: { id }, data: after });
    await audit(tx, l.org.id, "SourcingExercise", id, labelOf(ex), "UPDATE",
      diffFields({ proposalState: ex.proposalState, proposalReviewComment: ex.proposalReviewComment }, { ...after, proposalReviewerPersonId: undefined, reviewedBy: person!.name, recordedOnBehalf: "not signed" }), comment);
    return { ok: true };
  });
}

// ------------------------------------------------------------ approval of the name

const nameLabel = (ex: { reference: string }) => `${ex.reference} · approval of the name`;

/**
 * Send the name for approval (FR-MTD-008): the route resolved now, under the issue in
 * force, persisted with every rule it was judged under. Invitation is not in the portal
 * in Phase 1, so this gate is recorded and shown, not enforced (ruling R-13).
 */
export async function requestNameApproval(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status !== "DRAFT") return { ok: false, message: "The name is sent for approval while the exercise is a draft." };
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }], "Not sent:");
    if (ex.approvalInstances.some((i) => i.status === "PENDING" || i.status === "APPROVED")) return refuse([{ code: "NAME_ALREADY_REQUESTED", level: "block" }], "Not sent:");
    const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, ex, tx);
    if (!issue || !ctx) return NO_ISSUE;
    const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode);
    if (!method?.requiresNameApproval) return { ok: false, message: "This exercise's method does not ask for approval of the name." };
    const pf = nameRequestProposalFault(method.requiresProposal, ex.proposalState);
    if (pf) return refuse([pf], "Not sent:");
    const value = parseSen(ex.estimatedValue.toString());
    const res = resolveNameApproval(ctx.funder, method, Number(senToDecimalString(value)));
    if (res.nameState !== "RESOLVED") {
      const { NAME_STATE_TEXT } = await import("@/lib/method/labels");
      return refuse([{ code: "NAME_ROUTE_UNAVAILABLE", level: "block", data: { text: NAME_STATE_TEXT[res.nameState] } }], "Not sent:");
    }
    const errors = res.warnings.filter((w) => w.level === "err");
    if (errors.length > 0) return { ok: false, message: `Not sent: ${errors.map((w) => w.messageEn).join(" ")}` };
    const src = res.source === "OVERRIDE" && ctx.funder.override ? ctx.funder.override : { id: issue.id, label: issue.label, matrix: issue.matrix };
    const rule = (src.matrix.rules.find((x) => x.ruleKey === res.ruleKey) ?? null)!;
    const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    const on = dayToDate(l.org.today);
    const { boundaryOperatorFor } = await import("@/lib/authority/resolve");
    const instance = await tx.approvalInstance.create({
      data: {
        organisationId: l.org.id,
        matterKind: "EXERCISE",
        exerciseId: ex.id,
        domain: "name_approval",
        value: ex.estimatedValue,
        authorityMatrixId: issue.id,
        matrixLabel: issue.label,
        ruleKey: rule.ruleKey,
        ruleLabel: rule.labelEn,
        ruleClause: rule.clause,
        boundaryValue: String(src.matrix.policy.boundaryValue),
        boundaryInclusive: src.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
        boundaryOperator: boundaryOperatorFor(rule, src.matrix.policy),
        fundingRouteCode: l.req.fundingRouteCode,
        fundingOverrideApplied: res.source === "OVERRIDE",
        overrideMatrixId: res.overrideIssue?.id ?? null,
        overrideMatrixLabel: res.overrideIssue?.label ?? null,
        checkedAgainstMatrix: true,
        warnings: res.warnings as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        openedAt: on,
        steps: {
          create: res.chain.map((s, i) => ({
            sequence: i + 1,
            roleCode: s.roleCode,
            roleLabel: roleLabel(s.roleCode),
            act: s.act,
            committeeCode: s.committeeCode ?? null,
            nonDelegable: s.nonDelegable,
            sourceRuleKey: s.sourceRuleKey,
          })),
        },
      },
    });
    await audit(tx, l.org.id, "ApprovalInstance", instance.id, nameLabel(ex), "CREATE",
      diffFields(null, { matrix: issue.label, rule: rule.labelEn, route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: res.source === "OVERRIDE" }));
    return { ok: true };
  });
}

/// Record a named Person's decision on a step of the name's route: recorded on their
/// behalf, not signed. The holder, delegation, self-approval and date checks are 6.1's.
export async function recordNameDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const stepId = String(data.get("stepId") ?? "");
  const r = new FormReader(data);
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };

  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    const inst = ex.approvalInstances.find((i) => i.status === "PENDING");
    if (!inst || ex.status === "CANCELLED") return { ok: false, message: "No approval of the name is open on this exercise." };
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: "That step is not on the open route." };
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE, tx), await loadDelegations(ORGANISATION_CODE, tx)];
    const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, on).reverse().map((u) => u.code);
    const decidedOn = storedDay(on);
    const check = deciderFaults(step, {
      today: l.org.today,
      holders: step.roleCode ? holdersFor(step.roleCode, unitPath, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      person,
      // Nobody decides the name for an exercise on a requisition they raised.
      requesterId: l.req.requestingPersonId,
      endorserIds: [],
      otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
      earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
      decidedOn,
      openedOn: storedDay(inst.openedAt),
      value: parseSen(ex.estimatedValue.toString()),
    });
    if (check.faults.length > 0) {
      const texts = check.faults.map((f) => deciderFaultText(f, person?.name ?? null));
      return ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } };
    }
    const after = { decision, decidedByPersonId: person!.id, decidedByName: person!.name, decidedOn: on, delegationId: check.delegationId, reason, recordedAt: new Date() };
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING" }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, "ApprovalStep", step.id, `${ex.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), reason);
    const closes = decision === "REJECTED" ? "REJECTED" : inst.steps.every((s) => s.id === step.id || s.decision === "DONE") ? "APPROVED" : null;
    if (closes) {
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: closes, closedAt: new Date() } });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, nameLabel(ex), "UPDATE", diffFields({ status: inst.status }, { status: closes }), reason);
    }
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the states

/**
 * Move into documents in preparation (§7.3.2): method, basis and type set, nothing
 * blocking, re-judged now under the lock. Writes the decided record, numbers the
 * dossier where the method keeps one, and moves the requisition into Sourcing the
 * first time.
 */
export async function moveToPreparation(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  try {
    return await inExercise(id, async (tx, l) => {
      const ex = l.ex;
      const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, ex, tx);
      if (!issue || !ctx) return NO_ISSUE;
      const ev = evaluateExercise(draftOf(ex), ctx);
      const blocking = ev.findings.filter((f) => f.level === "block");
      const t = transitionFault(ex.status, "DOCUMENTS_IN_PREPARATION", {
        today: l.org.today,
        methodSet: !!ev.method,
        typeSet: !!ev.type.code && !!ev.type.state,
        basisSet: !!ex.contractBasisCode,
        proposalRequired: ev.method?.requiresProposal ?? false,
        proposalState: ex.proposalState,
        ambiguousTaxonomies: ev.taxonomies.filter((x) => x.state === "AMBIGUOUS").length,
        blockingFaults: 0,
      });
      if (t.length > 0 || blocking.length > 0) return refuse([...t, ...blocking], "Not moved into preparation:");
      const on = dayToDate(l.org.today!);
      const committeeName = (code: string) => issue.matrix.roles[code]?.nameEn ?? "A committee no longer configured";
      const snapshot = classificationSnapshotOf(ev, cfg.config, ex.contractBasisCode, committeeName, behaviourProfile);
      if (!snapshot) return { ok: false, message: "Not moved into preparation: the method, contract type or basis is no longer configured." };
      const dossierReference = ev.method!.requiresDossier && !ex.dossierReference
        ? ev.method!.dossierSeriesKey
          ? await issueReference(tx, l.org.id, ev.method!.dossierSeriesKey, on)
          : null
        : ex.dossierReference;
      if (ev.method!.requiresDossier && !dossierReference) {
        return { ok: false, message: "Not moved into preparation: the method keeps a justification dossier but names no numbering series for it. Set one on the method under Reference data." };
      }
      const after = {
        status: "DOCUMENTS_IN_PREPARATION" as const,
        preparedAt: on,
        dossierReference,
        classificationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        ...determinationColumns(ev, issue, methodNameOf(cfg.config), on),
      };
      const moved = await tx.sourcingExercise.updateMany({ where: { id, status: "DRAFT", updatedAt: ex.updatedAt }, data: after });
      if (moved.count !== 1) throw new Refusal(CHANGED);
      await audit(tx, l.org.id, "SourcingExercise", id, labelOf(ex), "UPDATE", diffFields({ status: ex.status, dossierReference: ex.dossierReference }, { status: after.status, dossierReference, decidedRecord: "written" }));
      await writeChildren(tx, l.org.id, ex, ex, draftOf(ex).scope, ev, cfg.config);
      if (l.req.status === "APPROVED") {
        const rf = requisitionTransitionFault("APPROVED", "SOURCING", { today: l.org.today });
        if (rf) throw new Refusal({ ok: false, message: "The requisition cannot move into sourcing." });
        const rm = await tx.requisition.updateMany({ where: { id: l.req.id, status: "APPROVED" }, data: { status: "SOURCING" } });
        if (rm.count !== 1) throw new Refusal(CHANGED);
        await audit(tx, l.org.id, "Requisition", l.req.id, `${l.req.reference} · ${l.req.title}`, "UPDATE", diffFields({ status: "APPROVED" }, { status: "SOURCING" }), `Exercise ${ex.reference} moved into preparation.`);
      }
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof NumberingError) {
      return { ok: false, message: `The numbering series for the justification dossier is ${e.fault === "SERIES_MISSING" ? "not configured" : "not valid"}. Set it under Configuration, Numbering.` };
    }
    throw e;
  }
}

/// Cancel an exercise, with a reason. An assumption: §7.3.2 gives it no SOP path. An
/// open name-approval route is withdrawn with it.
export async function cancelExercise(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    const t = transitionFault(ex.status, "CANCELLED", { today: l.org.today, reason });
    if (t.length > 0) return t[0].code === "CANCEL_REASON_REQUIRED" ? { ok: false, errors: { reason: findingText(t[0]) } } : refuse(t, "Not cancelled:");
    const moved = await tx.sourcingExercise.updateMany({ where: { id, status: ex.status }, data: { status: "CANCELLED", cancelReason: reason } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, "SourcingExercise", id, labelOf(ex), "UPDATE", diffFields({ status: ex.status }, { status: "CANCELLED" }), reason);
    for (const inst of ex.approvalInstances.filter((i) => i.status === "PENDING")) {
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "RECALLED", closedAt: new Date() } });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, nameLabel(ex), "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), `The exercise was cancelled: ${reason}`);
    }
    return { ok: true };
  });
}

// --------------------------------------------------------------- participants

/// A named participant of a restricted exercise (FR-MTD-007). Not enforced until sign-in.
export async function addParticipant(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const personId = r.text("personId", "Person", { required: true });
  const capacity = r.text("capacity", "Capacity", { max: 200 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status === "CANCELLED") return { ok: false, message: "A cancelled exercise's participants are kept as they were." };
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    if (ex.participants.some((p) => p.personId === person.id)) return { ok: false, errors: { personId: `${person.name} is already named.` } };
    const row = await tx.exerciseParticipant.create({ data: { exerciseId: ex.id, personId: person.id, capacity } });
    await audit(tx, l.org.id, "ExerciseParticipant", row.id, `${ex.reference} · ${person.name}`, "CREATE", diffFields(null, { person: person.name, capacity }));
    return { ok: true };
  });
}

export async function removeParticipant(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const participantId = String(data.get("participantId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  return inExercise(id, async (tx, l) => {
    const ex = l.ex;
    if (ex.status === "CANCELLED") return { ok: false, message: "A cancelled exercise's participants are kept as they were." };
    const p = ex.participants.find((x) => x.id === participantId);
    if (!p) return { ok: false, message: "That participant is no longer named." };
    await tx.exerciseParticipant.delete({ where: { id: p.id } });
    await audit(tx, l.org.id, "ExerciseParticipant", p.id, `${ex.reference} · ${p.person.name}`, "DELETE", snapshotFields({ person: p.person.name, capacity: p.capacity }), reason);
    return { ok: true };
  });
}
