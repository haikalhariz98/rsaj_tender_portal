import type { Tx } from "@/lib/audit/record";
import { todayIn } from "@/lib/dates";
import type { OrgScope } from "@/lib/org-scope";
import type { SulitScope } from "@/lib/sulit-fields";

import { explainRefusal } from "./permission-store";
import type { PermissionState } from "./permissions";
import { committeeMembersOf, routePeopleOf, type RoutedInstance } from "./routed-people-store";
import {
  exerciseVisible,
  namedOn,
  namingFault,
  NEVER_STORED_BASES,
  refusalWords,
  sulitAccess,
  sulitAccessAll,
  type EvaluationOfficeBasis,
  type ExerciseNamedFacts,
  type RoutedNamedFacts,
  type SulitActor,
  type SulitDecision,
} from "./sulit-access";
import type { StaffActor } from "./types";

/**
 * SULIT access and restricted exercises, read and written (ADR 0034 D14, Phase 3a). The rules are pure, in `sulit-access.ts`; this reads the
 * facts they judge, in the caller's client, and writes the access log.
 *
 * Nothing here is cached: a request that changes who is named (adding a participant) must see the change. The per-request de-duplication of the
 * access log is in `src/app/_auth/sulit.ts`, which wraps this with React's `cache()`.
 */

/// Whoever is reading: the organisation, and the person. A `StaffActor` is one. A loader run has no person (`system` is set).
export interface Viewer extends OrgScope {
  readonly personId: string;
  readonly isAdministrator: boolean;
  readonly system?: unknown;
}

/// A reader the rule can be asked about: one that can be written into the log and carries the permissions it holds. A `StaffActor` is one.
export type SulitReader = Reader & Pick<StaffActor, "permissions" | "organisationTimeZone">;

/// A reader that can also be written into the log: the viewer with its session and address. A `StaffActor` is one.
export type Reader = Viewer & Pick<StaffActor, "sessionId" | "sourceAddress"> & { readonly system?: { label: string } };

export const sulitActorOf = (v: Pick<Viewer, "personId" | "isAdministrator" | "system">): SulitActor => ({ personId: v.personId || null, isAdministrator: v.isAdministrator, system: !!v.system });

export interface ExerciseAccessFacts {
  id: string;
  reference: string;
  restricted: boolean;
  named: ExerciseNamedFacts;
}

/**
 * The people named on each of these exercises, read in one pass (organisation's rows only). An exercise that does not exist in the organisation
 * is simply absent from the answer. The roster is every person ever put on the exercise's evaluation team or opening panel, across all versions
 * and openings: being named is not undone by a later version.
 */
export async function exerciseAccessFacts(client: Tx, organisationId: string, ids: readonly string[]): Promise<Map<string, ExerciseAccessFacts>> {
  const out = new Map<string, ExerciseAccessFacts>();
  if (ids.length === 0) return out;
  const rows = await client.sourcingExercise.findMany({
    where: { id: { in: [...ids] }, organisationId },
    select: {
      id: true,
      reference: true,
      restricted: true,
      personInChargeId: true,
      proposalReviewerPersonId: true,
      participants: { select: { personId: true } },
      evaluations: { select: { team: { select: { personId: true } } } },
      openings: { select: { panel: { select: { personId: true } } } },
    },
  });
  // What the exercise's routes and sittings name, worked out now for all of the exercises at once (ruling of 2026-10-08 on log line 1711): never a list anyone keeps.
  const found = rows.map((r) => r.id);
  const [routes, committees] = await Promise.all([
    routePeopleOf(client, organisationId, { OR: [{ exerciseId: { in: found } }, { specialPermission: { exerciseId: { in: found } } }] }),
    committeeMembersOf(client, organisationId, found),
  ]);
  const routedOf = (exerciseId: string, pick: "holderIds" | "deciderIds") => [...new Set(routes.filter((x) => x.exerciseId === exerciseId).flatMap((x) => x.people[pick]))];
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      reference: r.reference,
      restricted: r.restricted,
      named: {
        participantIds: r.participants.map((p) => p.personId),
        personInChargeId: r.personInChargeId,
        proposalReviewerId: r.proposalReviewerPersonId,
        evaluationTeamIds: r.evaluations.flatMap((e) => e.team.map((m) => m.personId)),
        openingPanelIds: r.openings.flatMap((o) => o.panel.map((m) => m.personId)),
        stepHolderIds: routedOf(r.id, "holderIds"),
        stepDeciderIds: routedOf(r.id, "deciderIds"),
        committeeMemberIds: committees.get(r.id) ?? [],
      },
    });
  }
  return out;
}

