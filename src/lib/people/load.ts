import { isLive } from "@/lib/documents/evidence";
import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import type { Roster } from "./roster";
import type { Assignment, Office, Person } from "./types";
import { loadIssue } from "@/lib/authority/load";
import { routedOffices } from "@/lib/authority/resolve";

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

/// `client` lets a write read the roster inside its own locked transaction.
export async function loadRoster(organisationCode: string, client: Tx = db): Promise<RosterData> {
  const organisation = await client.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return EMPTY;

  const [people, offices, issue] = await Promise.all([
    client.person.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { roleAssignments: true },
    }),
    client.authorityRole.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
    // The organisation's issue in force today, read as the resolver reads it, so an
    // office the core routing puts beneath an approver counts as routed (6.9 C3).
    loadIssue(organisationCode, new Date(), undefined, null, client),
  ]);

  const routed = new Set<string>(issue ? routedOffices(issue.matrix) : []);

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
      orgUnitCode: p.orgUnitCode,
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
  /// The jobholder whose authority is delegated; null on a delegation recorded before the superior rule (log line 1773).
  jobholderPersonId: string | null;
  toPersonId: string;
  roleCode: string;
  capabilityCodes: string[];
  valueCeiling: string | null;
  reason: string;
  reasonMs: string;
  noSubDelegation: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /// The absent holder's recommendation to re-delegate (FR-APR-012), as text.
  holderRecommendation?: string | null;
  holderRecommendedOn?: Date | null;
  /// Whether the signed recommendation is attached, live (OD-6).
  recommendationAttached?: boolean;
  /// Whether one was ever attached, live or not: one no longer attached reads so.
  recommendationEverAttached?: boolean;
  /// Marked by the migration: recorded as text before attachments existed. Read only.
  recommendationTextOnlyAtLanding?: boolean;
}

export async function loadDelegations(organisationCode: string, client: Tx = db): Promise<StoredDelegation[]> {
  const organisation = await client.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return [];

  const rows = await client.delegation.findMany({
    where: { organisationId: organisation.id },
    orderBy: { effectiveFrom: "desc" },
    include: { attachments: { where: { purpose: "HOLDER_RECOMMENDATION" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } },
  });

  return rows.map((d) => ({
    id: d.id,
    fromPersonId: d.fromPersonId,
    jobholderPersonId: d.jobholderPersonId,
    toPersonId: d.toPersonId,
    roleCode: d.roleCode,
    capabilityCodes: d.capabilityCodes,
    valueCeiling: d.valueCeiling?.toString() ?? null,
    reason: d.reason,
    reasonMs: d.reasonMs,
    noSubDelegation: d.noSubDelegation,
    effectiveFrom: d.effectiveFrom,
    effectiveTo: d.effectiveTo,
    holderRecommendation: d.holderRecommendation,
    holderRecommendedOn: d.holderRecommendedOn,
    recommendationAttached: d.attachments.some(isLive),
    recommendationEverAttached: d.attachments.length > 0,
    recommendationTextOnlyAtLanding: d.recommendationTextOnlyAtLanding,
  }));
}
