"use server";

import { bidGate } from "@/lib/bids/repo";
import { bidFindingText } from "@/lib/bids/labels";
import { APPOINTMENT_DOMAIN } from "@/lib/method/types";
import { toSecond } from "@/lib/bids/lateness";
import { exerciseActFailure } from "@/lib/committee/exercise-failure";
import { bundleFaults, tabledVersionFault } from "@/lib/evaluation/bundle";
import { loadEvaluationGate } from "@/lib/evaluation/gate-read";
import { evaluationFindingText } from "@/lib/evaluation/labels";
import { lockEvaluationRows } from "@/lib/evaluation/lock";
import { isLoopKey, loopFault, LOOP_KEY_LABEL } from "@/lib/evaluation/loop";
import { ceilingOf } from "@/lib/evaluation/repo";
import { openNewVersion } from "@/lib/evaluation/versions";
import { requisitionOfExercise, withLockedRequisitionForSourcing } from "@/lib/method/repo";
import { lockOpeningRows } from "@/lib/opening/lock";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadRoster } from "@/lib/people/load";
import { lockWindowRow } from "@/lib/window/lock";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { formatOrgDateTime } from "@/lib/format";
import { writeAudit, type Tx } from "@/lib/audit/record";
import {
  checkAttendanceChange,
  checkRecusalChange,
  minutingChecks,
  snapshotRegister,
} from "@/lib/committee/assess-sitting";
import {
  attendanceFaultText,
  RECORD_TABLED_DOMAIN_TEXT,
  SITTING_TABLED_MATTER_KINDS,
  sittingTablesDomain,
  recordTabledText,
  OUTCOME_FAULT_MESSAGE,
  TABLING_FAULT_MESSAGE,
  TRANSITION_FAULT_MESSAGE,
  SCHEDULE_WORDS,
  WAITING_KIND_WORDS,
  WITHDRAW_FAULT_MESSAGE,
} from "@/lib/committee/labels";
import { checkOutcome, checkRecusal, liveOutcomes, withdrawFault, type MeetingStatus } from "@/lib/committee/matter";
import { meetingTransition, sittingPermits, type SittingAct } from "@/lib/committee/meeting";
import { registerRole } from "@/lib/committee/sitting";
import { lockSittingIn, organisationId, withLockedSitting, type LoadedSitting } from "@/lib/committee/sittings";
import type { LinkRoute } from "@/lib/committee/auto-link";
import { linkOutcome } from "@/lib/committee/auto-link-write";
import { matterKey } from "@/lib/committee/waiting-load";
import { Refusal as AwardRefusal, citeAppointmentStep } from "@/lib/award/route-write";
import { lockAwardIn } from "@/lib/award/repo";
import { CertificateRefusal } from "@/lib/certificate/write";
import { actCtx, ActRefusal, lockMatter, NO_ZONE_STATE, tableRefusal, thrownState } from "@/lib/matter/act";
import { loadMatters } from "@/lib/matter/load";
import { MATTER_FAMILY, type ContractMatterKind } from "@/lib/matter/matter";
import { citeMatterDecision, MatterRefusal } from "@/lib/matter/route-write";
import { citeNameStep, Refusal as NameRouteRefusal } from "@/lib/method/name-route-write";
import { nameRoutesOf } from "@/lib/method/approval";
import { NAME_APPROVAL_DOMAIN } from "@/lib/method/types";
import { CHANGED as REQUISITION_CHANGED, citeCommitteeStep } from "@/lib/requisition/approval-write";
import { transitionFaultText } from "@/lib/requisition/labels";
import { MoveRefused } from "@/lib/requisition/move";
import { loadRequisition, withLockedRequisition } from "@/lib/requisition/repo";
import { REQUISITION_DOMAIN } from "@/lib/requisition/types";
import { citeVariationDecision, VariationRefusal } from "@/lib/variation/route-write";
import { loadVariations } from "@/lib/variation/load";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { loadWaiting } from "@/lib/committee/waiting-load";
import { dayToDate, organisationDay, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { afterIssuing, formatReference, patternFaults, serialFor } from "@/lib/numbering/series";
import { MATTER_REF_TEXT, resolveMatterRef } from "@/lib/requisition/matter-link";
import { FormReader } from "@/lib/validate";

/**
 * Writes for committee sittings.
 *
 * Every action is reachable by a direct POST. Each write to a sitting runs inside
 * `withLockedSitting`: the sitting's row is locked, everything under it is re-read in
 * the same transaction, the pure check runs on that data, and only then is the write
 * made, with its audit row, in that transaction. Two writes to one sitting therefore
 * never both pass a check on data the other is about to change. A refusal saves
 * nothing. Nobody is signed in, so whoever records a tabling or a vote attests it.
 */

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before recording sittings.",
};
const GONE: FormState = { ok: false, message: "That sitting no longer exists." };
const CLOSED: FormState = {
  ok: false,
  message: "This sitting is minuted or cancelled. Nothing under it can change.",
};
const NOT_IN_PROGRESS: FormState = {
  ok: false,
  message: "The register, votes and outcomes are recorded while the sitting is in progress.",
};

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;

function refresh(meetingId?: string, also: readonly string[] = []) {
  revalidatePath("/committees");
  if (meetingId) revalidatePath(`/committees/${meetingId}`);
  // Founder, 2026-10-05: an outcome linked to a record's approval moves that record and the worklist too.
  if (also.length) revalidatePath("/approvals");
  for (const p of also) revalidatePath(p);
}

/// Refuse an act the sitting's status does not permit (ruling 8.2).
function permit(s: LoadedSitting, act: SittingAct): FormState | null {
  if (sittingPermits(s.meeting.status, act)) return null;
  return s.meeting.status === "MINUTED" || s.meeting.status === "CANCELLED" ? CLOSED : NOT_IN_PROGRESS;
}

async function audit(
  tx: Tx,
  s: LoadedSitting,
  entity: string,
  entityId: string,
  entityLabel: string,
  action: "CREATE" | "UPDATE",
  changes: FieldChange[],
  reason = "",
) {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: s.organisationId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Run a sitting write under the lock; a missing sitting reads as gone.
async function inSitting(meetingId: string, fn: (tx: Tx, s: LoadedSitting) => Promise<FormState>): Promise<FormState> {
  const result = await withLockedSitting(meetingId, fn);
  if (result?.ok) refresh(meetingId);
  return result ?? GONE;
}

async function meetingOf(decisionId: string): Promise<string | null> {
  const found = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { meetingId: true } });
  return found?.meetingId ?? null;
}

/// An appointment matter's exercise, read without a lock, to know what to lock (6.8 fix M-2).
async function appointmentExerciseOf(decisionId: string): Promise<string | null> {
  const found = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { domain: true, exerciseId: true } });
  return found?.domain === APPOINTMENT_DOMAIN ? found.exerciseId : null;
}