/**
 * The restricted exercises of the viewer's organisation that the viewer may not see (FR-MTD-007). A list, a count, a feed or a search adds
 * `id: { notIn }` with this; nothing is named in the answer but ids. Empty for a loader run, which is the operator's own process.
 */
export async function hiddenExerciseIds(client: Tx, viewer: Viewer): Promise<string[]> {
  const actor = sulitActorOf(viewer);
  if (actor.system) return [];
  const restricted = await client.sourcingExercise.findMany({ where: { organisationId: viewer.organisationId, restricted: true }, select: { id: true } });
  if (restricted.length === 0) return [];
  const facts = await exerciseAccessFacts(client, viewer.organisationId, restricted.map((r) => r.id));
  return restricted.filter((r) => { const f = facts.get(r.id); return !f || !exerciseVisible(actor, f.restricted, f.named); }).map((r) => r.id);
}

/// The `where` fragment that leaves hidden exercises out of a query on the exercise table itself.
export const exerciseNotHidden = (hidden: readonly string[]): { id?: { notIn: string[] } } => (hidden.length ? { id: { notIn: [...hidden] } } : {});

/// The same, for a table that points at an exercise by `exerciseId` (a nullable pointer is left alone where it is null).
export const exerciseIdNotHidden = (hidden: readonly string[]): { OR?: [{ exerciseId: null }, { exerciseId: { notIn: string[] } }] } => (hidden.length ? { OR: [{ exerciseId: null }, { exerciseId: { notIn: [...hidden] } }] } : {});

/// The `where` fragment that leaves out the approval routes of hidden exercises: a route on an exercise (a name, an award), and a special permission
/// on one. A route behind a contract is the contract's and is not hidden here.
/// Written as a conjunction of "has none, or is not hidden" rather than a NOT, so that a route with no exercise (a requisition's) is kept: SQL's NOT of a
/// NULL is NULL, which would drop it.
export const approvalRouteNotHidden = (hidden: readonly string[]): { AND?: object[] } =>
  hidden.length
    ? {
        AND: [
          { OR: [{ exerciseId: null }, { exerciseId: { notIn: [...hidden] } }] },
          { OR: [{ award: { is: null } }, { award: { exerciseId: { notIn: [...hidden] } } }] },
          { OR: [{ specialPermission: { is: null } }, { specialPermission: { exerciseId: { notIn: [...hidden] } } }] },
        ],
      }
    : {};

/// Every restricted exercise of the organisation, whoever may see it: what a guard that must LOG a named reader's access too is asked about (FR-MTD-007: every access).
export async function restrictedExerciseIds(client: Tx, organisationId: string): Promise<string[]> {
  return (await client.sourcingExercise.findMany({ where: { organisationId, restricted: true }, select: { id: true } })).map((r) => r.id);
}

/// What the viewer's standing is with one exercise: null where it is not the organisation's, else its reference, whether it is restricted and whether the viewer may see it.
export async function exerciseStanding(client: Tx, viewer: Viewer, exerciseId: string): Promise<{ reference: string; restricted: boolean; visible: boolean } | null> {
  const facts = (await exerciseAccessFacts(client, viewer.organisationId, [exerciseId])).get(exerciseId);
  if (!facts) return null;
  return { reference: facts.reference, restricted: facts.restricted, visible: exerciseVisible(sulitActorOf(viewer), facts.restricted, facts.named) };
}

/// The log's row for a reader's access to a restricted exercise reached as a record, shown or refused.
export function recordAccessRow(exerciseId: string, reference: string, visible: boolean, actor: SulitActor): SulitEventRow {
  const decision: SulitDecision = visible ? { state: "GRANTED", basis: "NAMED_ON_RECORD" } : { state: "WITHHELD", basis: actor.isAdministrator ? "ADMINISTRATOR" : "RESTRICTED_NOT_NAMED" };
  return { scope: "exercise", entity: "SourcingExercise", entityId: exerciseId, entityLabel: reference, fields: ["record"], decision };
}

