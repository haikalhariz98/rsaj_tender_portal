"use server";

import type { Reader } from "@/lib/auth/sulit-store";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { closeRejected } from "@/lib/approvals/rejection-store";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { dayToDate, storedDay } from "@/lib/dates";
import { attachFault } from "@/lib/documents/attach";
import { attached } from "@/lib/documents/audit-view";
import { tenderPackPartFacts } from "@/lib/documents/owner-facts";
import { ACT_LABEL } from "@/lib/labels";
import { exerciseRouteMatter, requesterHolding, tenderingRoutesOf } from "@/lib/method/approval";
import { findingText } from "@/lib/method/labels";
import { ExerciseMoveRefused, moveExercise } from "@/lib/method/move";
import { evaluationContext, requisitionOfExercise, withLockedRequisitionForSourcing, type ExerciseOrg, type ExerciseRow, type SourcingRequisition } from "@/lib/method/repo";
import { senToDecimalString, parseSen } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";
import { deciderFaultText } from "@/lib/requisition/labels";
import { lockBqRows, lockLiveEstimateRows, lockPanelRow } from "@/lib/scope/lock";
import { loadScopePolicy } from "@/lib/scope/repo";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { appendixComplete, appendixFaults, type AppendixFacts } from "@/lib/tender-docs/appendix";
import { appendixAudit, ENTITY, packCreatedAudit, packStatusAudit, partAudit, type PartAuditFacts } from "@/lib/tender-docs/audit-view";
import { formLabel, resolveComposition } from "@/lib/tender-docs/composition";
import { packFieldValues } from "@/lib/tender-docs/fields";
import { appendixText, freezePack } from "@/lib/tender-docs/freeze";
import { appendixFaultText, datesFaultText, PACK_KIND_LABEL, partFaultText, startFaultText, submitFindingTexts } from "@/lib/tender-docs/labels";
import { lockPackRows } from "@/lib/tender-docs/owner";
import { allOf, blockingOf, markReadyFaults, nextPack, omitFaults, packEditFault, pickTemplateFaults, startPackFaults, submitFaults } from "@/lib/tender-docs/pack";
import { CONFIG_STILL_UNSET, confirmedChangesFault, flagChanges } from "@/lib/tender-docs/refresh";
import { isPct, PCT_COLUMN, pctRefusal, type PctField } from "@/lib/tender-docs/percent";
import { liveClauses } from "@/lib/tender-docs/clauses";
import { conditionFieldValues, conditionsSnapshot, conditionStamp, readConditionsSnapshot } from "@/lib/tender-docs/conditions";
import { packWhitelist } from "@/lib/tender-docs/fields";
import { appendixFactsOf, loadClauses, loadConditions, loadConfiguredParts, loadPacks, loadTemplates, partFactsOf, pinnedFilesOf, profileOf, scopeReadiness, templateFactsOf, type PackRow } from "@/lib/tender-docs/repo";
import { approvalDatesFault, estimateLeadWarning, frozenWindowFault, RETURN_DECIDED_BY, returnOutcome, TENDERING_DOMAIN, tenderingRejectionSnapshot, tenderingRouteForRequester } from "@/lib/tender-docs/tendering";
import type { Finding } from "@/lib/tender-docs/types";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import { routeRequesterId, routeSenderBarredId } from "@/lib/approvals/requester";

/**
 * Writes for 6.4 increment 1: an exercise's tender pack, its parts and its Appendix, the
 * submission for Approval for Tendering and the decisions on that route (plan §4).
 *
 * Every action is reachable by a direct POST, so each locks the exercise's requisition,
 * then the exercise (`withLockedExerciseScope`), then the exercise's pack rows
 * (`lockPackRows`) — and a submission then the 6.2 rows it judges — re-reads what it
 * judges inside that transaction, re-runs the pure rule (`src/lib/tender-docs`) on the
 * locked data, and writes with its audit rows in the same transaction. A refusal saves
 * nothing and names what blocks it and where to fix it. Who is signed in is asked first and named on every audit row; a Person the form picks is still only recorded on their behalf, "not signed" (Phase 2b changes that).
 */

const GONE: FormState = { ok: false, message: "That exercise no longer exists." };
const CHANGED: FormState = { ok: false, message: "The exercise changed while this was being saved. Reload and try again." };
const NO_PACK: FormState = { ok: false, message: "There is no draft of the tender documents to change. Start one on the Tender documents tab." };
const NO_ZONE: FormState = { ok: false, message: "The organisation's time zone is not set, so no tendering act can be dated. Set it under Configuration, Organisation." };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