/**
 * Run a sitting write that may go on to write an exercise's evaluation (6.8 fix M-2): the exercise's
 * locks first, in the order every exercise act takes them — requisition → exercise → window →
 * openings — then the sitting, then (in the act) the evaluations. Tabling a first-stage matter takes
 * the same order (exercise … openings → sitting → evaluations), and no sitting act locks an exercise
 * after its sitting, so no two acts take these locks in opposite orders.
 *
 * Founder, 2026-10-05: an appointment matter whose exercise has an award on an open appointment route
 * also locks that award, after the openings (the canonical order puts the award after the window) and
 * before the sitting; once the outcome is written, it is offered to the route's committee step by the
 * award's own citation (`citeAppointmentStep`), after the loop-back, as a citation by hand would follow it.
 */
async function inSittingAfterExercise(meetingId: string, exerciseId: string, fn: (tx: Tx, s: LoadedSitting) => Promise<FormState>, appointment: { awardId: string; decisionId: string } | null = null): Promise<FormState> {
  const requisitionId = await requisitionOfExercise(exerciseId);
  if (!requisitionId) return inSitting(meetingId, fn);
  const roster = await loadRoster(ORGANISATION_CODE);
  let result: FormState | null;
  try {
    result = await withLockedRequisitionForSourcing(requisitionId, exerciseId, async (tx, l) => {
      if (!l.ex) return null;
      await lockWindowRow(tx, exerciseId);
      await lockOpeningRows(tx, exerciseId);
      const award = appointment ? await lockAwardIn(tx, appointment.awardId, exerciseId) : null;
      const s = await lockSittingIn(tx, meetingId, roster);
      if (!s) return null;
      const done = await fn(tx, s);
      if (!done.ok || !award || !appointment) return done;
      await linkOutcome(tx, {
        organisationId: s.organisationId,
        decisionId: appointment.decisionId,
        routes: award.award.approvalInstances.map(linkRoute(`EXERCISE:${exerciseId}`)),
        cite: (stepId) => citeAppointmentStep(tx, award, stepId, appointment.decisionId, "OUTCOME"),
        refusal: (e) => (e instanceof AwardRefusal ? e.state : null),
      });
      return done;
    });
  } catch (e) {
    // 6.8 re-review 6: the exercise could not move, or the transaction ran out of time: said, never a 500.
    const said = exerciseActFailure(e);
    if (said) return said;
    throw e;
  }
  if (result?.ok) refresh(meetingId, appointment ? [`/awards/${appointment.awardId}`, `/sourcing/${exerciseId}`] : []);
  return result ?? GONE;
}

/// The award on an open appointment route of the exercise, read without a lock, to know what to lock (founder, 2026-10-05).
async function openAppointmentOf(exerciseId: string): Promise<string | null> {
  const found = await db.approvalInstance.findFirst({ where: { exerciseId, domain: APPOINTMENT_DOMAIN, status: "PENDING", awardId: { not: null } }, orderBy: { openedAt: "desc" }, select: { awardId: true } });
  return found?.awardId ?? null;
}

/// A variation's matter's variation and its contract, read without a lock, to know what to lock (residual round, S-3d).
async function variationMatterOf(decisionId: string): Promise<{ id: string; contractId: string } | null> {
  const found = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { variation: { select: { id: true, contractId: true } } } });
  return found?.variation ?? null;
}

/**
 * Code re-review S-3d (residual round): a committee's outcome on a variation's matter is a variation act. The contract's
 * chain is locked first (withLockedContract) and VARIATION's row asked under it (ADR 0031), then the variation, then
 * the sitting: the order tableVariationMatter takes, so no two acts take these locks in opposite orders. A cancelled
 * contract keeps its variations' words.
 *
 * Founder, 2026-10-05: once the outcome is written, it is offered to the variation's open route's committee step by
 * the variation's own citation (`citeVariationDecision`), under the same locks and the same row of the table.
 */
