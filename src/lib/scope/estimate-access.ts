import type { Tx } from "@/lib/audit/record";
import { estimateFigureAccess, type SulitDecision } from "@/lib/auth/sulit-access";
import { sulitActorOf, writeSulitEvents, type Reader } from "@/lib/auth/sulit-store";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";

import { custodyList, viewFault, type RoleHolding } from "./estimate";
import { loadScopePolicy } from "./repo";

/**
 * Who may read the company estimate's figure once it is disclosed (FR-EST-008, ADR 0012, Phase 3a). The rules are `custodyList` and `viewFault`
 * (`estimate.ts`); this reads what they judge: the organisation's custodian and audit offices (`ScopePolicy`), who holds them on the organisation's
 * day for the requesting unit, and the estimate's preparer.
 *
 * It decides; it never reads the figure. Before the opening discloses it, `viewFault` says SEALED to everyone and nobody is shown anything: the
 * sealed estimate stays sealed whoever is signed in. After, a reader is shown the figure if they are its preparer or hold the custodian or audit
 * office for the unit that asked for it. Either office unset, or no time zone to say which day's holders count, refuses and says which.
 */

export interface EstimateAccess {
  estimateId: string;
  /// The exercise's reference, for the log.
  reference: string;
  decision: SulitDecision;
}

/**
 * The reader's standing with the exercise's estimate, or null where the exercise has none that is not void. One estimate is not void at a time.
 * An administrator is refused whatever the custody: administration is kept apart from transactions.
 */
export async function estimateAccessFor(client: Tx, reader: Reader & { organisationTimeZone: string | null }, exerciseId: string, now: Date = new Date()): Promise<EstimateAccess | null> {
  const ex = await client.sourcingExercise.findFirst({
    where: { id: exerciseId, organisationId: reader.organisationId },
    select: {
      reference: true,
      requisition: { select: { sectionUnitCode: true, requestingUnitCode: true } },
      companyEstimates: { where: { state: { not: "VOID" } }, select: { id: true, state: true, preparerPersonId: true, currentVersionNo: true, classification: true }, take: 1 },
    },
  });
  const est = ex?.companyEstimates[0];
  if (!ex || !est) return null;
  const actor = sulitActorOf(reader);
  const done = (decision: SulitDecision): EstimateAccess => ({ estimateId: est.id, reference: ex.reference, decision });
  // Sealed first: the answer does not depend on who is asking, and no custody is read for it.
  if (est.state !== "DISCLOSED") return done(estimateFigureAccess(actor, "SEALED"));
  const today = todayIn(now, reader.organisationTimeZone);
  if (!today) return done(estimateFigureAccess(actor, "CUSTODY_DAY_UNKNOWN"));

  const policy = await loadScopePolicy(reader.organisationId, client);
  const custodian = policy.estimateCustodianRoleCode;
  const audit = policy.estimateAuditRoleCode;
  if (custodian == null || audit == null) return done(estimateFigureAccess(actor, "CUSTODY_NOT_SET"));

  const [assignments, units] = await Promise.all([
    client.roleAssignment.findMany({ where: { roleCode: { in: [custodian, audit] }, person: { organisationId: reader.organisationId } }, select: { personId: true, roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } }),
    client.orgUnit.findMany({ where: { organisationId: reader.organisationId } }),
  ]);
  const holders: RoleHolding[] = assignments.map((a) => ({ personId: a.personId, roleCode: a.roleCode, scope: a.scope, from: storedDay(a.effectiveFrom), to: a.effectiveTo ? storedDay(a.effectiveTo) : null }));
  // The unit that asked for the estimate: its section, else its requesting unit, up to the root. An office held for a department counts only on this path.
  const unit = ex.requisition.sectionUnitCode || ex.requisition.requestingUnitCode;
  const unitPath = pathTo(units as unknown as OrgUnit[], unit, dayToDate(today)).reverse().map((u) => u.code);
  const custody = custodyList({ estimateCustodianRoleCode: custodian, estimateAuditRoleCode: audit }, holders, est.preparerPersonId, today, unitPath);
  const fault = actor.personId ? viewFault(actor.personId, { state: est.state }, custody) : "NOT_IN_CUSTODY";
  return done(estimateFigureAccess(actor, fault));
}

/**
 * `estimateAccessFor`, and the access written to the log (NFR-AUD-004: shown or refused, both). If the log cannot be written nothing is shown: the
 * decision becomes "not logged". Null where the exercise has no estimate that is not void: nothing was asked of anyone, so nothing is logged.
 */
export async function loggedEstimateAccess(client: Tx, reader: Reader & { organisationTimeZone: string | null }, exerciseId: string, now: Date = new Date()): Promise<EstimateAccess | null> {
  const access = await estimateAccessFor(client, reader, exerciseId, now);
  if (!access) return null;
  try {
    await writeSulitEvents(client, reader, [{ scope: "exercise", entity: "CompanyEstimate", entityId: access.estimateId, entityLabel: access.reference, fields: ["companyEstimate"], decision: access.decision }]);
    return access;
  } catch (error) {
    console.error("The SULIT access log could not be written, so the company estimate is withheld:", error);
    return { ...access, decision: { state: "WITHHELD", basis: "NOT_LOGGED" } };
  }
}
