import { db } from "@/lib/db";

import type { Roster } from "./roster";
import type { Assignment, Office, Person } from "./types";
import { issuedInForce } from "@/lib/authority/issue";

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
      where: { authorityMatrix: { organisationId: organisation.id, ...issuedInForce(new Date()) } },
      select: { proposerCode: true, approverCode: true, committeeCode: true },
    }),
    db.authorityRuleStep.findMany({
      where: {
        authorityRule: {
          authorityMatrix: { organisationId: organisation.id, ...issuedInForce(new Date()) },
        },
      },
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
      jobTitleMs: p.jobTitleMs,
      department: p.department,
      telephone: p.telephone,
      portalRoleCode: p.portalRoleCode,
      authorityLevel: p.authorityLevel,
      isAvailable: p.isAvailable,
      isActive: p.isActive,
    })),
    offices: offices.map((o) => ({
      id: o.id,
      code: o.code,
      nameEn: o.nameEn,
      nameMs: o.nameMs,
      isCommittee: o.isCommittee,
      workspace: o.workspace,
      authorityLevel: o.authorityLevel,
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

/**
 * The capability grid and the delegations, for the Permissions and Delegation tabs.
 *
 * Loaded apart from the roster because three of the four tabs do not need them, and
 * the tab component renders only the selected panel.
 */
export interface GrantsData {
  capabilities: {
    id: string;
    code: string;
    nameEn: string;
    nameMs: string | null;
    groupLabel: string;
    sortOrder: number;
  }[];
  grants: { capabilityId: string; roleCode: string }[];
}

export async function loadGrants(organisationCode: string): Promise<GrantsData> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return { capabilities: [], grants: [] };

  const capabilities = await db.capability.findMany({
    where: { organisationId: organisation.id },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    include: { roles: { select: { roleCode: true } } },
  });

  return {
    capabilities: capabilities.map((c) => ({
      id: c.id,
      code: c.code,
      nameEn: c.nameEn,
      nameMs: c.nameMs,
      groupLabel: c.groupLabel,
      sortOrder: c.sortOrder,
    })),
    grants: capabilities.flatMap((c) =>
      c.roles.map((r) => ({ capabilityId: c.id, roleCode: r.roleCode })),
    ),
  };
}

export interface StoredDelegation {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  roleCode: string;
  capabilityCodes: string[];
  valueCeiling: string | null;
  reason: string;
  reasonMs: string;
  noSubDelegation: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export async function loadDelegations(organisationCode: string): Promise<StoredDelegation[]> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return [];

  const rows = await db.delegation.findMany({
    where: { organisationId: organisation.id },
    orderBy: { effectiveFrom: "desc" },
  });

  return rows.map((d) => ({
    id: d.id,
    fromPersonId: d.fromPersonId,
    toPersonId: d.toPersonId,
    roleCode: d.roleCode,
    capabilityCodes: d.capabilityCodes,
    valueCeiling: d.valueCeiling?.toString() ?? null,
    reason: d.reason,
    reasonMs: d.reasonMs,
    noSubDelegation: d.noSubDelegation,
    effectiveFrom: d.effectiveFrom,
    effectiveTo: d.effectiveTo,
  }));
}