async function inSittingAfterContract(meetingId: string, variation: { id: string; contractId: string }, fn: (tx: Tx, s: LoadedSitting) => Promise<FormState>, link: { decisionId: string; now: Date } | null = null): Promise<FormState> {
  const roster = await loadRoster(ORGANISATION_CODE);
  const result = await withLockedContract(variation.contractId, async (tx, l): Promise<FormState | null> => {
    const refused = actStatusFault("VARIATION", l.contract.status as ContractStatus);
    if (refused) return { ok: false, message: refused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its variations are kept as they were, and their matters are not decided." : actStatusText(refused) };
    await tx.$queryRaw`SELECT id FROM "Variation" WHERE id = ${variation.id} FOR UPDATE`;
    const s = await lockSittingIn(tx, meetingId, roster);
    if (!s) return null;
    const done = await fn(tx, s);
    if (!done.ok || !link || !s.today) return done;
    const v = (await loadVariations(l.contract.id, tx)).find((x) => x.id === variation.id);
    if (!v) return done;
    const c = { tx, l, now: link.now, today: s.today };
    await linkOutcome(tx, {
      organisationId: s.organisationId,
      decisionId: link.decisionId,
      routes: v.approvals.map((a) => linkRoute(`VARIATION:${v.id}`)(a.approvalInstance)),
      cite: (stepId) => citeVariationDecision(c, v, stepId, link.decisionId, "OUTCOME"),
      refusal: (e) => (e instanceof VariationRefusal || e instanceof CertificateRefusal ? { ok: false, message: e.message, ...(e.errors ? { errors: e.errors } : {}) } : null),
    });
    return done;
  });
  if (result?.ok) refresh(meetingId, link ? [`/projects/${variation.contractId}`, `/projects/${variation.contractId}/variations/${variation.id}`] : []);
  return result ?? GONE;
}

/// A route as `linkOutcome` reads it, under the record's key (waiting.ts `recordKey`).
const linkRoute = (recordKey: string) => (r: { id: string; domain: string; status: string; steps: readonly { id: string; sequence: number; committeeCode: string | null; decision: string; committeeDecisionId: string | null }[] }): LinkRoute => ({
  routeId: r.id,
  recordKey,
  domain: r.domain,
  status: r.status,
  steps: r.steps,
});

/**
 * The record a matter's outcome may discharge a committee step of, other than an appointment or a variation (founder,
 * 2026-10-05), read without a lock, to know what to lock; read again under the locks. A requisition's own approval (its
 * route matter, never a gate's), an exercise's name approval, or a contract matter. Anything else: none, and the
 * sitting's lock alone, as before.
 */
async function outcomeRecordOf(decisionId: string) {
  const d = await db.committeeDecision.findUnique({ where: { id: decisionId }, select: { domain: true, requisitionId: true, exerciseId: true, exercise: { select: { requisitionId: true } }, contractMatter: { select: { id: true, contractId: true, kind: true } } } });
  if (!d) return null;
  if (d.contractMatter) return { kind: "CONTRACT" as const, id: d.contractMatter.id, contractId: d.contractMatter.contractId, matterKind: d.contractMatter.kind };
  if (d.exerciseId && d.exercise && d.domain === NAME_APPROVAL_DOMAIN) return { kind: "NAME" as const, exerciseId: d.exerciseId, requisitionId: d.exercise.requisitionId };
  if (d.requisitionId && d.domain === REQUISITION_DOMAIN) return { kind: "REQUISITION" as const, requisitionId: d.requisitionId };
  return null;
}
type OutcomeRecord = NonNullable<Awaited<ReturnType<typeof outcomeRecordOf>>>;

/// The key the matter must still carry under the locks, for a record locked by `inSittingAfterRecord`.
const outcomeRecordKey = (r: OutcomeRecord) => (r.kind === "CONTRACT" ? `CONTRACT:${r.id}` : r.kind === "NAME" ? `EXERCISE:${r.exerciseId}` : `REQUISITION:${r.requisitionId}`);

/**
 * Founder, 2026-10-05: a committee's outcome on a matter tabled for a requisition's approval, an exercise's name, or a
 * contract matter. The record's chain is locked first, then the sitting, as tabling from a record takes them; once the
 * outcome is written the record is read again on the locked transaction and the outcome offered to its open route's
 * committee step by the record's own citation (`linkOutcome`):
 *
 * - a requisition: the requisition (`withLockedRequisition`), then the sitting; `citeCommitteeStep`.
 * - a name: the requisition, then the exercise (`withLockedRequisitionForSourcing`), then the sitting; `citeNameStep`.
 * - a contract matter: the contract's chain (`withLockedContract`), the matter's family row of the act × status table
 *   asked (ADR 0031; CANCELLED refuses in its words), the matter and its record (`lockMatter`), then the sitting;
 *   `citeMatterDecision`. The order the run 1b design gives the outcome on a contract matter.
 */
async function inSittingAfterRecord(meetingId: string, record: OutcomeRecord, decisionId: string, now: Date, fn: (tx: Tx, s: LoadedSitting) => Promise<FormState>): Promise<FormState> {
  const roster = await loadRoster(ORGANISATION_CODE);
  let result: FormState | null;
  let paths: string[] = [];
  try {
    if (record.kind === "CONTRACT") {
      result = await inContractMatterForOutcome(record, now, meetingId, roster, decisionId, fn);
      paths = [`/projects/${record.contractId}`];
    } else if (record.kind === "NAME") {
      result = await withLockedRequisitionForSourcing(record.requisitionId, record.exerciseId, async (tx, l) => {
        if (!l.ex) return null;
        const ex = l.ex;
        const s = await lockSittingIn(tx, meetingId, roster);
        if (!s) return null;
        const done = await fn(tx, s);
        if (!done.ok) return done;
        // The name's citation reads the exercise's matters again on this transaction; its routes are as read.
        await linkOutcome(tx, {
          organisationId: s.organisationId,
          decisionId,
          routes: nameRoutesOf(ex.approvalInstances).map(linkRoute(`EXERCISE:${ex.id}`)),
          cite: (stepId) => citeNameStep(tx, { org: l.org, ex }, stepId, decisionId, "OUTCOME"),
          refusal: (e) => (e instanceof NameRouteRefusal ? e.state : null),
        });
        return done;
      });
      paths = [`/sourcing/${record.exerciseId}`, `/requisitions/${record.requisitionId}`];
    } else {
      result = await withLockedRequisition(record.requisitionId, async (tx, l) => {
        const s = await lockSittingIn(tx, meetingId, roster);
        if (!s) return null;
        const done = await fn(tx, s);
        if (!done.ok) return done;
        // Read again: the matter's outcome was written after the requisition was read.
        const fresh = (await loadRequisition(l.req.id, tx)) ?? l;
        await linkOutcome(tx, {
          organisationId: s.organisationId,
          decisionId,
          routes: fresh.req.approvalInstances.map(linkRoute(`REQUISITION:${fresh.req.id}`)),
          cite: async (stepId) => {
            const out = await citeCommitteeStep(tx, fresh, stepId, decisionId, "OUTCOME");
            return { ok: out.ok, message: out.message, errors: out.errors };
          },
          refusal: (e) => (e instanceof MoveRefused ? { ok: false, message: e.fault.code === "CHANGED" ? REQUISITION_CHANGED.message : transitionFaultText(e.fault) } : null),
        });
        return done;
      });
      paths = [`/requisitions/${record.requisitionId}`];
    }
  } catch (e) {
    const said = exerciseActFailure(e);
    if (said) return said;
    throw e;
  }
  if (result?.ok) refresh(meetingId, paths);
  return result ?? GONE;
}

/// The contract matter's path for an outcome (see inSittingAfterRecord): its own function, so the scan reads the table asked.
async function inContractMatterForOutcome(record: Extract<OutcomeRecord, { kind: "CONTRACT" }>, now: Date, meetingId: string, roster: Awaited<ReturnType<typeof loadRoster>>, decisionId: string, fn: (tx: Tx, s: LoadedSitting) => Promise<FormState>): Promise<FormState | null> {
  const family = MATTER_FAMILY[record.matterKind as ContractMatterKind];
  try {
    return await withLockedContract(record.contractId, async (tx, l): Promise<FormState | null> => {
      const refused = actStatusFault(family, l.contract.status as ContractStatus);
      if (refused) return tableRefusal(refused);
      const c = actCtx(tx, l, now);
      if (!c) return NO_ZONE_STATE;
      await lockMatter(c, record.id);
      const s = await lockSittingIn(tx, meetingId, roster);
      if (!s) return null;
      const done = await fn(tx, s);
      if (!done.ok) return done;
      // Read again: the matter's committee decision was written after the matter was read.
      const m = (await loadMatters(l.contract.id, tx)).find((x) => x.id === record.id);
      if (!m) return done;
      await linkOutcome(tx, {
        organisationId: s.organisationId,
        decisionId,
        routes: m.routes.map(linkRoute(`CONTRACT:${m.id}`)),
        cite: (stepId) => citeMatterDecision(c, m, stepId, decisionId, "OUTCOME"),
        refusal: (e) => (e instanceof MatterRefusal || e instanceof ActRefusal || e instanceof CertificateRefusal ? thrownState(e) : null),
      });
      return done;
    });
  } catch (e) {
    return thrownState(e);
  }
}

// ------------------------------------------------------------------- schedule

/**
 * Schedule a sitting.
 *
 * The sitting number is drawn from the numbering series keyed `meeting` where one is
 * configured and valid, in the same transaction as the sitting; otherwise it is typed.
 * Issuance is not atomic across concurrent users (handoff.md).
 *
 * Founder, 2026-10-05: in the same transaction, each waiting item the drawer proposed and
 * the officer left ticked is tabled onto the new sitting through the "Table a matter"
 * writer (`tableInto`), from its route's own record, read again here: nothing is retyped.
 * An item no longer waiting, or one the writer refuses, refuses the whole act, sitting and
 * all, naming it. The sitting is locked as any tabling locks it; no record is locked, as
 * "Table a matter" locks none.
 */
export async function scheduleSitting(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const W = SCHEDULE_WORDS;
  const r = new FormReader(data);
  const committeeId = r.text("committeeId", "Committee", { required: true });
  const meetingDate = r.date("meetingDate", "Date", { required: true });
  const agenda = r.text("agenda", "Agenda", { max: 4000 });
  const typed = r.optionalText("reference");
  // The waiting items left ticked, by their step; read again from the routes under the lock.
  const chosen = [...new Set(data.getAll("items").map((v) => String(v).trim()).filter(Boolean))];
  const tabledByPersonId = r.optionalText("tabledByPersonId");

  const committee = committeeId
    ? await db.committee.findFirst({ where: { id: committeeId, organisationId: orgId } })
    : null;
  if (committeeId && !committee) r.reject("committeeId", "That committee no longer exists.");
  if (committee?.retiredOn && meetingDate && committee.retiredOn <= meetingDate) {
    r.reject("committeeId", "This committee is retired. A retired body schedules nothing.");
  }

  const series = await db.numberingSeries.findUnique({
    where: { organisationId_key: { organisationId: orgId, key: "meeting" } },
  });
  const usable = series && patternFaults(series).length === 0 ? series : null;
  if (!usable && !typed) {
    r.reject("reference", W.sittingNumberRequired.en);
  }
  // The series numbers by the organisation's day, never the UTC one (6.10 §9.5 follow-up).
  const zone = (await db.organisation.findUnique({ where: { id: orgId }, select: { timeZone: true } }))?.timeZone ?? null;
  const day = organisationDay(new Date(), zone);
  if (usable && !typed && !day) {
    r.reject("reference", W.sittingNumberNoZone.en);
  }
  if (typed && committee) {
    const clash = await db.meeting.findFirst({ where: { committeeId: committee.id, reference: typed } });
    if (clash) r.reject("reference", W.sittingNumberClash.en);
  }

  const parsed = r.finish({ committeeId, meetingDate, agenda });
  if (!parsed.ok || !committee || !meetingDate) return { ok: false, errors: r.errors };

  const roster = chosen.length ? await loadRoster(ORGANISATION_CODE) : null;
  let created: { id: string };
  try {
    created = await db.$transaction(
      async (tx) => {
        let reference = typed;
        if (!reference && usable) {
          const on = day!;
          reference = formatReference(usable, on, serialFor(usable, on));
          const next = afterIssuing(usable, on);
          await tx.numberingSeries.update({
            where: { id: usable.id },
            data: { nextSerial: next.nextSerial, serialPeriod: next.serialPeriod },
          });
        }
        const row = await tx.meeting.create({
          data: { committeeId: committee.id, reference: reference!, meetingDate, agenda },
        });
        await writeAudit(tx, { organisationId: orgId, entity: "Meeting", entityId: row.id, entityLabel: `${committee.nameEn} sitting`, reason: "" }, "CREATE",
          diffFields(null, { committee: committee.nameEn, meetingDate, agenda, reference: typed ?? "(from numbering)" }));
        if (chosen.length) await tableWaiting(tx, row.id, committee.code, chosen, tabledByPersonId, roster!);
        return row;
      },
      // An appointment's tabling reads the bids' and the evaluation's gates.
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    throw e;
  }

  refresh(created.id);
  return { ok: true };
}

/// A refusal found inside a transaction that has already written: thrown, so everything rolls back.
class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

/**
 * Table the chosen waiting items onto a sitting just created, in its transaction (founder, 2026-10-05). The sitting is
 * locked and re-read before each, so each takes the next agenda place; each item is read again from its route
 * (`loadWaiting` on this transaction) and must still be waiting for this committee and tabled at a sitting.
 */
async function tableWaiting(tx: Tx, meetingId: string, committeeCode: string, chosen: readonly string[], tabledByPersonId: string | null, roster: Awaited<ReturnType<typeof loadRoster>>) {
  const W = SCHEDULE_WORDS;
  const entries = (await loadWaiting(tx))?.entries ?? [];
  for (const stepId of chosen) {
    const e = entries.find((x) => x.stepId === stepId && x.committeeCode === committeeCode);
    const t = e?.tabling ?? null;
    const act = ACTS.find((a) => a === t?.act) ?? null;
    if (!e || !t || !act) throw new Refusal({ ok: false, message: W.noLongerWaiting.en });
    const s = await lockSittingIn(tx, meetingId, roster);
    if (!s) throw new Refusal(GONE);
    const refusal = permit(s, "TABLE");
    if (refusal) throw new Refusal(refusal);
    const r = new FormReader(new FormData());
    const done = await tableInto(tx, s, r, { subject: t.subject, domain: t.domain, matterKind: t.matterKind, matterRef: t.matterRef, amount: t.amount, act, tabledByPersonId, dependsOnDecisionId: null });
    if (done.ok) continue;
    const errors = done.errors ?? {};
    // Who tables is the drawer's own field: said there. Anything else names the item.
    if (errors.tabledByPersonId && Object.keys(errors).length === 1) throw new Refusal({ ok: false, errors: { tabledByPersonId: errors.tabledByPersonId } });
    const why = [done.message, ...Object.values(errors)].filter(Boolean).join(" ");
    throw new Refusal({ ok: false, message: W.itemRefused.en(`${WAITING_KIND_WORDS[e.kind].en} ${e.reference}`, why) });
  }
}

/// Edit a sitting's date and agenda. The date moves only before it starts.
export async function editSitting(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const meetingDate = r.date("meetingDate", "Date", { required: true });
  const agenda = r.text("agenda", "Agenda", { max: 4000 });

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "EDIT");
    if (refusal) return refusal;
    const m = s.meeting;
    if (meetingDate && m.status !== "SCHEDULED" && meetingDate.getTime() !== m.meetingDate.getTime()) {
      r.reject("meetingDate", "The date of a sitting that has started cannot change.");
    }
    const parsed = r.finish({ meetingDate, agenda });
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    await tx.meeting.update({ where: { id: m.id }, data: { meetingDate: meetingDate!, agenda } });
    await audit(tx, s, "Meeting", m.id, m.reference, "UPDATE",
      diffFields({ meetingDate: m.meetingDate, agenda: m.agenda }, { meetingDate, agenda }));
    return { ok: true };
  });
}

