import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { ceilingValue } from "@/lib/approvals/routed-value";
import { decisionOfExercisesWhere, DECISION_EXERCISE_SELECT, exerciseOfDecisionRow } from "@/lib/committee/hidden";
import { dayToDate, todayIn } from "@/lib/dates";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import type { Delegation } from "@/lib/people/delegation";
import type { Roster } from "@/lib/people/roster";
import { holdersFor, type Holders } from "@/lib/requisition/holders";
import { supplierHolders } from "@/lib/suppliers/route";

import { committeeRosterIds, routePeople, type NamingSeat, type RoutePeople } from "./routed-people";
import { inOrder } from "@/lib/series";

/**
 * Who a route names, read (product owner, 2026-10-08, rulings on log lines 1711 and the amendment of 1526). The rules are `routed-people.ts`; this reads what they judge,
 * in the caller's client, for several records at once so that a list does not ask once per row, and reads nothing it does not need: the roster, the delegations and the offices
 * are fetched only when some route in hand has a person's step pending, and then once.
 *
 * Nothing here is cached and nothing is copied into a list: it is worked out each time it is read.
 */

export interface RoutedInstance {
  instanceId: string;
  /// The exercise the route is on (a name's, a tender's, an appointment's, a special permission's), or null.
  exerciseId: string | null;
  /// The requisition the route is a requisition's own route of, or null.
  requisitionId: string | null;
  /// The contract matter the route decides, where it decides one.
  variationId: string | null;
  /// (named without the column's own key: a scan holds that key to the matter's one writer and its route)
  matterId: string | null;
  certificateId: string | null;
  /// The supplier's registration application the route decides, where it decides one (Phase 4b: a creditor profile is named by it).
  supplierApplicationId: string | null;
  /// The whole online application the route decides, where it decides one (ADR 0041 D5: its bank details are named by it).
  portalApplicationId: string | null;
  people: RoutePeople;
}

const unitsSelect = { sectionUnitCode: true, requestingUnitCode: true } as const;

/// The routes matching `where` (inside the organisation), with who each names today.
export async function routePeopleOf(client: Tx, organisationId: string, where: Prisma.ApprovalInstanceWhereInput, now: Date = new Date()): Promise<RoutedInstance[]> {
  const instances = await client.approvalInstance.findMany({
    where: { organisationId, AND: [where] },
    select: {
      id: true,
      status: true,
      value: true,
      requisitionId: true,
      exerciseId: true,
      variationId: true,
      contractMatterId: true,
      certificateId: true,
      supplierApplicationId: true,
      portalApplicationId: true,
      standingRequestId: true,
      specialPermissionId: true,
      specialPermission: { select: { exerciseId: true } },
      requisition: { select: unitsSelect },
      exercise: { select: { requisition: { select: unitsSelect } } },
      certificate: { select: { contract: { select: { award: { select: { exercise: { select: { requisition: { select: unitsSelect } } } } } } } } },
      variation: { select: { contract: { select: { award: { select: { exercise: { select: { requisition: { select: unitsSelect } } } } } } } } },
      contractMatter: { select: { contract: { select: { award: { select: { exercise: { select: { requisition: { select: unitsSelect } } } } } } } } },
      steps: { select: { sequence: true, decision: true, roleCode: true, actingRoleCode: true, committeeCode: true, nonDelegable: true, decidedByPersonId: true } },
    },
  });
  if (instances.length === 0) return [];

  const needsHolders = instances.some((i) => i.status === "PENDING" && i.steps.some((s) => s.decision === "PENDING" && !s.committeeCode));
  let holdersAt: ((officeCode: string, unit: string | null, supplier: boolean) => Holders | null) | null = null;
  let isActive: (personId: string) => boolean = () => true;
  if (needsHolders) {
    const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { timeZone: true } });
    const today = org ? todayIn(now, org.timeZone) : null;
    if (today) {
      const on = dayToDate(today);
      const [assignments, delegationRows, units, people] = await inOrder(
        () => client.roleAssignment.findMany({ where: { person: { organisationId } }, select: { id: true, personId: true, roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } }),
        () => client.delegation.findMany({ where: { organisationId }, select: { id: true, fromPersonId: true, jobholderPersonId: true, toPersonId: true, roleCode: true, capabilityCodes: true, valueCeiling: true, noSubDelegation: true, effectiveFrom: true, effectiveTo: true } }),
        () => client.orgUnit.findMany({ where: { organisationId } }),
        () => client.person.findMany({ where: { organisationId }, select: { id: true, isActive: true } }));
      // Holders are found by `holdersFor`, which reads only the assignments in force and the delegations: the rest of a roster is not needed.
      const roster = { people: [], offices: [], assignments } as unknown as Roster;
      const delegations: Delegation[] = delegationRows.map((d) => ({ id: d.id, fromPersonId: d.fromPersonId, jobholderPersonId: d.jobholderPersonId, toPersonId: d.toPersonId, roleCode: d.roleCode, capabilityCodes: d.capabilityCodes, valueCeiling: d.valueCeiling?.toString() ?? null, reason: "", reasonMs: "", noSubDelegation: d.noSubDelegation, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo }));
      const active = new Set(people.filter((p) => p.isActive).map((p) => p.id));
      isActive = (id) => active.has(id);
      holdersAt = (officeCode, unit, supplier) => {
        if (supplier) return supplierHolders(officeCode, roster, delegations, today);
        if (!unit) return null;
        const path = pathTo(units as unknown as OrgUnit[], unit, on).reverse().map((u) => u.code);
        return holdersFor(officeCode, path, roster, delegations, today);
      };
    }
  }

  return instances.map((i) => {
    const supplier = !!(i.supplierApplicationId || i.portalApplicationId || i.standingRequestId || i.specialPermissionId);
    const req = i.requisition ?? i.exercise?.requisition ?? i.certificate?.contract.award.exercise.requisition ?? i.variation?.contract.award.exercise.requisition ?? i.contractMatter?.contract.award.exercise.requisition ?? null;
    const unit = req ? req.sectionUnitCode || req.requestingUnitCode : null;
    const people = routePeople(
      { status: i.status, value: ceilingValue(i, supplier), steps: i.steps },
      (office) => (holdersAt ? holdersAt(office, unit, supplier) : null),
      isActive,
    );
    return { instanceId: i.id, exerciseId: i.exerciseId ?? i.specialPermission?.exerciseId ?? null, requisitionId: i.requisitionId, variationId: i.variationId, matterId: i.contractMatterId, certificateId: i.certificateId, supplierApplicationId: i.supplierApplicationId, portalApplicationId: i.portalApplicationId, people };
  });
}