/// Whether this exercise exists in the organisation and the viewer may not see it. An exercise that does not exist is not "hidden": the
/// caller's own not-found handles it, in the same words.
export async function exerciseHiddenFrom(client: Tx, viewer: Viewer, exerciseId: string): Promise<boolean> {
  const actor = sulitActorOf(viewer);
  if (actor.system) return false;
  const facts = (await exerciseAccessFacts(client, viewer.organisationId, [exerciseId])).get(exerciseId);
  if (!facts) return false;
  return !exerciseVisible(actor, facts.restricted, facts.named);
}

/**
 * For a lock that must refuse a hidden exercise: whether the reader may not see it. The access to a restricted exercise is written to the log in the caller's
 * client whether it is allowed or refused (FR-MTD-007: every access is logged; a transaction that then returns "gone" commits the refusal). An exercise that is
 * not restricted is no SULIT record and writes nothing. The words an exercise that does not exist gets are the caller's own.
 */
export async function refuseHiddenExercise(client: Tx, reader: Reader, exerciseId: string): Promise<boolean> {
  const actor = sulitActorOf(reader);
  if (actor.system) return false;
  const standing = await exerciseStanding(client, reader, exerciseId);
  if (!standing || !standing.restricted) return false;
  await writeSulitEvents(client, reader, [recordAccessRow(exerciseId, standing.reference, standing.visible, actor)]);
  return !standing.visible;
}

/**
 * Whether the actor may name these people on this exercise, as a refusal in words, or null where they may (Phase 3a review; `namingFault`). Read in the
 * caller's client, so inside the act's transaction it sees who is named at that moment. Nothing is written: the act refuses before it changes anyone's access.
 * The permission is `sourcing.participants.manage`: undecided by default, so a person not named on an exercise cannot name anyone on it until the organisation decides.
 */
export async function namingRefusal(client: Tx, actor: StaffActor, exerciseId: string, targets: readonly string[], opts: { selfAllowed?: boolean } = {}): Promise<string | null> {
  const sulitActor = sulitActorOf(actor);
  if (sulitActor.system) return null;
  const facts = (await exerciseAccessFacts(client, actor.organisationId, [exerciseId])).get(exerciseId);
  const actorNamed = !!facts && namedOn("exercise", facts.named, sulitActor.personId).length > 0;
  const holdsPermission = actor.permissions.has("sourcing.participants.manage");
  const fault = namingFault({ actor: sulitActor, actorNamed, holdsPermission, targets, selfAllowed: opts.selfAllowed });
  if (!fault) return null;
  if (fault === "ADMINISTRATOR") return "An administrator account does not name people on an exercise: administration is kept apart from transactions.";
  if (fault === "SELF") return "You cannot name yourself on an exercise you are not named on: being named opens its classified figures. Ask someone named on it, or a holder of the permission to name people, to add you.";
  const { words } = await explainRefusal(client, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, "sourcing.participants.manage");
  return `Being named on an exercise opens its classified figures, so only someone already named on it may name others on it, or a holder of the permission to. You are not named on this one. ${words.en}`;
}

/// Whether the actor may name anyone else on this exercise, for a screen to offer or withhold the control: the refusal in words, or null. Not a person, so only the
/// actor's own standing is asked.
export const namingOthersRefusal = (client: Tx, actor: StaffActor, exerciseId: string): Promise<string | null> => namingRefusal(client, actor, exerciseId, ["someone else"]);

// ------------------------------------------------------------------ a requisition, or a contract matter, named by its route

/// The record whose approval route names people (ruling of 2026-10-08, the amendment of the 2026-10-06 ruling on log line 1526): a requisition (its requester and the people of its own
/// route), a variation, a certificate or a contract matter (the people of its route, for its amount only), or one route by its id.
export type RoutedFrom = { kind: "requisition" | "variation" | "contractMatter" | "certificate" | "instance"; id: string };
export const routedFromKey = (f: RoutedFrom): string => `${f.kind}:${f.id}`;

/// The route a gate's subject is judged by, from what the subject is: a requisition, a variation, a contract matter or a certificate named by its own id. The contract as a whole is none.
export function routedFromEntity(entity: string, id: string): RoutedFrom | null {
  switch (entity) {
    case "Requisition":
      return { kind: "requisition", id };
    case "Variation":
      return { kind: "variation", id };
    case "ContractMatter":
      return { kind: "contractMatter", id };
    case "Certificate":
      return { kind: "certificate", id };
    default:
      return null;
  }
}