// ---------------------------------------------------------------- lifecycle

/**
 * Start, minute or cancel a sitting.
 *
 * Minuting also checks the register has no faults and every decided matter still
 * follows from it, and freezes the register as the sitting's snapshot: from then on
 * the sitting renders from what stood on the day, not from today's configuration.
 */
export async function changeStatus(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const to = String(data.get("to") ?? "") as MeetingStatus;
  const reason = String(data.get("reason") ?? "").trim();

  return inSitting(meetingId, async (tx, s) => {
    const m = s.meeting;
    const checks = minutingChecks(s.assessment, s.matters);
    const check = meetingTransition(m.status, to, {
      minutes: m.minutes,
      reason,
      // A matter withdrawn before the sitting opened is not on the agenda (6.10 follow-up).
      matterOutcomes: liveOutcomes(m.decisions),
      today: s.today,
      meetingDay: storedDay(m.meetingDate),
      ...checks,
    });
    if (!check.ok) {
      return check.fault === "REASON_REQUIRED"
        ? { ok: false, errors: { reason: TRANSITION_FAULT_MESSAGE.REASON_REQUIRED } }
        : { ok: false, message: TRANSITION_FAULT_MESSAGE[check.fault] };
    }

    const minutedAt = to === "MINUTED" ? new Date() : undefined;
    const registerSnapshot =
      to === "MINUTED"
        ? snapshotRegister(
            s.register,
            s.rules,
            s.committeeName,
            Object.fromEntries(
              [
                ...s.register.voting.map((v) => v.personId),
                ...s.register.alternates.map((v) => v.personId),
                ...s.register.nonVotingMemberIds,
                ...m.attendance.map((a) => a.personId),
              ]
                .filter((id): id is string => id != null)
                .map((id) => [id, s.names[id] ?? "Not on record"]),
            ),
          )
        : undefined;

    const after = {
      status: to,
      ...(to === "CANCELLED" ? { cancelledReason: reason } : {}),
      ...(minutedAt ? { minutedAt } : {}),
    };
    // Guarded on the status read under the lock, so a second transition cannot land.
    const moved = await tx.meeting.updateMany({
      where: { id: m.id, status: m.status },
      data: { ...after, ...(registerSnapshot ? { registerSnapshot: registerSnapshot as object } : {}) },
    });
    if (moved.count !== 1) return { ok: false, message: "The sitting changed while this was being saved. Reload and try again." };
    await audit(tx, s, "Meeting", m.id, m.reference, "UPDATE",
      // 68-C5: minutedAt is an instant, written on the organisation's clock (never renderValue's UTC day).
      diffFields({ status: m.status, cancelledReason: m.cancelledReason, minutedAt: m.minutedAt ? formatOrgDateTime(m.minutedAt, s.timeZone) : null }, { ...after, ...(minutedAt ? { minutedAt: formatOrgDateTime(minutedAt, s.timeZone) } : {}) }), reason);
    return { ok: true };
  });
}

