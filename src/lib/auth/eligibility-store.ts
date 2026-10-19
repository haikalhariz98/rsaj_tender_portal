import { AccountStatus } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { organisationDay } from "@/lib/dates";

import { eligiblePersonIds, type Candidate } from "./eligibility";
import { loadGrants } from "./permission-store";
import type { PermissionKey } from "./types";
import { inOrder } from "@/lib/series";

/**
 * Who could do an act that needs a permission, read from the database (Phase 2c): the people with an active sign-in account, judged by `eligiblePersonIds`.
 * Read in the caller's client, so inside a transaction it is what that transaction sees.
 */

export async function loadCandidates(client: Tx, organisationId: string): Promise<Candidate[]> {
  const accounts = await client.staffAccount.findMany({
    where: { organisationId, status: AccountStatus.ACTIVE, person: { isActive: true } },
    select: { personId: true, isAdministrator: true, person: { select: { roleAssignments: { select: { roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } } } } },
  });
  return accounts.map((a) => ({ personId: a.personId, isAdministrator: a.isAdministrator, assignments: a.person.roleAssignments }));
}

export async function eligibleFor(client: Tx, input: { organisationId: string; timeZone: string | null; now: Date }, key: PermissionKey): Promise<string[]> {
  const [candidates, grants] = await inOrder(() => loadCandidates(client, input.organisationId), () => loadGrants(client, input.organisationId));
  return eligiblePersonIds(key, candidates, grants, organisationDay(input.now, input.timeZone));
}