/**
 * Who each of these records names by its route, worked out now, in one pass over the routes (never one query per record, never a list anyone keeps). The key is `routedFromKey`.
 * A requisition names its requester as well. Where nothing is named the entry holds empty lists, so a record the organisation does not own reads as naming nobody.
 */
export async function routedNamedFacts(client: Tx, organisationId: string, froms: readonly RoutedFrom[]): Promise<Map<string, RoutedNamedFacts>> {
  const out = new Map<string, RoutedNamedFacts>();
  const idsOf = (kind: RoutedFrom["kind"]) => [...new Set(froms.filter((f) => f.kind === kind).map((f) => f.id))];
  const requisitions = idsOf("requisition");
  const variations = idsOf("variation");
  const matters = idsOf("contractMatter");
  const certificates = idsOf("certificate");
  const instances = idsOf("instance");
  const or = [
    ...(requisitions.length ? [{ requisitionId: { in: requisitions } }] : []),
    ...(variations.length ? [{ variationId: { in: variations } }] : []),
    ...(matters.length ? [{ contractMatter: { id: { in: matters } } }] : []),
    ...(certificates.length ? [{ certificateId: { in: certificates } }] : []),
    ...(instances.length ? [{ id: { in: instances } }] : []),
  ];
  if (or.length === 0) return out;
  const [routes, requesters] = await Promise.all([
    routePeopleOf(client, organisationId, { OR: or }),
    requisitions.length ? client.requisition.findMany({ where: { id: { in: requisitions }, organisationId }, select: { id: true, requestingPersonId: true } }) : Promise.resolve([]),
  ]);
  const requesterOf = new Map(requesters.map((r) => [r.id, r.requestingPersonId]));
  const match = (f: RoutedFrom, r: RoutedInstance) =>
    f.kind === "requisition" ? r.requisitionId === f.id : f.kind === "variation" ? r.variationId === f.id : f.kind === "contractMatter" ? r.matterId === f.id : f.kind === "certificate" ? r.certificateId === f.id : r.instanceId === f.id;
  for (const f of froms) {
    const mine = routes.filter((r) => match(f, r));
    out.set(routedFromKey(f), {
      requesterId: f.kind === "requisition" ? (requesterOf.get(f.id) ?? null) : null,
      stepHolderIds: [...new Set(mine.flatMap((r) => r.people.holderIds))],
      stepDeciderIds: [...new Set(mine.flatMap((r) => r.people.deciderIds))],
    });
  }
  return out;
}

/// The state of `sulit.read.organisation` for the actor, for the rule's last step. Held through a role: no read of the explanation is needed.
export async function organisationPermissionState(client: Tx, actor: SulitReader): Promise<PermissionState> {
  if (actor.permissions.has("sulit.read.organisation")) return { state: "ROLE", roleCodes: [] };
  if (actor.system) return { state: "UNDECIDED" };
  const { state } = await explainRefusal(client, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, "sulit.read.organisation");
  return state;
}

/// The decision for a record of one scope, from the facts read for it.
export function decisionFor(actor: SulitReader, scope: SulitScope, field: string, record: { restricted: boolean; named: ExerciseNamedFacts | null; routed?: RoutedNamedFacts | null; evaluationOffice?: EvaluationOfficeBasis | null }, permission: PermissionState): { decision: SulitDecision; namedAs: ReturnType<typeof namedOn> } {
  const sulitActor = sulitActorOf(actor);
  const namedAs = namedOn(scope, record.named, sulitActor.personId, record.routed ?? null, [field]);
  return { decision: sulitAccess(sulitActor, { scope, restricted: record.restricted, named: namedAs.length > 0, organisationPermission: permission, evaluationOffice: record.evaluationOffice ?? null }, field), namedAs };
}

/// The decision for several fields of one record of one scope (a tab asks once for everything it shows from the record).
export function decisionForFields(actor: SulitReader, scope: SulitScope, fields: readonly string[], record: { restricted: boolean; named: ExerciseNamedFacts | null; routed?: RoutedNamedFacts | null; evaluationOffice?: EvaluationOfficeBasis | null }, permission: PermissionState): { decision: SulitDecision; namedAs: ReturnType<typeof namedOn> } {
  const sulitActor = sulitActorOf(actor);
  const namedAs = namedOn(scope, record.named, sulitActor.personId, record.routed ?? null, fields);
  return { decision: sulitAccessAll(sulitActor, { scope, restricted: record.restricted, named: namedAs.length > 0, organisationPermission: permission, evaluationOffice: record.evaluationOffice ?? null }, fields), namedAs };
}