export async function saveMinutes(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const minutes = r.text("minutes", "Minutes", { required: true, max: 20000 });
  const parsed = r.finish({ minutes });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "MINUTES");
    if (refusal) return refusal;
    const m = s.meeting;
    await tx.meeting.update({ where: { id: m.id }, data: { minutes } });
    await audit(tx, s, "Meeting", m.id, m.reference, "UPDATE", diffFields({ minutes: m.minutes }, { minutes }));
    return { ok: true };
  });
}

// --------------------------------------------------------------- attendance

/**
 * Record one person's attendance.
 *
 * The register is checked as it would stand after the change. The change is refused
 * where it would create a fault for anyone, make a vote already on record ineligible
 * (a vote cannot be withdrawn), or leave a decided matter no longer following from
 * the register.
 */
export async function recordAttendance(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const personId = r.text("personId", "Person", { required: true });
  const attended = r.choice("attended", "At this sitting", ["yes", "no"] as const, { required: true }) === "yes";
  const standingInForSeatId = attended ? r.optionalText("standingInForSeatId") : null;
  if (r.failed) return { ok: false, errors: r.errors };

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "ATTENDANCE");
    if (refusal) return refusal;

    const name = s.names[personId] ?? "This person";
    const role = registerRole(s.register, personId);
    if (role.kind === "CONTESTED") {
      return {
        ok: false,
        message: attendanceFaultText(name, "OFFICE_CONTESTED", {
          office: role.seat.officeLabel,
          holders: role.seat.contestedHolderIds.map((id) => s.names[id] ?? "Not on record"),
        }),
      };
    }
    if (role.kind === "NOT_A_MEMBER") {
      return { ok: false, errors: { personId: attendanceFaultText(name, "NOT_A_MEMBER") } };
    }

    const proposed = [
      ...s.meeting.attendance.filter((x) => x.personId !== personId),
      { personId, attended, standingInForSeatId },
    ];
    const change = checkAttendanceChange(s.register, s.rules, s.matters, proposed);
    if (!change.ok) {
      const subject = (id: string) => s.meeting.decisions.find((d) => d.id === id)?.subject ?? "a matter";
      const lines = [
        ...change.newFaults.map((f) => attendanceFaultText(s.names[f.personId] ?? "Someone", f.fault)),
        ...change.newlyIneligible.map(
          (v) => `${s.names[v.personId] ?? "Someone"} has voted on “${subject(v.matterId)}”, and that vote would no longer count. A vote cannot be withdrawn.`,
        ),
        ...(change.brokenDecisions.length === 0
          ? []
          : attended
            ? [
                // Ruling §9.1: a late arrival cannot be recorded until per-matter presence
                // exists; it goes in the minutes instead.
                `${name}'s arrival can't be recorded yet: ${change.brokenDecisions.map((id) => `“${subject(id)}”`).join(" and ")} ${change.brokenDecisions.length === 1 ? "is" : "are"} already decided, and presence per matter is not built, so recording it would count ${name} as present on a matter they did not vote on. Note the arrival in the minutes.`,
              ]
            : change.brokenDecisions.map((id) => `“${subject(id)}” is decided, and would no longer follow from the register.`)),
      ];
      return { ok: false, message: `This change is refused. ${lines.join(" ")}` };
    }

    const before = s.meeting.attendance.find((x) => x.personId === personId) ?? null;
    const row = await tx.meetingAttendance.upsert({
      where: { meetingId_personId: { meetingId, personId } },
      update: { attended, standingInForSeatId },
      create: { meetingId, personId, attended, standingInForSeatId },
    });
    await audit(tx, s, "MeetingAttendance", row.id, `${name} at ${s.meeting.reference}`, before ? "UPDATE" : "CREATE",
      diffFields(before && { attended: before.attended, standingInForSeatId: before.standingInForSeatId }, { attended, standingInForSeatId }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ matters

/**
 * Table a matter (FR-CTE-006).
 *
 * Only a holder of the committee's Secretariat office on the tabling day — today in
 * the organisation's zone, the same day the drawer offered its tablers from — and
 * the committee must have one set. An attestation until sign-in exists. Under the
 * sitting's lock, so a matter cannot be tabled onto a sitting being minuted.
 */
export async function tableMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const meetingId = String(data.get("meetingId") ?? "");
  const r = new FormReader(data);
  const subject = r.text("subject", "Subject", { required: true, max: 400 });
  const domain = r.text("domain", "Matter", { required: true, max: 60 });
  if (domain && !sittingTablesDomain(domain)) r.reject("domain", recordTabledText(domain) ?? RECORD_TABLED_DOMAIN_TEXT);
  const matterKind = r.choice("matterKind", "Record kind", SITTING_TABLED_MATTER_KINDS);
  // A kind tabled only from its record (scope, late tender admission) is refused naming where (6.6 CR-1).
  const kindTabledElsewhere = recordTabledText(String(data.get("matterKind") ?? ""));
  if (kindTabledElsewhere) r.reject("matterKind", kindTabledElsewhere);
  const matterRef = r.optionalText("matterRef");
  if (matterKind && !matterRef) r.reject("matterRef", "Give the reference of the record the matter concerns.");
  const amount = r.money("amount", "Amount");
  const act = r.choice("act", "Act", ACTS, { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  const dependsOnDecisionId = r.optionalText("dependsOnDecisionId");

  return inSitting(meetingId, async (tx, s) => {
    const refusal = permit(s, "TABLE");
    if (refusal) return refusal;
    return tableInto(tx, s, r, { subject, domain, matterKind, matterRef, amount, act, tabledByPersonId, dependsOnDecisionId });
  });
}

/// What the "Table a matter" writer is given: the drawer's fields, or a waiting route's own words (scheduleSitting).
interface TablingFields {
  subject: string;
  domain: string;
  matterKind: (typeof SITTING_TABLED_MATTER_KINDS)[number] | null;
  matterRef: string | null;
  amount: string | null;
  act: (typeof ACTS)[number] | null;
  tabledByPersonId: string | null;
  dependsOnDecisionId: string | null;
}

/**
 * The one writer of a matter tabled at a sitting, under the sitting's lock (the caller has taken it and asked
 * `permit`): the Secretariat's tabler, the record linked by its reference, the appointment's gates, the dependency,
 * then the row and its audit. A refusal is put on `r`'s fields and returned; nothing is written. Founder, 2026-10-05:
 * scheduling a sitting tables each waiting item it proposes through this same writer, so nothing is retyped.
 */
async function tableInto(tx: Tx, s: LoadedSitting, r: FormReader, input: TablingFields): Promise<FormState> {
  const { subject, domain, matterKind, matterRef, amount, act, tabledByPersonId, dependsOnDecisionId } = input;
  const meetingId = s.meeting.id;
  const code = s.meeting.committee.secretariatRoleCode;
  const holders = secretariatHoldersOn(s.roster, code, s.today).map((h) => h.id);
  const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: holders, tablingDay: s.today });
  if (!tabling.ok) {
    if (tabling.fault === "SECRETARIAT_NOT_SET" || tabling.fault === "TIME_ZONE_UNSET") {
      return { ok: false, message: TABLING_FAULT_MESSAGE[tabling.fault] };
    }
    r.reject("tabledByPersonId", TABLING_FAULT_MESSAGE[tabling.fault]);
  }
  // A requisition matter links to its requisition by the typed key (6.10 ruling), found
  // by the reference given: the portal's own, or the finance system's numbers.
  let requisitionId: string | null = null;
  let requisitionReference: string | null = null;
  if (matterKind === "REQUISITION" && matterRef) {
    // Two matches are refused as ambiguous, never picked between; a cancelled or
    // closed requisition takes nothing (ruling BD-18).
    const matches = await tx.requisition.findMany({
      where: { organisationId: s.organisationId, OR: [{ reference: matterRef }, { erpRequisitionNo: matterRef }, { erpNoteNo: matterRef }] },
      select: { id: true, status: true, reference: true },
      take: 2,
    });
    const found = resolveMatterRef(matches);
    requisitionReference = found.ok ? matches[0].reference : null;
    if (!found.ok) r.reject("matterRef", MATTER_REF_TEXT[found.fault]);
    requisitionId = found.ok ? found.requisitionId : null;
  }
  // An exercise matter links to its exercise the same way (6.11): by the exercise's
  // portal reference, exactly one, and not a cancelled one.
  let exerciseId: string | null = null;
  let exerciseReference: string | null = null;
  // 6.8 fix M-3: the evaluation version in force, its bundle checked, recorded on the appointment matter.
  let evaluationVersion: number | null = null;
  if (matterKind === "EXERCISE" && matterRef) {
    const matches = await tx.sourcingExercise.findMany({ where: { organisationId: s.organisationId, reference: matterRef }, select: { id: true, status: true, reference: true }, take: 2 });
    if (matches.length === 1 && matches[0].status !== "CANCELLED") {
      exerciseId = matches[0].id;
      exerciseReference = matches[0].reference;
    } else if (matches.length === 1) r.reject("matterRef", "That exercise is cancelled, so nothing can be tabled against it.");
    // 6.6 (OD-6, flagged): an appointment is not tabled while a late envelope on the exercise waits for
    // the committee's decision on admission. Read inside this transaction; the sitting's lock is held.
    if (exerciseId && domain === APPOINTMENT_DOMAIN) {
      const bids = await bidGate(exerciseId, tx);
      if (bids.lateFault) r.reject("matterRef", bidFindingText(bids.lateFault));
      // 6.8 (E-8, flagged): an exercise published through its window with a pinned model is appointed on
      // its issued, standing report and its Kertas Cadangan, checked and recommended. Others as before.
      // One read (6.8 re-review 1): the version recorded is the one whose bundle was checked.
      const gate = await loadEvaluationGate(exerciseId, tx);
      const bundle = bundleFaults(gate.bundle);
      if (bundle.length) r.reject("matterRef", bundle.map(evaluationFindingText).join(" "));
      else if (gate.bundle.applies) evaluationVersion = gate.version;
    }
    // No exercise has that reference: tabled as a manual matter, linked to no record, as before.
  }
  if (dependsOnDecisionId) {
    const dep = await tx.committeeDecision.findFirst({
      where: { id: dependsOnDecisionId, meeting: { committee: { organisationId: s.organisationId } } },
      select: { id: true },
    });
    if (!dep) r.reject("dependsOnDecisionId", "That matter no longer exists.");
  }

  const v = { subject, domain, matterKind, matterRef, amount, act, tabledByPersonId, dependsOnDecisionId };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const tabledAt = dayToDate(s.today!);
  const sequence = s.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
  const row = await tx.committeeDecision.create({
    data: { meetingId, subject, domain, matterKind, matterRef, requisitionId, exerciseId, amount, act: act!, tabledByPersonId, tabledAt, dependsOnDecisionId, sequence, evaluationVersion },
  });
  await audit(tx, s, "CommitteeDecision", row.id, subject, "CREATE",
    diffFields(null, { ...v, linkedRequisition: requisitionReference, linkedExercise: exerciseReference, tabledOnEvaluationVersion: evaluationVersion, tabledBy: tabledByPersonId ? s.names[tabledByPersonId] : null, tabledAt, sequence }));
  return { ok: true };
}

/// Declare a recusal on one matter. The member leaves that matter's vote and quorum.
export async function declareRecusal(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const meetingId = await meetingOf(decisionId);
  if (!meetingId) return { ok: false, message: "That matter no longer exists." };

  const r = new FormReader(data);
  const personId = r.text("personId", "Member", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };

  return inSitting(meetingId, async (tx, s) => {
    const decision = s.meeting.decisions.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, message: "That matter no longer exists." };
    const check = checkRecusal({
      meetingStatus: s.meeting.status,
      outcome: decision.outcome,
      role: registerRole(s.register, personId).kind,
      alreadyRecused: decision.recusals.some((x) => x.personId === personId),
      hasVoted: decision.votes.some((x) => x.personId === personId),
      withdrawn: decision.withdrawnAt != null,
    });
    if (!check.ok) {
      const message = {
        SITTING_CLOSED: CLOSED.message!,
        MATTER_DECIDED: "The matter has already been decided.",
        MATTER_WITHDRAWN: "The matter was withdrawn from the agenda.",
        NOT_A_VOTING_MEMBER: "Only a voting member or an alternate can declare a recusal.",
        ALREADY_RECUSED: "This member has already recused.",
        ALREADY_VOTED: "This member has already voted on the matter. A recusal is declared before voting, and a vote cannot be withdrawn.",
      }[check.fault];
      return check.fault === "SITTING_CLOSED" || check.fault === "MATTER_DECIDED" || check.fault === "MATTER_WITHDRAWN"
        ? { ok: false, message }
        : { ok: false, errors: { personId: message } };
    }
    // A holder's recusal excuses their seat: an alternate who has already voted in
    // it would lose that vote, and a vote cannot be withdrawn (acceptance send-back 1).
    const matter = s.matters.find((x) => x.id === decisionId)!;
    const change = checkRecusalChange(s.register, s.rules, matter, personId);
    if (!change.ok) {
      const who = change.newlyIneligible.map((p) => s.names[p] ?? "A member").join(" and ");
      return {
        ok: false,
        errors: {
          personId: `${who} ${change.newlyIneligible.length === 1 ? "has" : "have"} already voted in this member's seat on the matter, and that vote would no longer count. A recusal is declared before anyone votes in the seat.`,
        },
      };
    }
    const name = s.names[personId] ?? "Member";
    const row = await tx.decisionRecusal.create({ data: { decisionId, personId, reason, declaredAt: new Date() } });
    await audit(tx, s, "DecisionRecusal", row.id, `${name} on ${decision.subject}`, "CREATE", diffFields(null, { member: name, reason }));
    return { ok: true };
  });
}

