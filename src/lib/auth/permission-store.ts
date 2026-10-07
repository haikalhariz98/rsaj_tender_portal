import type { Tx } from "@/lib/audit/record";
import { organisationDay } from "@/lib/dates";
import { inForceOn } from "@/lib/effective";

import { permissionRefusal, permissionState, resolvePermissions, type HeldAssignment, type PermissionState, type StoredGrant } from "./permissions";
import type { Office, PermissionKey } from "./types";
import type { Words } from "./words";

/**
 * Product permissions, read (ADR 0034 D8, Phase 2a). The pure rules are in `permissions.ts`; this reads what they judge, in the caller's
 * client: the organisation's decisions about roles, and the offices a person holds. Read again on every request, so a grant or an office that
 * ends takes effect at the next one.
 */

export async function loadGrants(client: Tx, organisationId: string): Promise<StoredGrant[]> {
  const rows = await client.rolePermission.findMany({ where: { organisationId }, select: { permissionKey: true, roleCode: true, decision: true } });
  return rows;
}

export async function loadAssignments(client: Tx, personId: string): Promise<HeldAssignment[]> {
  return client.roleAssignment.findMany({ where: { personId }, select: { roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } });
}

export interface HeldNow {
  offices: Office[];
  permissions: Set<PermissionKey>;
}

/// The offices a person holds on the organisation's today and the product permissions that follow, from one read of each. With no time zone
/// set, today is not known: no office is claimed and no role carries a permission (an administrator's flag still confers its own).
export async function heldNow(
  client: Tx,
  input: { organisationId: string; personId: string; isAdministrator: boolean; timeZone: string | null; now: Date },
): Promise<HeldNow> {
  const today = organisationDay(input.now, input.timeZone);
  const [assignments, grants] = await Promise.all([loadAssignments(client, input.personId), loadGrants(client, input.organisationId)]);
  const offices = today ? assignments.filter((a) => inForceOn(a, today)).map((a) => ({ roleCode: a.roleCode, scope: a.scope })) : [];
  return { offices, permissions: resolvePermissions({ isAdministrator: input.isAdministrator, assignments, grants, today }) };
}

/**
 * Why a person was refused a key, in words: read only on the refusal path. Names each role as the organisation names it, never by its code.
 */
export async function explainRefusal(
  client: Tx,
  input: { organisationId: string; personId: string; isAdministrator: boolean; timeZone: string | null; now: Date },
  key: PermissionKey,
): Promise<{ state: PermissionState; words: Words }> {
  const today = organisationDay(input.now, input.timeZone);
  const [assignments, grants, roles] = await Promise.all([
    loadAssignments(client, input.personId),
    loadGrants(client, input.organisationId),
    client.authorityRole.findMany({ where: { organisationId: input.organisationId }, select: { code: true, nameEn: true } }),
  ]);
  const names = new Map(roles.map((r) => [r.code, r.nameEn]));
  const state = permissionState(key, { isAdministrator: input.isAdministrator, assignments, grants, today });
  return { state, words: permissionRefusal(key, state, (code) => names.get(code) ?? "a role the organisation has retired") };
}