// ------------------------------------------------------------------ the log

export interface SulitEventRow {
  scope: SulitScope;
  entity: string;
  entityId: string;
  entityLabel: string;
  /// The fields asked for (registry names), or "record" where the record itself was reached.
  fields: string[];
  decision: SulitDecision;
}

/// The key two identical events share, for de-duplicating within a request.
export const eventKey = (r: SulitEventRow): string => `${r.entity}|${r.entityId}|${[...r.fields].sort().join(",")}|${r.decision.state}|${r.decision.basis}`;

/**
 * Write the events: one row each, in one statement, in the caller's client. The actor is the signed-in person with their session and address, or a
 * loader run by its label. A basis that is never stored (the write failed) is refused here rather than at the database.
 */
export async function writeSulitEvents(client: Tx, actor: Reader, rows: readonly SulitEventRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    if (r.fields.length === 0) throw new Error("A SULIT access event names the fields it was for.");
    if (r.decision.state === "WITHHELD" && NEVER_STORED_BASES.includes(r.decision.basis)) throw new Error(`The basis ${r.decision.basis} is never stored.`);
  }
  await client.sulitAccessEvent.createMany({
    data: rows.map((r) => ({
      organisationId: actor.organisationId,
      actorPersonId: actor.system ? null : actor.personId,
      actorSystemLabel: actor.system ? actor.system.label : null,
      actorSessionId: actor.system ? null : actor.sessionId || null,
      sourceAddress: actor.sourceAddress,
      scope: r.scope,
      entity: r.entity,
      entityId: r.entityId,
      entityLabel: r.entityLabel,
      fields: r.fields,
      outcome: r.decision.state,
      basis: r.decision.basis,
    })),
  });
}

/**
 * Whether the actor may change what these fields of a record hold, inside the act's own transaction: a person who may not read a record's SULIT values may not
 * change them either, and is told why in words (the rule Phase 3a made for an exercise's estimate, carried to the evaluation and the rest). The access is written
 * to the log as a read is, allowed or refused; written in the act's transaction, so a refusal the act returns (not throws) is kept. Null where the actor may.
 * A loader run is the operator's own process and is let through without a row.
 */
export type WriteSubject =
  | { scope: "exercise" | "evaluation"; exerciseId: string }
  | { scope: "requisition" | "contract" | "supplier"; entity: string; id: string; label: string };

export async function sulitWriteRefusal(client: Tx, actor: SulitReader, subject: WriteSubject, fields: readonly string[]): Promise<string | null> {
  if (actor.system) return null;
  const permission = await organisationPermissionState(client, actor);
  let decision: SulitDecision;
  let row: SulitEventRow;
  if ("exerciseId" in subject) {
    const f = (await exerciseAccessFacts(client, actor.organisationId, [subject.exerciseId])).get(subject.exerciseId);
    // An exercise that is not the organisation's is no record of theirs: the act's own not-found handles it.
    if (!f) return null;
    decision = decisionForFields(actor, subject.scope, fields, { restricted: f.restricted, named: f.named }, permission).decision;
    row = { scope: subject.scope, entity: "SourcingExercise", entityId: f.id, entityLabel: f.reference, fields: [...fields], decision };
  } else {
    const from = routedFromEntity(subject.entity, subject.id);
    const routed = from ? ((await routedNamedFacts(client, actor.organisationId, [from])).get(routedFromKey(from)) ?? null) : null;
    decision = decisionForFields(actor, subject.scope, fields, { restricted: false, named: null, routed }, permission).decision;
    row = { scope: subject.scope, entity: subject.entity, entityId: subject.id, entityLabel: subject.label, fields: [...fields], decision };
  }
  await writeSulitEvents(client, actor, [row]);
  return decision.state === "WITHHELD" ? refusalWords(decision.basis, subject.scope).en : null;
}

/// The organisation's day is not known without a time zone: custody is judged on it, so an unset zone is said, not guessed.
export const organisationToday = (actor: Pick<StaffActor, "organisationTimeZone">, now: Date): string | null => todayIn(now, actor.organisationTimeZone);
