import type { Tx } from "@/lib/audit/record";

import { explainRefusal } from "./permission-store";
import type { PermissionState } from "./permissions";
import { routePeopleOf } from "./routed-people-store";
import { sulitAccessAll, type RoutedNamedFacts, type SulitDecision } from "./sulit-access";
import { decisionForFields, type SulitEventRow, type SulitReader } from "./sulit-store";
import type { SupplierActor } from "./types";
import { fieldsOfScope } from "@/lib/sulit-fields";

/**
 * Who may read a supplier's creditor profile, read (Phase 4b; ruling 6 of the CPD registration rulings, ADR 0034 D14). The rule is `sulitAccess` with the `creditorProfile` scope; this reads
 * the facts it judges, in the caller's client, and nothing is cached or kept as a list:
 *
 * - the holders of the steps, pending or decided, on the approval route of the supplier's registration (`routePeopleOf`, the same names the routes give everywhere else);
 * - the officer who checked this version of the profile;
 * - the staff the organisation has granted `sulit.read.creditorProfile` (undecided until it decides: refused, and said to be undecided).
 *
 * An administrator account is never entitled, and neither is a loader run. The supplier reads its own profile through its own session, never through this: `ownCreditorRow`.
 */

/// The names a creditor profile has, for each of these profiles: the holders and deciders of the supplier's registration routes, the verifier, and whether any route has been started.
export async function creditorNamedFacts(
  client: Tx,
  organisationId: string,
  asked: readonly { id: string; supplierId: string; verifiedByPersonId: string | null }[],
): Promise<Map<string, RoutedNamedFacts>> {
  const out = new Map<string, RoutedNamedFacts>();
  if (asked.length === 0) return out;
  // Whose profile it is, and who checked it, are read from the profile itself, in this organisation: a caller's pairing of a profile with a supplier is never trusted, and a profile that is
  // not this organisation's has no names at all (and so is withheld from everyone).
  const profiles = await client.creditorProfile.findMany({ where: { organisationId, id: { in: asked.map((p) => p.id) } }, select: { id: true, supplierId: true, verifiedByPersonId: true } });
  if (profiles.length === 0) return out;
  const supplierIds = [...new Set(profiles.map((p) => p.supplierId))];
  const routes = await routePeopleOf(client, organisationId, { supplierApplicationId: { not: null }, supplierApplication: { supplierId: { in: supplierIds } } });
  const owners = await client.supplierApplication.findMany({ where: { organisationId, supplierId: { in: supplierIds } }, select: { id: true, supplierId: true } });
  const supplierOfApplication = new Map(owners.map((a) => [a.id, a.supplierId]));
  for (const p of profiles) {
    const mine = routes.filter((r) => r.supplierApplicationId != null && supplierOfApplication.get(r.supplierApplicationId) === p.supplierId);
    out.set(p.id, {
      requesterId: null,
      stepHolderIds: [...new Set(mine.flatMap((r) => r.people.holderIds))],
      stepDeciderIds: [...new Set(mine.flatMap((r) => r.people.deciderIds))],
      verifierId: p.verifiedByPersonId,
      routeStarted: mine.length > 0,
    });
  }
  return out;
}

/// The state of `sulit.read.creditorProfile` for the actor, for the rule's last step.
export async function creditorPermissionState(client: Tx, actor: SulitReader): Promise<PermissionState> {
  if (actor.permissions.has("sulit.read.creditorProfile")) return { state: "ROLE", roleCodes: [] };
  if (actor.system) return { state: "UNDECIDED" };
  const { state } = await explainRefusal(client, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, "sulit.read.creditorProfile");
  return state;
}

/// The registered fields of a creditor profile, which a page that shows the whole profile asks about at once.
export const CREDITOR_PROFILE_FIELDS: readonly string[] = fieldsOfScope("creditorProfile");

/// The decision for a staff reader and these fields of one profile, from the facts read for it.
export function creditorDecision(actor: SulitReader, facts: RoutedNamedFacts | undefined, permission: PermissionState, fields: readonly string[] = CREDITOR_PROFILE_FIELDS): SulitDecision {
  return decisionForFields(actor, "creditorProfile", fields, { restricted: false, named: null, routed: facts ?? { requesterId: null, stepHolderIds: [], stepDeciderIds: [] } }, permission).decision;
}

/// The access log's row for a profile read, shown or refused.
export function creditorEventRow(profile: { id: string; label: string }, fields: readonly string[], decision: SulitDecision): SulitEventRow {
  return { scope: "creditorProfile", entity: "CreditorProfile", entityId: profile.id, entityLabel: profile.label, fields: [...fields], decision };
}

/// A signed-in supplier reading its own profile: always granted, as its own record, and always logged with the supplier's account as the actor.
export const OWN_RECORD: SulitDecision = { state: "GRANTED", basis: "OWN_RECORD" };

/// Write the supplier's own reading to the SULIT access log (NFR-AUD-004: every view is logged). The actor is the supplier's account, never a person.
export async function writeSupplierSulitEvent(client: Tx, actor: Pick<SupplierActor, "organisationId" | "accountId" | "sessionId" | "sourceAddress">, row: SulitEventRow): Promise<void> {
  if (row.fields.length === 0) throw new Error("A SULIT access event names the fields it was for.");
  await client.sulitAccessEvent.create({
    data: {
      organisationId: actor.organisationId,
      actorPersonId: null,
      actorSystemLabel: null,
      actorSupplierAccountId: actor.accountId,
      actorSessionId: actor.sessionId || null,
      sourceAddress: actor.sourceAddress,
      scope: row.scope,
      entity: row.entity,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      fields: row.fields,
      outcome: row.decision.state,
      basis: row.decision.basis,
    },
  });
}

/// The rule without a reader: for a test, and for a place that must say what an unnamed, ungranted reader is told.
export const creditorDecisionFor = (named: boolean, permission: PermissionState, isAdministrator = false): SulitDecision =>
  sulitAccessAll({ personId: "reader", isAdministrator, system: false }, { scope: "creditorProfile", restricted: false, named, organisationPermission: permission }, CREDITOR_PROFILE_FIELDS);