/**
 * Record a matter's outcome.
 *
 * CARRIED and NOT_CARRIED must follow from the individual votes under the committee's
 * voting rule; NOT_CARRIED also needs one of its configured not-approved outcomes.
 * DEFERRED needs only a note. Re-assessed under the sitting's lock, so a vote landing
 * at the same moment is either counted or refused, and a second save on the same
 * matter finds it decided. The snapshot stores the count the matter's quorum was
 * judged on, the recusals among those present, the rule with its provenance, and the
 * outcome's name and kind.
 */
export async function recordOutcome(_prev: FormState, data: FormData): Promise<FormState> {
  // 6.8 fix R-9: the server's clock is read once, at the act's entry, truncated to the second (6.6 CR-3).
  const now = toSecond(new Date());
  const decisionId = String(data.get("decisionId") ?? "");
  const meetingId = await meetingOf(decisionId);
  if (!meetingId) return { ok: false, message: "That matter no longer exists." };
  const exerciseId = await appointmentExerciseOf(decisionId);
  const variation = exerciseId ? null : await variationMatterOf(decisionId);
  // Founder, 2026-10-05: the record whose approval the outcome may discharge, read without a lock, to know what to lock.
  const awardId = exerciseId ? await openAppointmentOf(exerciseId) : null;
  const record = exerciseId || variation ? null : await outcomeRecordOf(decisionId);

  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["CARRIED", "NOT_CARRIED", "DEFERRED"] as const, { required: true });
  const notApprovedOutcomeId = outcome === "NOT_CARRIED" ? r.optionalText("notApprovedOutcomeId") : null;
  const note = r.text("outcomeNote", "Note", { max: 2000 });
  if (r.failed || !outcome) return { ok: false, errors: r.errors };

  const run = async (tx: Tx, s: LoadedSitting): Promise<FormState> => {
    const refusal = permit(s, "OUTCOME");
    if (refusal) return refusal;
    const decision = s.meeting.decisions.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, message: "That matter no longer exists." };
    if (decision.outcome !== "PENDING") return { ok: false, message: "The matter has already been decided." };
    if (decision.withdrawnAt) return { ok: false, message: "The matter was withdrawn from the agenda: nothing is recorded on it." };
    // M-2: the exercise locked before the sitting is the matter's own (read again under the locks).
    if (decision.domain === APPOINTMENT_DOMAIN && decision.exerciseId !== exerciseId) return { ok: false, message: "The matter changed while this was being saved. Reload and try again." };
    // S-3d: the variation whose contract was locked and asked is still the matter's (read again under the locks).
    if (decision.variationId !== (variation?.id ?? null)) return { ok: false, message: "The matter changed while this was being saved. Reload and try again." };
    // Founder, 2026-10-05: the record locked before the sitting is still the matter's (read again under the locks).
    if (record && matterKey(decision) !== outcomeRecordKey(record)) return { ok: false, message: "The matter changed while this was being saved. Reload and try again." };

    const assessment = s.assessment.matters[decisionId];
    const check = checkOutcome(
      assessment,
      { outcome, notApprovedOutcomeId, note },
      { outcomes: s.outcomesAll, committeeId: s.meeting.committeeId, on: s.meeting.meetingDate },
    );
    if (!check.ok) {
      const field = ({ OUTCOME_REQUIRED: "notApprovedOutcomeId", OUTCOME_NOT_OFFERED: "notApprovedOutcomeId", NOTE_REQUIRED: "outcomeNote" } as Record<string, string>)[check.fault];
      if (field) return { ok: false, errors: { [field]: OUTCOME_FAULT_MESSAGE[check.fault] } };
      // Every refusal names what blocks it, not only that something does.
      if (check.fault === "MATTER_NOT_READY") {
        return { ok: false, message: `This matter cannot be decided yet. ${assessment.messageEn}` };
      }
      if (check.fault === "OUTCOME_CONTRADICTS_VOTES") {
        const came = assessment.computed === "CARRIED" ? "carried" : "not carried";
        return { ok: false, message: `That outcome does not follow from the votes recorded: they come to ${came}.` };
      }
      return { ok: false, message: OUTCOME_FAULT_MESSAGE[check.fault] };
    }

    const decided = outcome !== "DEFERRED";
    const chosen = notApprovedOutcomeId ? s.outcomesAll.find((o) => o.id === notApprovedOutcomeId) : undefined;
    const after = {
      outcome,
      decisionDate: s.meeting.meetingDate,
      outcomeNote: note,
      notApprovedOutcomeId,
      notApprovedOutcomeNameEn: chosen?.nameEn ?? null,
      notApprovedOutcomeKind: chosen?.kind ?? null,
      quorumRequired: s.rules.quorum,
      presentVoters: assessment.entitledIds.length,
      recusedCount: assessment.recusedPresentIds.length,
      votingRule: decided ? s.rules.votingRule : null,
      votingRuleProvenance: decided ? (s.rules.votingRuleProvenance as "STATED" | "OBSERVED" | "ASSUMED" | null) : null,
      alternateMayVoteForRecused: decided ? s.rules.alternateMayVoteForRecused : null,
    };
    // Guarded on PENDING as well as locked: exactly one outcome lands.
    const done = await tx.committeeDecision.updateMany({ where: { id: decisionId, outcome: "PENDING" }, data: after });
    if (done.count !== 1) return { ok: false, message: "The matter has already been decided." };
    await audit(tx, s, "CommitteeDecision", decisionId, decision.subject, "UPDATE",
      diffFields({ outcome: decision.outcome, decisionDate: decision.decisionDate, outcomeNote: decision.outcomeNote, notApprovedOutcomeId: decision.notApprovedOutcomeId }, after));
    // 6.8 (E-8, flagged): an appointment not carried, with a LOOP outcome whose key is the evaluation's,
    // opens the next evaluation version in this transaction. Locks (fix M-2): the exercise's, taken before
    // the sitting (inSittingAfterExercise), then the evaluations (lock.ts). Only for an exercise published
    // through its window with a pinned model.
    const said = outcome === "NOT_CARRIED" && decision.domain === APPOINTMENT_DOMAIN && decision.exerciseId ? await loopBack(tx, s, decision.exerciseId, decisionId, chosen ?? null, now) : null;
    return said ? { ok: true, message: said } : { ok: true };
  };
  return exerciseId
    ? inSittingAfterExercise(meetingId, exerciseId, run, awardId ? { awardId, decisionId } : null)
    : variation
      ? inSittingAfterContract(meetingId, variation, run, { decisionId, now })
      : record
        ? inSittingAfterRecord(meetingId, record, decisionId, now, run)
        : inSitting(meetingId, run);
}

