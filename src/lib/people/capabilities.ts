/**
 * What each office may do, as opposed to what it approves.
 *
 * Approval routing comes from the authority matrix and answers "who signs this matter
 * at this value". A capability answers a different question, and the permissions grid
 * is the only place the two must not be confused.
 */

export interface Capability {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  groupLabel: string;
  sortOrder: number;
}

export interface Grant {
  capabilityId: string;
  roleCode: string;
}

/**
 * Whether an office holds a capability.
 *
 * Three states, not two. A grid that renders "nobody has decided yet" the same as a
 * deliberate refusal invites an officer to assume a permission was considered and
 * withheld, when in fact the column was never filled in.
 */
export type CapabilityState = "GRANTED" | "WITHHELD" | "UNDECIDED";

export interface CapabilityGroup {
  label: string;
  capabilities: Capability[];
}

/// Grouped for the grid, in configured order, groups in first-appearance order.
export function byGroup(capabilities: readonly Capability[]): CapabilityGroup[] {
  const ordered = [...capabilities].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: CapabilityGroup[] = [];

  for (const capability of ordered) {
    const label = capability.groupLabel || "Ungrouped";
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.capabilities.push(capability);
    else groups.push({ label, capabilities: [capability] });
  }
  return groups;
}

/// Offices that have had at least one decision recorded about them.
export function decidedRoles(grants: readonly Grant[]): Set<string> {
  return new Set(grants.map((g) => g.roleCode));
}

export function capabilityState(
  grants: readonly Grant[],
  roleCode: string,
  capabilityId: string,
  decided: ReadonlySet<string> = decidedRoles(grants),
): CapabilityState {
  const granted = grants.some((g) => g.roleCode === roleCode && g.capabilityId === capabilityId);
  if (granted) return "GRANTED";
  // An office nobody has granted anything is not an office refused everything.
  return decided.has(roleCode) ? "WITHHELD" : "UNDECIDED";
}

/**
 * Capabilities no office holds.
 *
 * Worth surfacing: a capability nobody can exercise is either an oversight or a
 * process the organisation does not actually perform, and only they can say which.
 */
export function unheldCapabilities(
  capabilities: readonly Capability[],
  grants: readonly Grant[],
): Capability[] {
  const held = new Set(grants.map((g) => g.capabilityId));
  return capabilities.filter((c) => !held.has(c.id));
}

/// How many capabilities an office holds, for the Roles list.
export function countFor(grants: readonly Grant[], roleCode: string): number {
  return grants.filter((g) => g.roleCode === roleCode).length;
}

/**
 * What a person may do, through every office they hold.
 *
 * The union across their offices, deduplicated: holding two offices that both grant
 * the same capability is one capability, not two. Order follows the configured order
 * so the drawer lists them the way the permissions grid does.
 */
export function capabilitiesForRoles(
  capabilities: readonly Capability[],
  grants: readonly Grant[],
  roleCodes: readonly string[],
): Capability[] {
  const codes = new Set(roleCodes.filter(Boolean));
  const held = new Set(grants.filter((g) => codes.has(g.roleCode)).map((g) => g.capabilityId));
  return [...capabilities]
    .filter((c) => held.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
}

/// The codes an office holds, for checking a delegation against them.
export function codesFor(
  capabilities: readonly Capability[],
  grants: readonly Grant[],
  roleCode: string,
): string[] {
  const ids = new Set(grants.filter((g) => g.roleCode === roleCode).map((g) => g.capabilityId));
  return capabilities.filter((c) => ids.has(c.id)).map((c) => c.code);
}
