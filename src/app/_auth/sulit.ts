import { cache } from "react";

import { matterAmountScope } from "@/lib/committee/matter-amount";
import type { MatterKind } from "@/lib/committee/labels";
import { hiddenDecisionIds } from "@/lib/committee/hidden";
import { creditorDecision, creditorNamedFacts, creditorPermissionState } from "@/lib/auth/creditor-access-store";
import { evaluationOfficeBases } from "@/lib/auth/evaluation-readers-store";
import { applyDecision, sulitWithheld, type EvaluationOfficeBasis, type RoutedNamedFacts, type Sulit, type SulitDecision } from "@/lib/auth/sulit-access";
import {
  decisionFor,
  decisionForFields,
  eventKey,
  exerciseAccessFacts,
  exerciseStanding,
  hiddenExerciseIds,
  organisationPermissionState,
  routedFromEntity,
  routedFromKey,
  routedNamedFacts,
  type RoutedFrom,
  recordAccessRow,
  restrictedExerciseIds,
  sulitActorOf,
  writeSulitEvents,
  type Reader,
  type SulitEventRow,
} from "@/lib/auth/sulit-store";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import type { SulitScope } from "@/lib/sulit-fields";

/**
 * SULIT and restricted exercises, as a page or an action meets them (ADR 0034 D14, Phase 3a). The rules are `src/lib/auth/sulit-access.ts`,
 * the reads and the log `src/lib/auth/sulit-store.ts`; this binds them to the signed-in actor and to the request.
 *
 * - `sulitExerciseValue(s)` gives a loader's answer, a `Sulit<T>`, for one field of exercises, and writes a `SulitAccessEvent` for it, allowed or
 *   refused. The value is read only where it is granted, so a withheld one never leaves the loader. If the access cannot be logged the value is
 *   withheld (NFR-AUD-004: no unlogged read).
 * - `exerciseIsHidden` is for a restricted exercise reached by its id: it says whether the actor may not see it, and logs the refusal. The caller
 *   answers as it answers an exercise that does not exist, in the same words.
 * - `hiddenExercises` is the list of ids a query leaves out (`exerciseNotHidden`).
 *
 * Within one request an event is written once: the same record, fields, outcome and basis (React's `cache()`, one set per request).
 */

const loggedThisRequest = cache(() => new Set<string>());
const permissionOf = cache((actor: StaffActor) => organisationPermissionState(db, actor));
const creditorPermissionOf = cache((actor: StaffActor) => creditorPermissionState(db, actor));

/// Write the events this request has not written yet. False where the log could not be written: the caller shows nothing.
async function log(actor: Reader, rows: SulitEventRow[]): Promise<boolean> {
  const seen = loggedThisRequest();
  const fresh = rows.filter((r) => !seen.has(eventKey(r)));
  if (fresh.length === 0) return true;
  try {
    await writeSulitEvents(db, actor, fresh);
    for (const r of fresh) seen.add(eventKey(r));
    return true;
  } catch (error) {
    console.error("The SULIT access log could not be written, so the values are withheld:", error);
    return false;
  }
}

export interface ExerciseRef {
  id: string;
  reference: string;
}

/**
 * One field of each of these exercises, as `Sulit<T>`. The facts of who is named are read once for all of them. `value` is called only for an
 * exercise where the field is granted. A row whose exercise is not in the actor's organisation is withheld (it is not theirs to read).
 */
