import type { Tx } from "@/lib/audit/record";
import { todayIn } from "@/lib/dates";
import type { OrgScope } from "@/lib/org-scope";
import type { SulitScope } from "@/lib/sulit-fields";

import { explainRefusal } from "./permission-store";
import type { PermissionState } from "./permissions";
import {
  decide,
  exerciseVisible,
  namedOn,
  NEVER_STORED_BASES,
  type ExerciseNamedFacts,
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

/// Whether this exercise exists in the organisation and the viewer may not see it. An exercise that does not exist is not "hidden": the
/// caller's own not-found handles it, in the same words.
export async function exerciseHiddenFrom(client: Tx, viewer: Viewer, exerciseId: string): Promise<boolean> {
  const actor = sulitActorOf(viewer);
  if (actor.system) return false;
  const facts = (await exerciseAccessFacts(client, viewer.organisationId, [exerciseId])).get(exerciseId);
  if (!facts) return false;
  return !exerciseVisible(actor, facts.restricted, facts.named);
}

/// The state of `sulit.read.organisation` for the actor, for the rule's last step. Held through a role: no read of the explanation is needed.
export async function organisationPermissionState(client: Tx, actor: StaffActor): Promise<PermissionState> {
  if (actor.permissions.has("sulit.read.organisation")) return { state: "ROLE", roleCodes: [] };
  if (actor.system) return { state: "UNDECIDED" };
  const { state } = await explainRefusal(client, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, "sulit.read.organisation");
  return state;
}

/// The decision for a record of one scope, from the facts read for it.
export function decisionFor(actor: StaffActor, scope: SulitScope, record: { restricted: boolean; named: ExerciseNamedFacts | null }, permission: PermissionState): { decision: SulitDecision; namedAs: ReturnType<typeof namedOn> } {
  const sulitActor = sulitActorOf(actor);
  const namedAs = namedOn(scope, record.named, sulitActor.personId);
  return { decision: decide(sulitActor, { scope, restricted: record.restricted, named: namedAs.length > 0, organisationPermission: permission }), namedAs };
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
export async function writeSulitEvents(client: Tx, actor: StaffActor, rows: readonly SulitEventRow[]): Promise<void> {
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

/// The organisation's day is not known without a time zone: custody is judged on it, so an unset zone is said, not guessed.
export const organisationToday = (actor: Pick<StaffActor, "organisationTimeZone">, now: Date): string | null => todayIn(now, actor.organisationTimeZone);