const refuse = (fs: readonly Finding[], text: (f: Finding) => string = partFaultText, lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${fs.filter((f) => f.level === "block").map(text).join(" ")}` });

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Every 6.4 row is labelled with its exercise's reference, so the exercise's History finds it.
const label = (l: { ex: { reference: string } }, what: string) => `${l.ex.reference} · ${what}`;
const packLabel = (l: { ex: { reference: string } }, p: { versionNo: number }) => label(l, `Tender documents v${p.versionNo}`);

/// The exercise as an action holds it: its organisation, requisition and row, read under the lock.
type LockedExercise = { org: ExerciseOrg; req: SourcingRequisition; ex: ExerciseRow };

/// Lock the exercise (requisition first), then its packs, and run `fn` on the packs read under the lock.
async function inPacks(scope: Reader, exerciseId: string, fn: (tx: Tx, l: LockedExercise, packs: PackRow[]) => Promise<FormState>): Promise<FormState> {
  const requisitionId = await requisitionOfExercise(scope.organisationId, exerciseId);
  if (!requisitionId) return GONE;
  let result: FormState | null;
  try {
    result = await withLockedRequisitionForSourcing(scope, requisitionId, exerciseId, async (tx, l) => {
      if (!l.ex) return GONE;
      await lockPackRows(tx, exerciseId);
      return fn(tx, { org: l.org, req: l.req, ex: l.ex }, await loadPacks(exerciseId, tx));
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    if (e instanceof ExerciseMoveRefused) return e.findings[0]?.code === "CHANGED" ? CHANGED : refuse(e.findings, findingText, "The exercise cannot move:");
    if (transactionTimedOut(e)) return { ok: false, message: "This took too long and nothing was saved. Try again." };
    throw e;
  }
  if (result?.ok) {
    revalidatePath(`/sourcing/${exerciseId}`);
    revalidatePath("/sourcing");
    revalidatePath("/approvals");
  }
  return result ?? GONE;
}

const draftOf = (packs: readonly PackRow[]) => packs.find((p) => p.status === "DRAFT") ?? null;

/// The merge fields a pack's template may name today: the pack's own and the live clauses' (FR-DOC-011).
async function whitelistOn(tx: Tx, organisationId: string, today: string | null) {
  return packWhitelist(today ? liveClauses(await loadClauses(organisationId, tx), today) : []);
}
const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");

/// Office and committee names by code, as configured (for the Appendix's words).
async function officeNames(tx: Tx, organisationId: string) {
  const roles = await tx.authorityRole.findMany({ where: { organisationId }, select: { code: true, nameEn: true } });
  const names = new Map(roles.map((r) => [r.code, r.nameEn]));
  return { codes: [...names.keys()], name: (code: string | null) => (code ? (names.get(code) ?? "An office no longer configured") : "Not set") };
}

const partAuditFacts = (p: { printedNumber: string; labelSnapshot: string; role: PartAuditFacts["role"]; content: PartAuditFacts["content"]; source: PartAuditFacts["source"]; mandatory: boolean | null; inTableDocument: boolean | null; returnedByBidder?: boolean | null; state: PartAuditFacts["state"]; omittedReason: string }, templateName: string | null): PartAuditFacts => ({
  printedNumber: p.printedNumber,
  label: p.labelSnapshot,
  role: p.role,
  content: p.content,
  source: p.source,
  mandatory: p.mandatory,
  inTableDocument: p.inTableDocument,
  returnedByBidder: p.returnedByBidder,
  state: p.state,
  omittedReason: p.omittedReason,
  templateName,
});

// ------------------------------------------------------------------ starting a pack

/**
 * Start the exercise's tender documents: version 1 from the configured composition for its
 * pack kind and basis, or — where the latest version was returned for amendment — the next
 * version, continuing the returned one: its parts' states, templates and omissions, its
 * uploaded files (each judged again by `attachFault`), and its Appendix are carried; the
 * returned version stays as it was frozen.
 */
export async function startPack(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    if (!l.org.today) return NO_ZONE;
    const configured = await loadConfiguredParts(l.org.id, tx);
    const kind = l.ex.packKindSnapshot ?? "NONE";
    const composition = resolveComposition(configured, kind, l.ex.contractBasisCode, l.org.today);
    const faults = startPackFaults({ exerciseStatus: l.ex.status, packKindSnapshot: l.ex.packKindSnapshot, packs, composition });
    if (faults.length || "fault" in composition) return refuse(faults, startFaultText, "Not started:");
    const templates = await loadTemplates(l.org.id, tx);
    const byCode = new Map(templates.map((t) => [t.code, t]));
    const form = formLabel(composition.parts, (c) => byCode.get(c)?.nameEn ?? null);
    const { versionNo, copyFrom } = nextPack(packs);
    const basis = await tx.contractBasis.findFirst({ where: { organisationId: l.org.id, code: l.ex.contractBasisCode! }, select: { nameEn: true } });
    const pack = await tx.tenderPack.create({
      data: {
        organisationId: l.org.id,
        exerciseId,
        versionNo,
        status: "DRAFT",
        packKind: kind,
        contractBasisCode: l.ex.contractBasisCode!,
        compositionSnapshot: composition.parts as unknown as Prisma.InputJsonValue,
        formLabelSnapshot: form,
        copiedFromPackId: copyFrom?.id ?? null,
      },
    });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.pack, pack.id, packLabel(l, pack), "CREATE", packCreatedAudit({ versionNo, packKind: kind, basis: basis?.nameEn ?? null, form, parts: composition.parts.length, continues: copyFrom?.versionNo ?? null }));
    for (const p of composition.parts) {
      const was = copyFrom?.parts.find((x) => x.partCode === p.code) ?? null;
      const template = was?.templateId ? (templates.find((t) => t.id === was.templateId) ?? null) : p.templateCode ? (byCode.get(p.templateCode) ?? null) : null;
      const state = was ? was.state : "NOT_STARTED";
      const row = await tx.tenderPackPart.create({
        data: {
          organisationId: l.org.id,
          packId: pack.id,
          partCode: p.code,
          printedNumber: p.printedNumber,
          sortOrder: p.sortOrder,
          labelSnapshot: p.labelEn,
          labelMsSnapshot: p.labelMs,
          role: p.role,
          content: p.content,
          source: p.source,
          mandatory: p.mandatory,
          inTableDocument: p.inTableDocument,
          // 6.7 (6.6 ruling): as configured when the pack starts, with its provenance; never refreshed onto a frozen pack.
          returnedByBidder: p.returnedByBidder ?? null,
          returnedByBidderProvenance: p.returnedByBidderProvenance ?? null,
          ownerOrgUnitCode: p.ownerOrgUnitCode,
          templateCode: p.templateCode,
          templateId: p.source === "TEMPLATE" && p.content !== "BESPOKE" ? (template?.id ?? null) : null,
          state,
          omittedReason: was?.state === "OMITTED" ? was.omittedReason : "",
        },
      });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, row.id, label(l, `Tender documents v${versionNo} · part ${p.printedNumber}`), "CREATE", partAudit(null, partAuditFacts(row, row.templateId ? (template?.nameEn ?? null) : null)));
      // The returned version's files go with the part, each judged as an attachment now.
      if (was && p.source === "UPLOAD") {
        const facts = tenderPackPartFacts({ source: row.source, pack: { status: "DRAFT", exercise: { status: l.ex.status } } });
        for (const a of was.attachments) {
          const v = await tx.documentVersion.findUnique({ where: { id: a.versionId, organisationId: actor.organisationId }, select: { id: true, versionNo: true, sha256: true, withdrawnAt: true, document: { select: { title: true, classificationSnapshot: true, documentClass: { select: { classification: true } } } } } });
          if (!v || a.detachedAt) continue;
          if (attachFault({ purpose: "TENDER_PART", owner: facts, version: v, documentClass: v.document.documentClass, documentClassification: v.document.classificationSnapshot }).some((f) => f.level === "block")) continue;
          const att = await tx.documentAttachment.create({ data: { organisationId: l.org.id, purpose: "TENDER_PART", versionId: v.id, tenderPackPartId: row.id } });
          const owner = label(l, `Tender documents v${versionNo} · part ${p.printedNumber}, ${p.labelEn}`);
          await audit(tx, toAuditActor(actor), l.org.id, "DocumentAttachment", att.id, `${owner} · Tender document part`, "CREATE", attached({ purpose: "TENDER_PART", title: v.document.title, versionNo: v.versionNo, sha256: v.sha256, owner }));
        }
        if (state === "READY" && !(await tx.documentAttachment.count({ where: { tenderPackPartId: row.id, detachedAt: null } }))) {
          await tx.tenderPackPart.update({ where: { id: row.id, organisationId: actor.organisationId }, data: { state: "NOT_STARTED" } });
          await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, row.id, label(l, `Tender documents v${versionNo} · part ${p.printedNumber}`), "UPDATE", diffFields({ state: "Ready" }, { state: "Not ready", why: "Its file could not be carried from the returned version." }));
        }
      }
    }
    // The Appendix: carried from the returned version, or begun empty where the pack has one.
    if (composition.parts.some((p) => p.role === "APPENDIX")) {
      const from = copyFrom?.appendix ?? null;
      const { variationLimits, sections, id: _id, packId: _p, createdAt: _c, updatedAt: _u, organisationId: _o, status: _s, ...fields } = from ?? ({} as NonNullable<typeof from>);
      void _id; void _p; void _c; void _u; void _o; void _s;
      const appx = await tx.conditionsAppendix.create({ data: { organisationId: l.org.id, packId: pack.id, ...(from ? fields : {}), status: "DRAFT" } });
      for (const v of variationLimits ?? []) await tx.appendixVariationLimit.create({ data: { organisationId: l.org.id, appendixId: appx.id, roleCode: v.roleCode, committeeCode: v.committeeCode, label: v.label, limit: v.limit, sortOrder: v.sortOrder } });
      for (const s of sections ?? []) await tx.appendixSection.create({ data: { organisationId: l.org.id, appendixId: appx.id, description: s.description, ladKind: s.ladKind, ladAmount: s.ladAmount, ladPct: s.ladPct, sortOrder: s.sortOrder } });
      const names = await officeNames(tx, l.org.id);
      const stored = (await loadPacks(exerciseId, tx)).find((x) => x.id === pack.id)!.appendix!;
      const facts = appendixFactsOf(stored);
      if (appendixComplete(facts)) await tx.conditionsAppendix.update({ where: { id: appx.id, organisationId: actor.organisationId }, data: { status: "COMPLETE" } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.appendix, appx.id, label(l, `Tender documents v${versionNo} · Appendix`), "CREATE", appendixAudit(null, facts, names.name));
    }
    return { ok: true };
  });
}

// ------------------------------------------------------------------ parts

/// The draft pack's part, under the lock: the pack must be a draft on an exercise in preparation.
function lockedPart(l: LockedExercise, packs: readonly PackRow[], partId: string) {
  const pack = draftOf(packs);
  if (!pack) throw new Refusal(NO_PACK);
  const part = pack.parts.find((p) => p.id === partId);
  if (!part) throw new Refusal({ ok: false, message: "That part is not on the draft of the tender documents." });
  const edit = packEditFault(pack.status, l.ex.status);
  if (edit) throw new Refusal(refuse([edit]));
  return { pack, part };
}

/// Mark a part ready: its content as its source needs it (FR-DOC-003).
export async function markPartReady(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const partId = String(data.get("partId") ?? "");
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, part } = lockedPart(l, packs, partId);
    await lockBqRows(tx, exerciseId);
    const bqFinalised = (await tx.bqVersion.count({ where: { exerciseId, status: "FINALISED" } })) > 0;
    const appx = pack.appendix ? appendixComplete(appendixFactsOf(pack.appendix)) : null;
    const faults = markReadyFaults(partFactsOf(part), pack.status, l.ex.status, { bqFinalised, appendixComplete: appx, whitelist: await whitelistOn(tx, l.org.id, l.org.today) });
    if (faults.length) return refuse(faults);
    await tx.tenderPackPart.update({ where: { id: part.id, organisationId: actor.organisationId }, data: { state: "READY", omittedReason: "" } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, part.id, label(l, `Tender documents v${pack.versionNo} · part ${part.printedNumber}`), "UPDATE", partAudit(partAuditFacts(part, part.template?.nameEn ?? null), partAuditFacts({ ...part, state: "READY", omittedReason: "" }, part.template?.nameEn ?? null)));
    return { ok: true };
  });
}

/**
 * Take the draft's "mandatory" and "in the Tender Table Document" answers from the configuration
 * as it stands (code review C2, BD-64-39). A draft keeps the answers it was started with; where
 * the configuration did not say then, nothing else could unblock it. Only an answer the
 * configuration now gives is taken, each part audited; a frozen version is never refreshed.
 * The officer confirms the list the drawer showed; a different list now is refused (64-C2).
 */
export async function refreshPartFlags(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const confirmed = data.get("confirmedChanges");
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const pack = draftOf(packs);
    if (!pack) return NO_PACK;
    const edit = packEditFault(pack.status, l.ex.status);
    if (edit) return refuse([edit]);
    const changes = flagChanges(pack.parts.map(partFactsOf), await loadConfiguredParts(l.org.id, tx));
    // 64-C2: only the list the officer confirmed is written; recomputed here, under the lock.
    const changed = confirmedChangesFault(typeof confirmed === "string" ? confirmed : null, changes);
    if (changed) return { ok: false, message: changed };
    if (changes.length === 0) return { ok: false, message: `Nothing to refresh: ${CONFIG_STILL_UNSET}` };
    for (const c of changes) {
      const part = pack.parts.find((x) => x.partCode === c.partCode)!;
      const next = {
        mandatory: c.mandatory?.to ?? part.mandatory,
        inTableDocument: c.inTableDocument?.to ?? part.inTableDocument,
        // 6.7: the return answer with the provenance configuration gives it.
        returnedByBidder: c.returnedByBidder ? c.returnedByBidder.to : part.returnedByBidder,
        returnedByBidderProvenance: c.returnedByBidder ? c.returnedByBidder.provenance : part.returnedByBidderProvenance,
      };
      await tx.tenderPackPart.update({ where: { id: part.id, organisationId: actor.organisationId }, data: next });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, part.id, label(l, `Tender documents v${pack.versionNo} · part ${part.printedNumber}`), "UPDATE", partAudit(partAuditFacts(part, part.template?.nameEn ?? null), partAuditFacts({ ...part, ...next }, part.template?.nameEn ?? null)), "Refreshed from the configuration");
    }
    return { ok: true };
  });
}

/// Omit a part that is not mandatory, with the reason.
export async function omitPart(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const partId = String(data.get("partId") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, part } = lockedPart(l, packs, partId);
    const faults = omitFaults(partFactsOf(part), pack.status, l.ex.status, reason);
    if (faults.length) return faults.some((f) => f.code === "OMIT_REASON_REQUIRED") && faults.length === 1 ? { ok: false, errors: { reason: partFaultText(faults[0]) } } : refuse(faults);
    await tx.tenderPackPart.update({ where: { id: part.id, organisationId: actor.organisationId }, data: { state: "OMITTED", omittedReason: reason } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, part.id, label(l, `Tender documents v${pack.versionNo} · part ${part.printedNumber}`), "UPDATE", partAudit(partAuditFacts(part, part.template?.nameEn ?? null), partAuditFacts({ ...part, state: "OMITTED", omittedReason: reason }, part.template?.nameEn ?? null)), reason);
    return { ok: true };
  });
}

/// Take a part back to not ready (to rework it, or to include a part that was omitted).
export async function reopenPart(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const partId = String(data.get("partId") ?? "");
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, part } = lockedPart(l, packs, partId);
    if (part.state === "NOT_STARTED") return { ok: false, message: "This part is already not ready." };
    await tx.tenderPackPart.update({ where: { id: part.id, organisationId: actor.organisationId }, data: { state: "NOT_STARTED", omittedReason: "" } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, part.id, label(l, `Tender documents v${pack.versionNo} · part ${part.printedNumber}`), "UPDATE", partAudit(partAuditFacts(part, part.template?.nameEn ?? null), partAuditFacts({ ...part, state: "NOT_STARTED", omittedReason: "" }, part.template?.nameEn ?? null)));
    return { ok: true };
  });
}

/// Choose the library template a part draws (FR-DOC-003). A ready part goes back to not ready: its content changed.
export async function pickPartTemplate(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const partId = String(data.get("partId") ?? "");
  const templateId = String(data.get("templateId") ?? "");
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, part } = lockedPart(l, packs, partId);
    const t = await tx.documentTemplate.findFirst({ where: { id: templateId, organisationId: l.org.id } });
    if (!t) return { ok: false, errors: { templateId: "That template is not configured. Choose one from the list." } };
    const faults = pickTemplateFaults(partFactsOf(part), templateFactsOf(t), pack.status, l.ex.status, await whitelistOn(tx, l.org.id, l.org.today));
    if (faults.length) return refuse(faults);
    if (part.templateId === t.id) return { ok: true };
    await tx.tenderPackPart.update({ where: { id: part.id, organisationId: actor.organisationId }, data: { templateId: t.id, state: "NOT_STARTED" } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.part, part.id, label(l, `Tender documents v${pack.versionNo} · part ${part.printedNumber}`), "UPDATE", partAudit(partAuditFacts(part, part.template?.nameEn ?? null), partAuditFacts({ ...part, state: "NOT_STARTED" }, t.nameEn)));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the Appendix (FR-DOC-004)

const TRI = ["yes", "no", "unset"] as const;
const tri = (v: (typeof TRI)[number] | null) => (v === "yes" ? true : v === "no" ? false : null);

/// The draft's Appendix, under the lock.
function lockedAppendix(l: LockedExercise, packs: readonly PackRow[]) {
  const pack = draftOf(packs);
  if (!pack) throw new Refusal(NO_PACK);
  const edit = packEditFault(pack.status, l.ex.status);
  if (edit) throw new Refusal(refuse([edit]));
  if (!pack.appendix) throw new Refusal({ ok: false, message: "This pack's parts have no Appendix to the Conditions of Contract. Add an Appendix part for this pack kind under Configuration, Tender documents." });
  return { pack, appendix: pack.appendix };
}

/// After any change: the status follows the rule, and the trail records the change in words.
async function appendixChanged(tx: Tx, by: AuditActor, l: LockedExercise, pack: PackRow, before: AppendixFacts, reason = "") {
  const after = (await loadPacks(l.ex.id, tx)).find((p) => p.id === pack.id)!.appendix!;
  const facts = appendixFactsOf(after);
  const status = appendixComplete(facts) ? "COMPLETE" : "DRAFT";
  if (after.status !== status) await tx.conditionsAppendix.update({ where: { id: after.id, organisationId: l.org.id }, data: { status } });
  const names = await officeNames(tx, l.org.id);
  await audit(tx, by, l.org.id, ENTITY.appendix, after.id, label(l, `Tender documents v${pack.versionNo} · Appendix`), "UPDATE", appendixAudit(before, { ...facts, status }, names.name), reason);
  const blocks = appendixFaults(facts);
  return { ok: true as const, message: blocks.length ? `Saved. Still to enter: ${blocks.length === 1 ? appendixFaultText(blocks[0]) : `${blocks.length} items, listed on the page.`}` : "Saved. The Appendix is complete." };
}

/**
 * Save the Appendix's fields. Each is three-state: left empty it reads "Not set" and is
 * listed as still to enter; it is never a zero. A value of the other kind is cleared when
 * the kind changes (an amount LAD holds no percentage, Q-6).
 */
export async function saveAppendix(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const office = (name: string) => r.optionalText(name);
  // Each percentage to its own column's places and bound: never rounded or overflowed on save.
  const pctField = (name: PctField, labelText: string) => {
    const v = r.optionalText(name);
    if (v != null && !isPct(v, PCT_COLUMN[name])) r.reject(name, pctRefusal(labelText, PCT_COLUMN[name]));
    return v;
  };
  const v = {
    ladOfficerRoleCode: office("ladOfficerRoleCode"),
    eotOfficerRoleCode: office("eotOfficerRoleCode"),
    terminationOfficerRoleCode: office("terminationOfficerRoleCode"),
    warRiskOfficerRoleCode: office("warRiskOfficerRoleCode"),
    arbitrationOfficerRoleCode: office("arbitrationOfficerRoleCode"),
    pcSumWorksApply: tri(r.choice("pcSumWorksApply", "Prime cost sum work", TRI)),
    pcSumWorksText: r.text("pcSumWorksText", "Prime cost sum work", { max: 2000 }),
    tplMinimum: r.money("tplMinimum", "Minimum third-party liability insurance"),
    wcMinimum: r.money("wcMinimum", "Minimum workmen's compensation insurance"),
    worksInsuranceUpliftKind: r.choice("worksInsuranceUpliftKind", "Works insurance uplift", ["AMOUNT", "PERCENT"] as const),
    worksInsuranceUpliftAmount: r.money("worksInsuranceUpliftAmount", "Works insurance uplift"),
    worksInsuranceUpliftPct: pctField("worksInsuranceUpliftPct", "Works insurance uplift"),
    insuranceExcess: r.money("insuranceExcess", "Permitted insurance excess"),
    ladKind: r.choice("ladKind", "How liquidated damages are stated", ["AMOUNT_PER_DAY", "PERCENT_OF_SUM_PER_DAY"] as const),
    ladAmount: r.money("ladAmount", "Liquidated damages a day"),
    ladPct: pctField("ladPct", "Liquidated damages"),
    sectionalCompletion: tri(r.choice("sectionalCompletion", "Sectional completion", TRI)),
    dlpApplies: tri(r.choice("dlpApplies", "Defects liability period", TRI)),
    dlpMonths: r.int("dlpMonths", "Defects liability period", { min: 1 }),
    firstInterimMinimum: r.money("firstInterimMinimum", "Minimum for the first interim certificate"),
    subsequentInterimMinimum: r.money("subsequentInterimMinimum", "Minimum for later interim certificates"),
    honourCertificateDays: r.int("honourCertificateDays", "Days to honour a certificate", { min: 1 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, appendix } = lockedAppendix(l, packs);
    const names = await officeNames(tx, l.org.id);
    for (const k of ["ladOfficerRoleCode", "eotOfficerRoleCode", "terminationOfficerRoleCode", "warRiskOfficerRoleCode", "arbitrationOfficerRoleCode"] as const) {
      if (v[k] && !names.codes.includes(v[k]!)) return { ok: false, errors: { [k]: "That office is not configured. Choose one from the list." } };
    }
    const before = appendixFactsOf(appendix);
    const labelOf = (code: string | null) => (code ? names.name(code) : null);
    await tx.conditionsAppendix.update({
      where: { id: appendix.id, organisationId: actor.organisationId },
      data: {
        ...v,
        ladOfficerLabel: labelOf(v.ladOfficerRoleCode),
        eotOfficerLabel: labelOf(v.eotOfficerRoleCode),
        terminationOfficerLabel: labelOf(v.terminationOfficerRoleCode),
        warRiskOfficerLabel: labelOf(v.warRiskOfficerRoleCode),
        arbitrationOfficerLabel: labelOf(v.arbitrationOfficerRoleCode),
        pcSumWorksText: v.pcSumWorksApply ? v.pcSumWorksText : "",
        worksInsuranceUpliftAmount: v.worksInsuranceUpliftKind === "AMOUNT" ? v.worksInsuranceUpliftAmount : null,
        worksInsuranceUpliftPct: v.worksInsuranceUpliftKind === "PERCENT" ? v.worksInsuranceUpliftPct : null,
        ladAmount: v.ladKind === "AMOUNT_PER_DAY" ? v.ladAmount : null,
        ladPct: v.ladKind === "PERCENT_OF_SUM_PER_DAY" ? v.ladPct : null,
        dlpMonths: v.dlpApplies === false ? null : v.dlpMonths,
      },
    });
    return appendixChanged(tx, toAuditActor(actor), l, pack, before, String(data.get("reason") ?? ""));
  });
}

/// Add or change a variation limit: an office or a committee, and its limit (null: not set).
export async function saveVariationLimit(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const holder = r.text("holderCode", "Office or committee", { required: true });
  const limit = r.money("limit", "Limit");
  const sortOrder = r.int("sortOrder", "Order", { min: 0 }) ?? 0;
  if (r.failed) return { ok: false, errors: r.errors };
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, appendix } = lockedAppendix(l, packs);
    const role = await tx.authorityRole.findFirst({ where: { organisationId: l.org.id, code: holder }, select: { code: true, nameEn: true, isCommittee: true } });
    if (!role) return { ok: false, errors: { holderCode: "That office or committee is not configured. Choose one from the list." } };
    const before = appendixFactsOf(appendix);
    const row = { roleCode: role.isCommittee ? null : role.code, committeeCode: role.isCommittee ? role.code : null, label: role.nameEn, limit, sortOrder };
    if (id) {
      const existing = appendix.variationLimits.find((x) => x.id === id);
      if (!existing) return { ok: false, message: "That limit is no longer on the Appendix." };
      await tx.appendixVariationLimit.update({ where: { id, organisationId: actor.organisationId }, data: row });
    } else await tx.appendixVariationLimit.create({ data: { organisationId: l.org.id, appendixId: appendix.id, ...row } });
    return appendixChanged(tx, toAuditActor(actor), l, pack, before);
  });
}

export async function removeVariationLimit(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const id = String(data.get("id") ?? "");
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, appendix } = lockedAppendix(l, packs);
    if (!appendix.variationLimits.some((x) => x.id === id)) return { ok: false, message: "That limit is no longer on the Appendix." };
    const before = appendixFactsOf(appendix);
    await tx.appendixVariationLimit.delete({ where: { id, organisationId: actor.organisationId } });
    return appendixChanged(tx, toAuditActor(actor), l, pack, before);
  });
}

/// Add or change a section for sectional completion, with its LAD (amount or percentage, Q-6).
export async function saveAppendixSection(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const description = r.text("description", "Section", { required: true, max: 400 });
  const ladKind = r.choice("ladKind", "How its liquidated damages are stated", ["AMOUNT_PER_DAY", "PERCENT_OF_SUM_PER_DAY"] as const);
  const ladAmount = r.money("ladAmount", "Liquidated damages a day");
  const ladPct = r.optionalText("ladPct");
  if (ladPct != null && !isPct(ladPct, PCT_COLUMN.sectionLadPct)) r.reject("ladPct", pctRefusal("Liquidated damages", PCT_COLUMN.sectionLadPct));
  const sortOrder = r.int("sortOrder", "Order", { min: 0 }) ?? 0;
  if (r.failed) return { ok: false, errors: r.errors };
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, appendix } = lockedAppendix(l, packs);
    const before = appendixFactsOf(appendix);
    const row = { description, ladKind, ladAmount: ladKind === "AMOUNT_PER_DAY" ? ladAmount : null, ladPct: ladKind === "PERCENT_OF_SUM_PER_DAY" ? ladPct : null, sortOrder };
    if (id) {
      if (!appendix.sections.some((x) => x.id === id)) return { ok: false, message: "That section is no longer on the Appendix." };
      await tx.appendixSection.update({ where: { id, organisationId: actor.organisationId }, data: row });
    } else await tx.appendixSection.create({ data: { organisationId: l.org.id, appendixId: appendix.id, ...row } });
    return appendixChanged(tx, toAuditActor(actor), l, pack, before);
  });
}

export async function removeAppendixSection(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const id = String(data.get("id") ?? "");
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const { pack, appendix } = lockedAppendix(l, packs);
    if (!appendix.sections.some((x) => x.id === id)) return { ok: false, message: "That section is no longer on the Appendix." };
    const before = appendixFactsOf(appendix);
    await tx.appendixSection.delete({ where: { id, organisationId: actor.organisationId } });
    return appendixChanged(tx, toAuditActor(actor), l, pack, before);
  });
}

// ------------------------------------------------------------------ submitting (FR-DOC-012)

/**
 * Submit the draft for Approval for Tendering, with the proposed start and closing. Under
 * the exercise's lock, then its packs', then the bill's, the panel's and the estimate's
 * (6.2 OD-4: `packFaults` on locked rows): every `submitFaults` finding re-judged, then the
 * pack frozen (each part's text rendered and stored, the bill and files pinned, the
 * manifest and findings kept), the route opened under the domain's configured rule with
 * its core and rejection snapshots (Q-3: returned for amendment, STATED), and the exercise
 * moved to Pending approval for tendering by the submission (`moveExercise`).
 */
export async function submitPack(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const startOn = String(data.get("startOn") ?? "").trim() || null;
  const closingDay = String(data.get("closingDay") ?? "").trim() || null;
  const closingTime = String(data.get("closingTime") ?? "").trim() || null;
  // The person who sends it is the route's sender (decisions log, 2026-10-09, ruling on 1860): barred from deciding it, as the name's sender is. Always the signed-in officer's own act.
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    if (!l.org.today) return NO_ZONE;
    const pack = draftOf(packs);
    if (!pack) return NO_PACK;
    // 6.2's rows, locked after the packs, in 6.2's own order.
    await lockBqRows(tx, exerciseId);
    const panel = await tx.specificationPanel.findUnique({ where: { exerciseId }, select: { id: true } });
    if (panel) await lockPanelRow(tx, panel.id);
    await lockLiveEstimateRows(tx, exerciseId);
    const scope = await scopeReadiness(l.org.id, l.ex, tx);
    const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, l.ex, tx);
    const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode) ?? null;
    const value = parseSen(l.ex.estimatedValue.toString());
    const roster = await loadRoster(actor.organisationCode, tx);
    const delegations = await loadDelegations(actor.organisationCode, tx);
    const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(l.org.today)).reverse().map((u) => u.code);
    const holders = (code: string) => holdersFor(code, unitPath, roster, delegations, l.org.today!);
    const route = issue && ctx && method ? tenderingRouteForRequester(ctx.funder, method, Number(senToDecimalString(value)), requesterHolding(holders, l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable))) : null;
    const dates = approvalDatesFault({ startOn, closingDay, closingTime, timeZone: l.org.timeZone, today: l.org.today });
    // Increment 2: the conditions, read on the locked exercise and pack (requirements, answers, clauses, overrides, confirmations).
    const conditions = await loadConditions(l.org.id, l.ex, pack.id, l.org.today, tx);
    const whitelist = packWhitelist(liveClauses(conditions.clauses.clauses, l.org.today));
    const findings = submitFaults({
      packStatus: pack.status,
      exerciseStatus: l.ex.status,
      parts: pack.parts.map(partFactsOf),
      content: { bqFinalised: scope.bill != null, appendixComplete: pack.appendix ? appendixComplete(appendixFactsOf(pack.appendix)) : null, whitelist },
      scope: scope.input,
      appendix: pack.appendix ? appendixFactsOf(pack.appendix) : null,
      profile: profileOf(l.ex.classificationSnapshot),
      primeCostSums: scope.bill?.primeCostSums ?? null,
      dates: dates.faults,
      route: { issue: !!issue && !!ctx, state: method ? (route?.tenderingState ?? null) : "NO_METHOD_KEY", refusal: route?.refusal ?? null, errors: (route?.warnings ?? []).filter((w) => w.level === "err").map((w) => w.messageEn) },
      routeOpen: tenderingRoutesOf(l.ex.approvalInstances).some((i) => i.status === "PENDING"),
      conditions,
    });
    const blocks = blockingOf(findings);
    if (blocks.length) {
      const texts = submitFindingTexts(findings).filter((t) => t.level === "block");
      const dateErrors = Object.fromEntries(findings.dates.map((f) => [f.code === "CLOSING_TIME_NOT_VALID" ? "closingTime" : f.code === "START_IN_PAST" ? "startOn" : "closingDay", datesFaultText(f)]));
      return { ok: false, message: `Not submitted: ${texts.map((t) => t.text).join(" ")}`, ...(findings.dates.length ? { errors: dateErrors } : {}) };
    }
    // ---- freeze (ADR 0013)
    const now = new Date();
    const names = await officeNames(tx, l.org.id);
    const [org, basis, type] = [
      await tx.organisation.findUniqueOrThrow({ where: { id: l.org.id }, select: { name: true } }),
      await tx.contractBasis.findFirst({ where: { organisationId: l.org.id, code: pack.contractBasisCode }, select: { nameEn: true } }),
      l.ex.contractTypeCode ? await tx.contractType.findFirst({ where: { organisationId: l.org.id, code: l.ex.contractTypeCode }, select: { nameEn: true } }) : null,
    ];
    const fields = packFieldValues({ organisationName: org.name, exerciseReference: l.ex.reference, exerciseTitle: l.ex.title, requisitionReference: l.req.reference, packKindLabel: PACK_KIND_LABEL[pack.packKind], versionNo: pack.versionNo, formLabel: pack.formLabelSnapshot, basisName: basis?.nameEn ?? null, typeName: type?.nameEn ?? null });
    const appendixFacts = pack.appendix ? appendixFactsOf(pack.appendix) : null;
    // The validity window the notice states: the proposed days (the approving step must record them, BD-64-31).
    const window = { startOn: startOn!, closingDay: closingDay! };
    const frozen = freezePack({
      parts: pack.parts.map((p) => ({ ...partFactsOf(p), files: pinnedFilesOf(p) })),
      fields,
      fieldsByLanguage: conditionFieldValues(conditions, window),
      whitelist,
      stamp: conditionStamp(conditions),
      clauses: liveClauses(conditions.clauses.clauses, l.org.today),
      bill: scope.bill ? { versionId: scope.bill.versionId, frozen: scope.bill.frozen } : null,
      appendix: pack.appendix && appendixFacts ? { id: pack.appendix.id, facts: appendixFacts, text: appendixText(appendixFacts, names.name) } : null,
    });
    for (const d of frozen.documents) {
      const row = await tx.tenderPackDocument.create({
        data: {
          organisationId: l.org.id,
          packId: pack.id,
          partCode: d.partCode,
          source: d.source,
          templateId: d.templateId,
          templateCode: d.templateCode,
          templateName: d.templateName,
          templateFormCode: d.templateFormCode,
          templateRevisionDate: d.templateRevisionDate ? dayToDate(d.templateRevisionDate) : null,
          templateBodyVersion: d.templateBodyVersion,
          language: d.language,
          fields: JSON.parse(JSON.stringify(d.fields, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as Prisma.InputJsonValue,
          renderedText: d.renderedText,
          frozenAt: now,
        },
      });
      const part = pack.parts.find((p) => p.partCode === d.partCode)!;
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.document, row.id, label(l, `Tender documents v${pack.versionNo} · part ${part.printedNumber}`), "CREATE", diffFields(null, { part: `${part.printedNumber}. ${part.labelSnapshot}`, frozenFrom: d.templateName ? `${d.templateName}, text version ${d.templateBodyVersion}` : d.source === "BQ_UNPRICED" ? "The bill of quantities, unpriced" : "The Appendix as entered", language: d.language === "MS" ? "Malay" : "English" }));
    }
    if (pack.appendix && appendixFacts) {
      await tx.conditionsAppendix.update({ where: { id: pack.appendix.id, organisationId: actor.organisationId }, data: { status: "COMPLETE" } });
    }
    // ---- the route (FR-DOC-012): the domain's configured rule, nothing named here.
    const res = route!;
    const src = res.source === "OVERRIDE" && ctx!.funder.override ? ctx!.funder.override : { id: issue!.id, label: issue!.label, matrix: issue!.matrix };
    const rule = src.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? issue!.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    const on = dayToDate(l.org.today);
    const instance = await tx.approvalInstance.create({
      data: {
        organisationId: l.org.id,
        matterKind: "EXERCISE",
        exerciseId,
        domain: TENDERING_DOMAIN,
        value: l.ex.estimatedValue,
        authorityMatrixId: issue!.id,
        matrixLabel: issue!.label,
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
        submittedByPersonId: act.subjectPersonId,
        // Q-3: a rejection returns the documents for amendment, as §7.3.2 states it.
        ...tenderingRejectionSnapshot(now),
        ...routeCoreFields(res.core, now),
        steps: {
          create: res.chain.map((s, i) => ({
            sequence: i + 1,
            roleCode: s.roleCode,
            roleLabel: roleLabel(s.roleCode),
            act: s.act,
            committeeCode: s.committeeCode ?? null,
            nonDelegable: s.nonDelegable,
            sourceRuleKey: s.sourceRuleKey,
            chainOrigin: stepOrigin(s),
          })),
        },
      },
    });
    const routeLabel = label(l, exerciseRouteMatter(TENDERING_DOMAIN).auditNoun);
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", instance.id, routeLabel, "CREATE",
      diffFields(null, { matrix: issue!.label, rule: rule.labelEn, route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: res.source === "OVERRIDE", ifRejected: "Returned for amendment" }));
    await act.write(tx, instance.id);
    // ---- the pack, frozen
    const warns = allOf(findings).filter((f) => f.level !== "block");
    await tx.tenderPack.update({
      where: { id: pack.id, organisationId: actor.organisationId },
      data: {
        status: "SUBMITTED",
        submittedAt: now,
        frozenAt: now,
        manifest: frozen.manifest as unknown as Prisma.InputJsonValue,
        faultsSnapshot: submitFindingTexts(findings).map((t) => ({ level: t.level, text: t.text, family: t.family })) as unknown as Prisma.InputJsonValue,
        conditionsSnapshot: conditionsSnapshot(pack.parts.map(partFactsOf), conditions, window) as unknown as Prisma.InputJsonValue,
        bqVersionId: scope.bill?.versionId ?? null,
        proposedStartOn: dayToDate(startOn!),
        proposedClosingAt: dates.closingAt,
        approvalInstanceId: instance.id,
      },
    });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.pack, pack.id, packLabel(l, pack), "UPDATE", packStatusAudit("DRAFT", "SUBMITTED", { proposedStart: startOn, proposedClosing: `${closingDay}, ${closingTime}`, partsFrozen: frozen.documents.length, filesPinned: frozen.manifest.reduce((n, m) => n + m.files.length, 0), warnings: warns.length || null }));
    await moveExercise(tx, l.ex, "PENDING_APPROVAL_FOR_TENDERING", { today: l.org.today, via: "SUBMISSION", packFaults: blocks.length });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "PENDING_APPROVAL_FOR_TENDERING" }));
    return { ok: true, message: warns.length ? `Submitted. ${submitFindingTexts(findings).filter((t) => t.level !== "block").map((t) => t.text).join(" ")}` : undefined };
  });
}

// ------------------------------------------------------------------ deciding the route

/**
 * Record a decision on a step of the Approval for Tendering route: the holder's own, signed with the
 * password, or recorded for the holder from paper and not signed (Phase 2b). The holder, delegation,
 * self-approval and date checks are 6.1's (`deciderFaults`), on whom it is attributed to, and the
 * separation of duties on the person recording it as well. The step that completes the route records DATE START and CLOSING
 * DATE (FR-DOC-012, X-2): the exercise's tenderingStartOn and closingAt are written here and
 * frozen on the approved pack in the same act — this is the closing's one writer in 6.4.
 * A rejection returns the documents for amendment (Q-3): the route closes, the pack is
 * returned with the reason, and the exercise goes back into preparation.
 */
export async function recordTenderingDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const stepId = String(data.get("stepId") ?? "");
  const r = new FormReader(data);
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  r.date("decidedOn", "Decided on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why the documents are returned.");
  // Read as dates (a real day each, never rolled into the next month), then judged as days.
  const startDate = r.date("startOn", "Tendering starts on");
  const closingDate = r.date("closingDay", "Closing day");
  const startOn = startDate ? storedDay(startDate) : null;
  const closingDay = closingDate ? storedDay(closingDate) : null;
  const closingTime = r.optionalText("closingTime");
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const on = dayToDate(act.day!);

  return inPacks(actor, exerciseId, async (tx, l, packs) => {
    const ex = l.ex;
    const inst = tenderingRoutesOf(ex.approvalInstances).find((i) => i.status === "PENDING");
    const pack = packs.find((p) => p.status === "SUBMITTED") ?? null;
    if (!inst || !pack || pack.approvalInstanceId !== inst.id || ex.status !== "PENDING_APPROVAL_FOR_TENDERING") return { ok: false, message: "No approval for tendering is open on this exercise." };
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: "That step is not on the open route." };
    const roster = await loadRoster(actor.organisationCode, tx);
    const delegations = await loadDelegations(actor.organisationCode, tx);
    const units = (await tx.orgUnit.findMany({ where: { organisationId: l.org.id } })) as unknown as OrgUnit[];
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, on).reverse().map((u) => u.code);
    const decidedOn = storedDay(on);
    const check = deciderFaults(step, {
      today: l.org.today,
      // Judged on the office acting for the step, where it was escalated (FR-APR-009/010).
      holders: actingOffice(step) ? holdersFor(actingOffice(step)!, unitPath, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
      person,
      // Nobody decides a step of a matter on a requisition they raised.
      requesterId: routeRequesterId("NAME_APPROVAL", { requisitionRaiserId: l.req.requestingPersonId }) ?? "",
      // The sender of the route is barred as well (ruling of 2026-10-08 on log line 1789). Where the route records none, nobody is barred on that account.
      senderId: routeSenderBarredId("NAME_APPROVAL", { routeSenderId: inst.submittedByPersonId }),
      recorderId: act.recorderId,
      endorserIds: [],
      // Who keyed the requisition, an endorsement or another step for someone else: the same checks run on them (Phase 2b review).
      earlier: await earlierRecordersOf(tx, l.org.id, { requisitionId: l.req.id, otherStepIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.id) }),
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
    const completes = decision === "DONE" && inst.steps.every((s) => s.id === step.id || s.decision === "DONE");
    // The approving step records the dates (FR-DOC-012): judged on the day it decided, in the organisation's zone.
    const dates = completes ? approvalDatesFault({ startOn, closingDay, closingTime, timeZone: l.org.timeZone, today: decidedOn }) : null;
    // Increment 2: where the frozen notice states the validity window, the days it states (BD-64-31).
    const windowFault = completes && dates && !dates.faults.length ? frozenWindowFault(readConditionsSnapshot(pack.conditionsSnapshot)?.windowStated ?? null, { startOn, closingDay }) : null;
    if (windowFault) dates!.faults.push(windowFault);
    if (dates && dates.faults.length) {
      return { ok: false, errors: Object.fromEntries(dates.faults.map((f) => [f.code === "CLOSING_TIME_NOT_VALID" ? "closingTime" : f.code === "START_IN_PAST" || f.code === "DATES_DIFFER_FROM_DOCUMENTS" ? "startOn" : f.code === "TIME_ZONE_NOT_SET" ? "decidedOn" : "closingDay", datesFaultText(f)])) };
    }
    const after = personDecisionWrite({ decision, person: { id: person!.id, name: person!.name }, decidedOn: on, delegationId: check.delegationId, reason, recordedAt: new Date() });
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalStep", step.id, `${ex.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null, underDelegation: check.delegationId ? "yes" : null }), reason);
    await act.write(tx, step.id, { document: { entity: "TenderPack", id: pack.id }, roleCode: step.actingRoleCode ?? step.roleCode });
    const routeLabel = label(l, exerciseRouteMatter(TENDERING_DOMAIN).auditNoun);
    const now = new Date();

    if (decision === "REJECTED") {
      // Q-3: always returned for amendment; cancelling the exercise is its own act.
      await closeRejected(tx, toAuditActor(actor), { organisationId: l.org.id, routeLabel }, inst, returnOutcome(), reason, RETURN_DECIDED_BY);
      await tx.tenderPack.update({ where: { id: pack.id, organisationId: actor.organisationId }, data: { status: "RETURNED", returnedReason: reason, returnedAt: now } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.pack, pack.id, packLabel(l, pack), "UPDATE", packStatusAudit("SUBMITTED", "RETURNED", { returnedBecause: reason }), reason);
      await moveExercise(tx, ex, "DOCUMENTS_IN_PREPARATION", { today: l.org.today, via: "RETURN" });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${ex.reference} · ${ex.title}`, "UPDATE", diffFields({ status: ex.status }, { status: "DOCUMENTS_IN_PREPARATION" }), `Tender documents returned for amendment: ${reason}`);
      return { ok: true, message: "Returned for amendment. Start the next version of the tender documents on the Tender documents tab." };
    }
    if (!completes) return { ok: true };

    // ---- approved: the route, the pack and the exercise, with the dates (X-2)
    const startDay = dayToDate(startOn!);
    const closingAt = dates!.closingAt!;
    const approvedAt = on;
    await tx.approvalInstance.update({ where: { id: inst.id, organisationId: actor.organisationId }, data: { status: "APPROVED", closedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", inst.id, routeLabel, "UPDATE", diffFields({ status: inst.status }, { status: "APPROVED" }), reason);
    await tx.tenderPack.update({ where: { id: pack.id, organisationId: actor.organisationId }, data: { status: "APPROVED", approvedStartOn: startDay, approvedClosingAt: closingAt, approvedAt } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.pack, pack.id, packLabel(l, pack), "UPDATE", packStatusAudit("SUBMITTED", "APPROVED", { approvedStart: startOn, approvedClosing: `${closingDay}, ${closingTime}` }));
    await moveExercise(tx, ex, "APPROVED_FOR_TENDERING", { today: l.org.today, via: "APPROVAL", datesSet: true }, { tenderingStartOn: startDay, closingAt, approvedForTenderingAt: approvedAt });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${ex.reference} · ${ex.title}`, "UPDATE",
      diffFields({ status: ex.status, tenderingStarts: null, closing: null }, { status: "APPROVED_FOR_TENDERING", tenderingStarts: startOn, closing: `${closingDay}, ${closingTime}` }));
    // 6.2's estimate lead, read against the closing just recorded: a warning, never a refusal.
    const scopePolicy = await loadScopePolicy(l.org.id, tx);
    const scope = await scopeReadiness(l.org.id, ex, tx);
    const lead = estimateLeadWarning(scope.lastEstimateVersionOn, closingAt, scopePolicy, l.org.timeZone);
    return { ok: true, message: lead.warn ? `Approved for tendering. The company estimate's lead: ${lead.state === "LATE" ? "its last version was made after the last day before closing." : lead.state === "NOT_PREPARED" ? "no estimate is prepared yet." : "not judged (see the Company estimate tab)."}` : "Approved for tendering." };
  });
}