/**
 * 6.8 E-8: the evaluation's loop-back on a NOT_CARRIED appointment; returns what to say, or null. Never
 * refuses. The caller holds requisition → exercise → window → openings → sitting (fix M-2); the
 * evaluations are locked here, last. `now` is the act's one clock read (fix R-9).
 */
async function loopBack(tx: Tx, s: LoadedSitting, exerciseId: string, decisionId: string, chosen: { kind: "LOOP" | "TERMINAL"; returnsToStage: string | null } | null, now: Date): Promise<string | null> {
  await lockEvaluationRows(tx, exerciseId);
  const ev = await loadEvaluationGate(exerciseId, tx);
  if (!ev.bundle.applies || ev.version == null) return null;
  const key = chosen?.returnsToStage ?? null;
  const lf = loopFault({ kind: chosen?.kind ?? null, key });
  if (lf || !isLoopKey(key)) return lf ? evaluationFindingText(lf) : null;
  // 6.8 fix M-3: a matter tabled on a version no longer in force opens nothing; the outcome stands as recorded.
  const tabled = s.meeting.decisions.find((d) => d.id === decisionId)?.evaluationVersion ?? null;
  const vf = tabledVersionFault({ applies: true, tabledOn: tabled, inForce: ev.version });
  if (vf) return evaluationFindingText({ ...vf, code: vf.code === "TABLED_ON_EARLIER_VERSION" ? "LOOP_ON_EARLIER_VERSION" : "LOOP_VERSION_NOT_RECORDED" });
  const ex = await tx.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { id: true, reference: true, title: true, status: true, regime: true, boundaryValue: true, boundaryOperator: true } });
  const v = await openNewVersion(tx, { organisationId: s.organisationId, exercise: ex, ceiling: ceilingOf(ex), today: s.today, timeZone: s.timeZone, now }, { trigger: "LOOP", decisionId, key, personId: null });
  return v ? `Evaluation version ${v} of ${ex.reference} is opened: ${LOOP_KEY_LABEL[key].toLowerCase()}.` : null;
}

