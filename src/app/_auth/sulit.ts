import { cache } from "react";

import { hiddenDecisionIds } from "@/lib/committee/hidden";
import { applyDecision, sulitWithheld, type Sulit, type SulitDecision } from "@/lib/auth/sulit-access";
import {
  decisionFor,
  decisionForFields,
  eventKey,
  exerciseAccessFacts,
  exerciseStanding,
  hiddenExerciseIds,
  organisationPermissionState,
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
  const rows: SulitEventRow[] = [];
  const decided = new Map<string, SulitDecision>();
  for (const e of exercises) {
    const f = facts.get(e.id);
    // An exercise that is not the organisation's is not read at all; a restricted one is judged as restricted.
    const decision: SulitDecision = f ? decisionFor(actor, scope, field, { restricted: f.restricted, named: f.named }, permission).decision : { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
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
  | { scope: "requisition" | "contract" | "supplier"; entity: string; id: string; label: string };

/**
 * One answer for each record, for several of its fields at once: `Sulit<true>`, granted with the basis or withheld with the reason in words. A screen that
 * shows a dozen figures of one evaluation asks once, then holds every figure to the answer (`through`), so a withheld record carries none of them. One
 * `SulitAccessEvent` is written per record and field set, allowed or refused, and written once within a request. If the log cannot be written nothing is
 * granted (NFR-AUD-004). The key of the map is the subject's id.
 */
export async function sulitGates(actor: StaffActor, subjects: readonly GateSubject[], fields: readonly string[]): Promise<Map<string, Sulit<true>>> {
  const out = new Map<string, Sulit<true>>();
  if (subjects.length === 0) return out;
  const exerciseIds = subjects.filter((x) => !("entity" in x)).map((x) => x.id);
  const [facts, permission] = await Promise.all([exerciseIds.length ? exerciseAccessFacts(db, actor.organisationId, exerciseIds) : Promise.resolve(new Map()), permissionOf(actor)]);
  const rows: SulitEventRow[] = [];
  const decided = new Map<string, SulitDecision>();
  for (const x of subjects) {
    if (!("entity" in x)) {
      const f = facts.get(x.id);
      const decision: SulitDecision = f ? decisionForFields(actor, x.scope, fields, { restricted: f.restricted, named: f.named }, permission).decision : { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
      decided.set(x.id, decision);
      if (f) rows.push({ scope: x.scope, entity: "SourcingExercise", entityId: x.id, entityLabel: x.label, fields: [...fields], decision });
    } else {
      const decision = decisionForFields(actor, x.scope, fields, { restricted: false, named: null }, permission).decision;
      decided.set(x.id, decision);
      rows.push({ scope: x.scope, entity: x.entity, entityId: x.id, entityLabel: x.label, fields: [...fields], decision });
    }
  }
  const logged = await log(actor, rows);
  for (const x of subjects) {
    const decision = decided.get(x.id)!;
    out.set(x.id, !logged ? sulitWithheld<true>("NOT_LOGGED", x.scope) : applyDecision(decision, x.scope, true as const));
  }
  return out;
}

export async function sulitGate(actor: StaffActor, subject: GateSubject, fields: readonly string[]): Promise<Sulit<true>> {
  return (await sulitGates(actor, [subject], fields)).get(subject.id)!;
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
  const row = await db.committeeDecision.findUnique({ where: { id: decisionId, meeting: { committee: { organisationId: actor.organisationId } } }, select: { exerciseId: true, bqVersion: { select: { exerciseId: true } }, bidEnvelope: { select: { exerciseId: true } }, evaluationBidder: { select: { evaluation: { select: { exerciseId: true } } } } } });
  const exerciseId = [row?.exerciseId, row?.bqVersion?.exerciseId, row?.bidEnvelope?.exerciseId, row?.evaluationBidder?.evaluation.exerciseId].find((id): id is string => !!id && restricted.includes(id));
  return exerciseId ? exerciseIsHidden(actor, exerciseId) : false;
}

/// Every restricted exercise of the actor's organisation, whoever may see it. A guard that logs a named reader's access as well as a refusal asks this and then
/// `exerciseIsHidden`, which decides and writes (FR-MTD-007).
export const restrictedExercises = (actor: Reader): Promise<string[]> => restrictedExerciseIds(db, actor.organisationId);