/**
 * The members of the committees the matters of these exercises are tabled to, by exercise: each committee's roster in force on the sitting's date, from the tabling, and for good.
 * A matter names its exercise in one of four ways (`decisionOfExercisesWhere`); all are followed, in one query, and the committees' seats in one more.
 */
export async function committeeMembersOf(client: Tx, organisationId: string, exerciseIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (exerciseIds.length === 0) return out;
  const matters = await client.committeeDecision.findMany({
    where: { meeting: { committee: { organisationId } }, ...decisionOfExercisesWhere(exerciseIds) },
    select: { ...DECISION_EXERCISE_SELECT, meeting: { select: { committeeId: true, meetingDate: true } } },
  });
  if (matters.length === 0) return out;
  const committeeIds = [...new Set(matters.map((m) => m.meeting.committeeId))];
  const seatRows = await client.committeeMember.findMany({ where: { committeeId: { in: committeeIds } }, select: { committeeId: true, personId: true, seatRoleCode: true, effectiveFrom: true, effectiveTo: true } });
  const officeCodes = [...new Set(seatRows.flatMap((s) => (s.seatRoleCode ? [s.seatRoleCode] : [])))];
  const [assignments, people] = await inOrder(
    () => officeCodes.length ? client.roleAssignment.findMany({ where: { person: { organisationId }, roleCode: { in: officeCodes } }, select: { personId: true, roleCode: true, effectiveFrom: true, effectiveTo: true } }) : Promise.resolve([]),
    () => client.person.findMany({ where: { organisationId, isActive: true }, select: { id: true } }));
  const active = new Set(people.map((p) => p.id));
  const seatsOf = (committeeId: string): NamingSeat[] => seatRows.filter((s) => s.committeeId === committeeId);
  for (const m of matters) {
    const exerciseId = exerciseOfDecisionRow(m);
    if (!exerciseId || !exerciseIds.includes(exerciseId)) continue;
    const on = m.meeting.meetingDate;
    const ids = committeeRosterIds(seatsOf(m.meeting.committeeId), on, (officeCode) =>
      assignments.filter((a) => a.roleCode === officeCode && a.effectiveFrom <= on && (a.effectiveTo == null || a.effectiveTo > on) && active.has(a.personId)).map((a) => a.personId),
    ).filter((id) => active.has(id));
    out.set(exerciseId, [...new Set([...(out.get(exerciseId) ?? []), ...ids])]);
  }
  return out;
}