/**
 * Withdraw a tabled matter from the agenda before the sitting opens (6.10 follow-up,
 * 6.11 BD-31), with a reason. The row is kept, the withdrawal audited; the matter is
 * then left out of the votes, the quorum and the minuting. Once the sitting is in
 * progress a pending matter is deferred instead, with a note.
 */
export async function withdrawMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const decisionId = String(data.get("decisionId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const meetingId = await meetingOf(decisionId);
  if (!meetingId) return { ok: false, message: "That matter no longer exists." };
  return inSitting(meetingId, async (tx, s) => {
    const decision = s.meeting.decisions.find((d) => d.id === decisionId);
    if (!decision) return { ok: false, message: "That matter no longer exists." };
    const cited = (await tx.approvalStep.count({ where: { committeeDecisionId: decision.id } })) > 0 || decision.requisitionGateId != null;
    const dependents = await tx.committeeDecision.count({ where: { dependsOnDecisionId: decision.id, withdrawnAt: null } });
    const fault = withdrawFault({ meetingStatus: s.meeting.status, outcome: decision.outcome, withdrawn: decision.withdrawnAt != null, cited, dependents, reason });
    if (fault) return fault === "REASON_REQUIRED" ? { ok: false, errors: { reason: WITHDRAW_FAULT_MESSAGE[fault] } } : { ok: false, message: WITHDRAW_FAULT_MESSAGE[fault] };
    const withdrawnAt = new Date();
    const moved = await tx.committeeDecision.updateMany({ where: { id: decision.id, outcome: "PENDING", withdrawnAt: null }, data: { withdrawnAt, withdrawnReason: reason } });
    if (moved.count !== 1) return { ok: false, message: "The matter changed while this was being saved. Reload and try again." };
    await audit(tx, s, "CommitteeDecision", decision.id, decision.subject, "UPDATE", diffFields({ withdrawnAt: null }, { withdrawnAt: formatOrgDateTime(withdrawnAt, s.timeZone), withdrawn: "from the agenda, before the sitting opened" }), reason);
    return { ok: true };
  });
}