export async function sulitExerciseValues<T>(actor: StaffActor, exercises: readonly ExerciseRef[], field: string, value: (id: string) => T, scope: SulitScope = "exercise"): Promise<Map<string, Sulit<T>>> {
  const out = new Map<string, Sulit<T>>();
  if (exercises.length === 0) return out;
  const [facts, permission] = await Promise.all([exerciseAccessFacts(db, actor.organisationId, exercises.map((e) => e.id)), permissionOf(actor)]);
  // The Secretariat and Internal Audit read the evaluation (ruling of 2026-10-08 on log line 1735): asked only for the evaluation scope, and for a person.
  const offices = scope === "evaluation" && !actor.system ? await evaluationOfficeBases(db, actor, exercises.map((e) => e.id)) : new Map<string, EvaluationOfficeBasis | null>();
  const rows: SulitEventRow[] = [];
  const decided = new Map<string, SulitDecision>();
  for (const e of exercises) {
    const f = facts.get(e.id);
    // An exercise that is not the organisation's is not read at all; a restricted one is judged as restricted.
    const decision: SulitDecision = f ? decisionFor(actor, scope, field, { restricted: f.restricted, named: f.named, evaluationOffice: offices.get(e.id) ?? null }, permission).decision : { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
    decided.set(e.id, decision);
    if (f) rows.push({ scope, entity: "SourcingExercise", entityId: e.id, entityLabel: e.reference, fields: [field], decision });
  }
  const logged = await log(actor, rows);
  for (const e of exercises) {
    const decision = decided.get(e.id)!;
    out.set(e.id, !logged ? sulitWithheld<T>("NOT_LOGGED", scope) : applyDecision(decision, scope, () => value(e.id)));
  }
  return out;
}

export async function sulitExerciseValue<T>(actor: StaffActor, exercise: ExerciseRef, field: string, value: T | (() => T), scope: SulitScope = "exercise"): Promise<Sulit<T>> {
  const got = await sulitExerciseValues(actor, [exercise], field, () => (typeof value === "function" ? (value as () => T)() : value), scope);
  return got.get(exercise.id)!;
}

/// What a gate is asked about: a record, and which scope's rule judges it. An exercise's (and its evaluation's) is judged by who is named on the exercise; the other
/// three keep no list of who is named, so only the organisation-wide permission opens them (ADR 0034 D14).
export type GateSubject =
  | { scope: "exercise" | "evaluation"; id: string; label: string }
  /// A supplier's creditor profile (Phase 4b): judged by the holders of the steps on its registration's route, the officer who checked it, and `sulit.read.creditorProfile`.
  | { scope: "creditorProfile"; id: string; label: string; supplierId: string; verifiedByPersonId: string | null }
  /// `routedFrom`: the route that names people on this record, where it is not the record itself (a committee matter is judged by the route or the requisition it decides). Not given: a
  /// requisition, a variation, a contract matter and a certificate are judged by their own route, and every other record names nobody.
  | { scope: "requisition" | "contract" | "supplier"; entity: string; id: string; label: string; routedFrom?: RoutedFrom | null };

/**
 * One answer for each record, for several of its fields at once: `Sulit<true>`, granted with the basis or withheld with the reason in words. A screen that
 * shows a dozen figures of one evaluation asks once, then holds every figure to the answer (`through`), so a withheld record carries none of them. One
 * `SulitAccessEvent` is written per record and field set, allowed or refused, and written once within a request. If the log cannot be written nothing is
 * granted (NFR-AUD-004). The key of the map is the subject's id.
 */
export async function sulitGates(actor: StaffActor, subjects: readonly GateSubject[], fields: readonly string[]): Promise<Map<string, Sulit<true>>> {
  const out = new Map<string, Sulit<true>>();
  if (subjects.length === 0) return out;
  const creditors = subjects.filter((x): x is Extract<GateSubject, { scope: "creditorProfile" }> => x.scope === "creditorProfile");
  const exerciseIds = subjects.filter((x) => x.scope !== "creditorProfile" && !("entity" in x)).map((x) => x.id);
  const fromOf = (x: GateSubject): RoutedFrom | null => ("entity" in x ? (x.routedFrom !== undefined ? x.routedFrom : routedFromEntity(x.entity, x.id)) : null);
  const froms = subjects.flatMap((x) => { const f = fromOf(x); return f ? [f] : []; });
  const evaluationIds = subjects.filter((x) => !("entity" in x) && x.scope === "evaluation").map((x) => x.id);
  const [creditorFacts, creditorPermission] = await Promise.all([creditors.length ? creditorNamedFacts(db, actor.organisationId, creditors) : Promise.resolve(new Map<string, RoutedNamedFacts>()), creditors.length && !actor.system ? creditorPermissionOf(actor) : Promise.resolve(null)]);
  const [offices, facts, permission, routed] = await Promise.all([
    evaluationIds.length && !actor.system ? evaluationOfficeBases(db, actor, evaluationIds) : Promise.resolve(new Map<string, EvaluationOfficeBasis | null>()),exerciseIds.length ? exerciseAccessFacts(db, actor.organisationId, exerciseIds) : Promise.resolve(new Map()), permissionOf(actor), froms.length ? routedNamedFacts(db, actor.organisationId, froms) : Promise.resolve(new Map<string, RoutedNamedFacts>())]);
  const rows: SulitEventRow[] = [];
  const decided = new Map<string, SulitDecision>();
  const routeStarted = new Map<string, boolean>();
  for (const x of subjects) {
    if (x.scope === "creditorProfile") {
      const named = creditorFacts.get(x.id);
      // A profile that is not the organisation's is not one anybody here is named on.
      const decision: SulitDecision = named && creditorPermission ? creditorDecision(actor, named, creditorPermission, fields) : { state: "WITHHELD", basis: actor.system ? "NOT_A_PERSON" : "FIELD_NOT_FOR_THIS_RECORD" };
      decided.set(x.id, decision);
      routeStarted.set(x.id, named?.routeStarted ?? false);
      rows.push({ scope: "creditorProfile", entity: "CreditorProfile", entityId: x.id, entityLabel: x.label, fields: [...fields], decision });
      continue;
    }
    if (!("entity" in x)) {
      const f = facts.get(x.id);
      const decision: SulitDecision = f ? decisionForFields(actor, x.scope, fields, { restricted: f.restricted, named: f.named, evaluationOffice: x.scope === "evaluation" ? (offices.get(x.id) ?? null) : null }, permission).decision : { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
      decided.set(x.id, decision);
      if (f) rows.push({ scope: x.scope, entity: "SourcingExercise", entityId: x.id, entityLabel: x.label, fields: [...fields], decision });
    } else {
      const from = fromOf(x);
      const decision = decisionForFields(actor, x.scope, fields, { restricted: false, named: null, routed: from ? (routed.get(routedFromKey(from)) ?? null) : null }, permission).decision;
      decided.set(x.id, decision);
      rows.push({ scope: x.scope, entity: x.entity, entityId: x.id, entityLabel: x.label, fields: [...fields], decision });
    }
  }
  const logged = await log(actor, rows);
  for (const x of subjects) {
    const decision = decided.get(x.id)!;
    out.set(x.id, !logged ? sulitWithheld<true>("NOT_LOGGED", x.scope, { routeStarted: routeStarted.get(x.id) ?? true }) : applyDecision(decision, x.scope, true as const, { routeStarted: routeStarted.get(x.id) ?? true }));
  }
  return out;
}

export async function sulitGate(actor: StaffActor, subject: GateSubject, fields: readonly string[]): Promise<Sulit<true>> {
  return (await sulitGates(actor, [subject], fields)).get(subject.id)!;
}

/**
 * The reader's standing with each committee matter's amount (Phase 3b). A matter's kind says whose figure its amount is (`matterAmountScope`): null where it is not SULIT
 * (the awarded value of an appointment), else a requisition's or a contract's, which only the organisation-wide permission opens. The map holds a gate for the matters whose
 * amount is SULIT and nothing for the others, which are shown as they are; a matter with no amount is not asked about.
 */
export async function sulitMatterAmounts(actor: StaffActor, matters: readonly { id: string; label: string; kind: MatterKind | null; hasAmount: boolean }[]): Promise<Map<string, Sulit<true>>> {
  const asked = matters.flatMap((m) => {
    const scope = m.hasAmount ? matterAmountScope(m.kind) : null;
    return scope ? [{ scope, entity: "CommitteeDecision", id: m.id, label: m.label }] : [];
  });
  if (asked.length === 0) return new Map();
  // The people who decide the route of the matter read its amount (ruling of 2026-10-08, the amendment of the ruling on log line 1526): a requisition's gate matter by the
  // requisition (its requester and the people of its route), a contract matter, a variation or a certificate by its own route, for its amount only. A matter with no route to follow
  // names nobody, and only the organisation-wide permission opens it.
  const links = await db.committeeDecision.findMany({ where: { id: { in: asked.map((a) => a.id) }, meeting: { committee: { organisationId: actor.organisationId } } }, select: { id: true, requisitionId: true, approvalStep: { select: { instanceId: true } } } });
  const linkOf = new Map(links.map((l) => [l.id, l]));
  return sulitGates(
    actor,
    asked.map((a): GateSubject => {
      const l = linkOf.get(a.id);
      const routedFrom: RoutedFrom | null = a.scope === "requisition" ? (l?.requisitionId ? { kind: "requisition", id: l.requisitionId } : l?.approvalStep ? { kind: "instance", id: l.approvalStep.instanceId } : null) : l?.approvalStep ? { kind: "instance", id: l.approvalStep.instanceId } : null;
      return { ...a, routedFrom };
    }),
    ["matterAmount"],
  );
}

/// `sulitGate` for an exercise (or its evaluation) named by its id: the reference is read for the log. An exercise that is not the organisation's is withheld.
export async function sulitExerciseGate(actor: StaffActor, exerciseId: string, scope: "exercise" | "evaluation", fields: readonly string[]): Promise<Sulit<true>> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: { reference: true } });
  if (!ex) return sulitWithheld<true>("FIELD_NOT_FOR_THIS_RECORD", scope);
  return sulitGate(actor, { scope, id: exerciseId, label: ex.reference }, fields);
}

