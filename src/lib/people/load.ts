import { db } from "@/lib/db";

import type { Roster } from "./roster";
import type { Assignment, Office, Person } from "./types";

/**
 * Load the roster.
 *
 * Every assignment is loaded, not only those in force today: resolving who held an
 * office when a past decision was taken needs the ones that have since ended.
 */
export interface RosterData extends Roster {
  people: Person[];
  offices: Office[];
  assignments: Assignment[];
  /// Office codes an approval rule actually routes to, which is what makes a vacancy
  /// blocking rather than merely untidy. Empty when no matrix is in force.
  routedToCodes: string[];
}

const EMPTY: RosterData = { people: [], offices: [], assignments: [], routedToCodes: [] };

export async function loadRoster(organisationCode: string): Promise<RosterData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return EMPTY;

  const [people, offices, rules, recommenders] = await Promise.all([
    db.person.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { roleAssignments: true },
    }),
    db.authorityRole.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
    db.authorityRule.findMany({
      where: { authorityMatrix: { organisationId: organisation.id } },
      select: { proposerCode: true, approverCode: true, committeeCode: true },
    }),
    db.authorityRuleStep.findMany({
      where: { authorityRule: { authorityMatrix: { organisationId: organisation.id } } },
      select: { roleCode: true },
    }),
  ]);

  const routed = new Set<string>();
  for (const rule of rules) {
    for (const code of [rule.proposerCode, rule.approverCode, rule.committeeCode]) {
      if (code) routed.add(code);
    }
  }
  for (const step of recommenders) routed.add(step.roleCode);

  return {
    people: people.map((p) => ({
      id: p.id,
      staffNo: p.staffNo,
      name: p.name,
      email: p.email,
      jobTitle: p.jobTitle,
      isActive: p.isActive,
    })),
    offices: offices.map((o) => ({
      id: o.id,
      code: o.code,
      nameEn: o.nameEn,
      nameMs: o.nameMs,
      isCommittee: o.isCommittee,
      escalatesToCode: o.escalatesToCode,
      selfApprovalEscalatesToCode: o.selfApprovalEscalatesToCode,
      sortOrder: o.sortOrder,
    })),
    assignments: people.flatMap((p) =>
      p.roleAssignments.map((a) => ({
        id: a.id,
        personId: a.personId,
        roleCode: a.roleCode,
        scope: a.scope,
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
      })),
    ),
    routedToCodes: [...routed],
  };
}