/**
 * Whether a restricted exercise reached by its id is hidden from the actor (FR-MTD-007). True: answer "no longer exists", as for an id that is
 * not there. The refusal is logged. An exercise that does not exist, or is the organisation's and not restricted, is not hidden.
 */
export async function exerciseIsHidden(actor: Reader, exerciseId: string): Promise<boolean> {
  const standing = await exerciseStanding(db, actor, exerciseId);
  // An exercise that is not the organisation's, or is not restricted, is no SULIT record: nothing is asked and nothing is written.
  if (!standing || !standing.restricted || actor.system) return false;
  // Every access to a restricted exercise is logged, allowed or refused (FR-MTD-007). If an allowed one cannot be logged it is not allowed.
  const logged = await log(actor, [recordAccessRow(exerciseId, standing.reference, standing.visible, sulitActorOf(actor))]);
  return !standing.visible || !logged;
}

/**
 * Whether the amounts that add up a requisition's exercises may not be stated to the actor (ADR 0034 D14): one of the other exercises is restricted to
 * people the actor is not among, or its estimate is one they may not read. A total that includes it would give its estimate away by subtraction. Where
 * they are all readable the reading is logged, since the actor is shown the sums. One answer for the determination API and for the save actions' refusals.
 */
export async function siblingAmountsWithheld(actor: StaffActor, siblings: readonly ExerciseRef[]): Promise<boolean> {
  const hidden = await hiddenExercises(actor);
  const readable = await sulitExerciseValues(actor, siblings.filter((x) => !hidden.includes(x.id)), "estimatedValue", () => true);
  return siblings.some((x) => hidden.includes(x.id)) || [...readable.values()].some((v) => v.state === "WITHHELD");
}

/// The ids of the restricted exercises the actor may not see, for a list, a count, a feed or a search to leave out.
export const hiddenExercises = (actor: Reader): Promise<string[]> => hiddenExerciseIds(db, actor);

/**
 * Whether a tabled matter belongs to an exercise the actor may not see (the committee's votes and outcomes on it, read by its id). True: answer as for a
 * matter that does not exist. The refusal is logged against the exercise.
 */
export async function matterIsHidden(actor: Reader, decisionId: string): Promise<boolean> {
  const restricted = await restrictedExerciseIds(db, actor.organisationId);
  if (restricted.length === 0) return false;
  if ((await hiddenDecisionIds([decisionId], restricted)).size === 0) return false;
  const row = await db.committeeDecision.findUnique({ where: { id: decisionId, meeting: { committee: { organisationId: actor.organisationId } } }, select: { exerciseId: true, scopeExerciseId: true, bqVersion: { select: { exerciseId: true } }, bidEnvelope: { select: { exerciseId: true } }, evaluationBidder: { select: { evaluation: { select: { exerciseId: true } } } } } });
  const exerciseId = [row?.exerciseId, row?.bqVersion?.exerciseId, row?.scopeExerciseId, row?.bidEnvelope?.exerciseId, row?.evaluationBidder?.evaluation.exerciseId].find((id): id is string => !!id && restricted.includes(id));
  return exerciseId ? exerciseIsHidden(actor, exerciseId) : false;
}

/// Every restricted exercise of the actor's organisation, whoever may see it. A guard that logs a named reader's access as well as a refusal asks this and then
/// `exerciseIsHidden`, which decides and writes (FR-MTD-007).
export const restrictedExercises = (actor: Reader): Promise<string[]> => restrictedExerciseIds(db, actor.organisationId);
